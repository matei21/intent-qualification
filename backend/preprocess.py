import ast
import hashlib
import json
import os
import pickle
import re
import sys

import numpy as np
import pandas as pd
from FlagEmbedding import BGEM3FlagModel
from keybert import KeyBERT
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, PointStruct, SparseIndexParams, SparseVector,
    SparseVectorParams, VectorParams,
)
from sklearn.feature_extraction.text import CountVectorizer, ENGLISH_STOP_WORDS

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    COLLECTIONS,
    COMPANIES_JSONL,
    COMPANIES_PARSED,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    NAICS_FILE,
    QDRANT_HOST,
    QDRANT_PORT,
)

EMBEDDINGS_CACHE = os.path.join(os.path.dirname(__file__), "..", "data", "embeddings_cache.pkl")
# Bump when the embedding-input format changes (model, KeyBERT params, etc.).
CACHE_VERSION = 5

BUSINESS_BOILERPLATE_STOPS = frozenset({
    "company", "companies", "corporation", "corp", "inc", "ltd", "llc",
    "specialized", "specializes", "specializing",
    "provides", "providing", "offers", "offering", "offered",
    "operates", "operations", "operating",
    "based", "headquartered", "founded", "established",
    "leading", "trusted", "global", "international", "worldwide",
    "dedicated", "focuses", "focused", "committed",
    "innovative", "modern", "advanced", "next-generation",
    "various", "diverse", "wide", "range",
    "including", "such", "well", "also",
    "manage", "manages", "managing", "managed", "management",
    "serve", "serves", "serving", "served",
    "develop", "develops", "developing", "developed",
    "client", "clients", "customer", "customers",
    "use", "uses", "using", "used",
})


def load_and_parse(path: str) -> pd.DataFrame:
    print("Loading companies.jsonl...")
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    df = pd.DataFrame(rows)

    def safe_parse(val):
        if val is None:
            return {}
        if isinstance(val, dict):
            return val
        try:
            if pd.isna(val):
                return {}
        except (TypeError, ValueError):
            pass
        if not isinstance(val, str):
            return {}
        try:
            parsed = ast.literal_eval(val)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    addr_parsed = df["address"].apply(safe_parse)
    df["country_code"] = addr_parsed.apply(lambda d: d.get("country_code"))
    df["region_name"] = addr_parsed.apply(lambda d: d.get("region_name"))
    df["town"] = addr_parsed.apply(lambda d: d.get("town"))
    df["latitude"] = addr_parsed.apply(lambda d: d.get("latitude"))
    df["longitude"] = addr_parsed.apply(lambda d: d.get("longitude"))

    naics_parsed = df["primary_naics"].apply(safe_parse)
    df["naics_code"] = naics_parsed.apply(lambda d: d.get("code"))
    df["naics_label"] = naics_parsed.apply(lambda d: d.get("label"))
    print(f"Loaded {len(df)} companies.")
    return df


def build_core_offerings_text(offerings) -> str:
    if not isinstance(offerings, list) or not offerings:
        return ""
    return ", ".join(offerings)


def build_description_text(desc) -> str:
    if not isinstance(desc, str):
        return ""
    return desc.strip()


_NAME_TOKEN_RE = re.compile(r"\w{2,}", re.UNICODE)


def _build_stopwords_for(name: str) -> list[str]:
    name_tokens = [t.lower() for t in _NAME_TOKEN_RE.findall(name or "")]
    return list(ENGLISH_STOP_WORDS) + list(BUSINESS_BOILERPLATE_STOPS) + name_tokens


def extract_description_keyphrases(
    kw_model: KeyBERT,
    descriptions: list[str],
    operational_names: list[str],
    top_n: int = 10,
) -> list[str]:
    print(f"Extracting top-{top_n} MMR-diversified KeyBERT keyphrases from "
          f"{len(descriptions)} descriptions...")
    out: list[str] = []
    for i, (d, name) in enumerate(zip(descriptions, operational_names)):
        if not d:
            out.append("")
            continue
        try:
            vectorizer = CountVectorizer(
                ngram_range=(1, 3),
                stop_words=_build_stopwords_for(name),
                token_pattern=r"(?u)\b[A-Za-z][A-Za-z\-]{1,}\b",
            )
            kps = kw_model.extract_keywords(
                d,
                vectorizer=vectorizer,
                use_mmr=True,
                diversity=0.7,
                top_n=top_n,
            )
            phrases = [p for p, _ in kps]
            out.append(", ".join(phrases))
        except ValueError:
            # Empty vocab after stop-listing — fall back to plain extraction.
            try:
                kps = kw_model.extract_keywords(
                    d,
                    keyphrase_ngram_range=(1, 2),
                    stop_words="english",
                    top_n=top_n,
                )
                out.append(", ".join(p for p, _ in kps))
            except Exception:
                out.append(d)
        except Exception as e:
            print(f"  [warn] KeyBERT failed on row {i} ({name!r}): {e}; falling back to raw prose")
            out.append(d)
        if (i + 1) % 50 == 0:
            print(f"  ... {i+1}/{len(descriptions)}")
    print(f"Done. Samples:")
    for i in range(min(3, len(out))):
        print(f"  [{operational_names[i]!r}] {out[i][:130]!r}")
    return out


def generate_hybrid_embeddings(model: BGEM3FlagModel, texts: list[str], desc: str):
    print(f"Embedding {desc} (dense + sparse)...")
    out = model.encode(
        texts,
        batch_size=12,
        max_length=8192,
        return_dense=True,
        return_sparse=True,
        return_colbert_vecs=False,
    )
    return out["dense_vecs"], out["lexical_weights"]


def sparse_to_qdrant(weights: dict) -> SparseVector:
    if not weights:
        return SparseVector(indices=[0], values=[0.0])
    indices = [int(k) for k in weights.keys()]
    values = [float(v) for v in weights.values()]
    return SparseVector(indices=indices, values=values)


def check_qdrant(client: QdrantClient):
    try:
        client.get_collections()
    except Exception as e:
        print(f"\nERROR: Cannot connect to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}")
        print("Start Qdrant first, e.g.:  docker run -p 6333:6333 qdrant/qdrant")
        raise SystemExit(1) from e


def setup_qdrant(client: QdrantClient):
    existing = {c.name for c in client.get_collections().collections}
    for stale in existing - set(COLLECTIONS):
        print(f"Dropping unused collection: {stale}")
        client.delete_collection(stale)

    for col in COLLECTIONS:
        existing = {c.name for c in client.get_collections().collections}
        if col in existing:
            print(f"Dropping existing collection: {col}")
            client.delete_collection(col)
        client.create_collection(
            collection_name=col,
            vectors_config={
                "dense": VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams(index=SparseIndexParams()),
            },
        )
        print(f"Created collection (hybrid): {col}")


def upsert_vectors(
    client: QdrantClient,
    collection: str,
    dense_vectors: np.ndarray,
    sparse_weights: list,
    df: pd.DataFrame,
):
    points = [
        PointStruct(
            id=int(i),
            vector={
                "dense": dense_vectors[i].tolist(),
                "sparse": sparse_to_qdrant(sparse_weights[i]),
            },
            payload={
                "operational_name": df.iloc[i]["operational_name"],
                "company_index": int(i),
            },
        )
        for i in range(len(df))
    ]
    batch_size = 100
    for start in range(0, len(points), batch_size):
        client.upsert(collection_name=collection, points=points[start:start + batch_size])
    print(f"Upserted {len(points)} hybrid vectors into '{collection}'")


def hash_inputs(*text_lists: list[str]) -> str:
    h = hashlib.sha256()
    for texts in text_lists:
        for t in texts:
            h.update(t.encode("utf-8"))
            h.update(b"\x00")
        h.update(b"|")
    return h.hexdigest()


def load_embeddings_cache(input_hash: str, n_rows: int) -> dict | None:
    if not os.path.exists(EMBEDDINGS_CACHE):
        return None
    with open(EMBEDDINGS_CACHE, "rb") as f:
        cache = pickle.load(f)
    if cache.get("version") != CACHE_VERSION:
        print("Cache version mismatch — recomputing embeddings.")
        return None
    if cache.get("n_rows") != n_rows:
        print("Cache row count mismatch — recomputing embeddings.")
        return None
    cached_hash = cache.get("input_hash")
    if cached_hash is None:
        print("[note] Cache lacks input_hash — accepting as-is.")
    elif cached_hash != input_hash:
        print("Cache input-content hash mismatch — source data changed; recomputing.")
        return None
    else:
        print("Found valid embeddings cache (hash verified) — skipping recomputation.")
    return cache


def save_embeddings_cache(
    input_hash, n_rows,
    emb_core_dense, emb_core_sparse,
    emb_desc_dense, emb_desc_sparse,
):
    os.makedirs(os.path.dirname(EMBEDDINGS_CACHE), exist_ok=True)
    with open(EMBEDDINGS_CACHE, "wb") as f:
        pickle.dump({
            "version": CACHE_VERSION,
            "n_rows": n_rows,
            "input_hash": input_hash,
            "emb_core_dense": emb_core_dense,
            "emb_core_sparse": emb_core_sparse,
            "emb_desc_dense": emb_desc_dense,
            "emb_desc_sparse": emb_desc_sparse,
        }, f)
    print(f"Saved hybrid embeddings cache to {EMBEDDINGS_CACHE}")


def main():
    client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    check_qdrant(client)

    df = load_and_parse(COMPANIES_JSONL)

    core_texts = df["core_offerings"].apply(build_core_offerings_text).tolist()
    raw_desc_texts = df["description"].apply(build_description_text).tolist()

    print("Loading KeyBERT model (small MiniLM backbone)...")
    kw_model = KeyBERT()  # default backend: all-MiniLM-L6-v2, fast on CPU
    operational_names = df["operational_name"].fillna("").astype(str).tolist()
    desc_keyphrase_texts = extract_description_keyphrases(
        kw_model, raw_desc_texts, operational_names,
    )

    input_hash = hash_inputs(core_texts, desc_keyphrase_texts)

    cache = load_embeddings_cache(input_hash, len(df))
    if cache and cache.get("version") == CACHE_VERSION and "emb_core_dense" in cache:
        emb_core_dense = cache["emb_core_dense"]
        emb_core_sparse = cache["emb_core_sparse"]
        emb_desc_dense = cache["emb_desc_dense"]
        emb_desc_sparse = cache["emb_desc_sparse"]
    else:
        print(f"Loading embedding model: {EMBEDDING_MODEL} (hybrid mode)")
        model = BGEM3FlagModel(EMBEDDING_MODEL, use_fp16=False)

        emb_core_dense, emb_core_sparse = generate_hybrid_embeddings(
            model, core_texts, "core_offerings",
        )
        emb_desc_dense, emb_desc_sparse = generate_hybrid_embeddings(
            model, desc_keyphrase_texts, "description (KeyBERT keyphrases)",
        )

        save_embeddings_cache(
            input_hash, len(df),
            emb_core_dense, emb_core_sparse,
            emb_desc_dense, emb_desc_sparse,
        )

    setup_qdrant(client)
    upsert_vectors(client, "core_offerings", emb_core_dense, emb_core_sparse, df)
    upsert_vectors(client, "description", emb_desc_dense, emb_desc_sparse, df)

    os.makedirs(os.path.dirname(COMPANIES_PARSED), exist_ok=True)
    with open(COMPANIES_PARSED, "wb") as f:
        pickle.dump(df, f)
    print(f"Saved parsed DataFrame to {COMPANIES_PARSED}")

    unique_naics = sorted(df["naics_label"].dropna().unique().tolist())
    with open(NAICS_FILE, "w", encoding="utf-8") as f:
        for label in unique_naics:
            f.write(label + "\n")
    print(f"Wrote {len(unique_naics)} NAICS labels to {NAICS_FILE}")
    print("Preprocessing complete.")


if __name__ == "__main__":
    main()
