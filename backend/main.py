import json
import math
import os
import pickle
import sys
import time
import traceback
from collections import Counter
from contextlib import asynccontextmanager
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from FlagEmbedding import BGEM3FlagModel
from openai import OpenAI
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import Filter, HasIdCondition, SparseVector

sys.path.insert(0, os.path.dirname(__file__))
from config import (
    COMPANIES_PARSED, DENSE_SAFETY_NET, NAICS_BYPASS_THRESHOLD,
    EMBEDDING_MODEL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL,
    LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
    QDRANT_HOST, QDRANT_PORT, SCORE_THRESHOLD, SCORE_WEIGHTS,
    SIMILARITY_THRESHOLD, TOP_K_VECTORS,
)

# Bump when build_system_prompt or enum lists change to invalidate Groq's prompt cache.
PROMPT_VERSION = "2026-05-26.v6"

CATEGORICAL_FILTER_KEYS = (
    "naics_labels", "target_markets", "business_models",
)
HARD_FILTER_KEYS = (
    "country_codes", "is_public",
    "revenue_min", "revenue_max",
    "employee_count_min", "employee_count_max",
    "year_founded_min", "year_founded_max",
)


def weighted_total(scores: dict) -> float:
    return sum(scores.get(k, 0.0) * w for k, w in SCORE_WEIGHTS.items())


state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not LLM_API_KEY:
        raise RuntimeError(
            "LLM_API_KEY (or GROQ_API_KEY) is not set. Export it before starting the backend."
        )

    print("Loading companies DataFrame...")
    with open(COMPANIES_PARSED, "rb") as f:
        state["df"] = pickle.load(f)
    df: pd.DataFrame = state["df"]
    print(f"Loaded {len(df)} companies.")

    print(f"Loading embedding model (hybrid): {EMBEDDING_MODEL}")
    state["model"] = BGEM3FlagModel(EMBEDDING_MODEL, use_fp16=False)

    state["qdrant"] = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
    state["llm"] = OpenAI(api_key=LLM_API_KEY, base_url=LLM_BASE_URL)
    # Reranker is loaded lazily on first use (it's ~568M params, adds ~30s
    # to cold start). state["reranker"] is None until the first query with
    # use_reranker=true arrives.
    state["reranker"] = None

    state["langfuse"] = None
    if LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY:
        try:
            from langfuse import Langfuse

            lf = Langfuse(
                public_key=LANGFUSE_PUBLIC_KEY,
                secret_key=LANGFUSE_SECRET_KEY,
                host=LANGFUSE_HOST,
            )
            if hasattr(lf, "start_observation"):
                state["langfuse"] = lf
                print(f"Langfuse tracing enabled -> {LANGFUSE_HOST}")
            else:
                print("Langfuse installed but incompatible API. Tracing disabled.")
        except Exception as e:
            print(f"Langfuse tracing disabled (failed to initialize: {e})")
    else:
        print("Langfuse tracing disabled (add LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY to .env to enable).")

    state["naics_labels"] = sorted(df["naics_label"].dropna().unique().tolist())
    state["country_codes"] = sorted(df["country_code"].dropna().unique().tolist())
    state["business_models"] = sorted(
        {bm for bms in df["business_model"].dropna()
            for bm in (bms if isinstance(bms, list) else [])}
    )

    # Singletons (appear on only 1 company) are dropped — they match nothing useful and bloat the prompt.
    tm_freq = Counter(
        tm for tms in df["target_markets"].dropna()
        for tm in (tms if isinstance(tms, list) else [])
    )
    state["target_markets_all"] = sorted([tm for tm, c in tm_freq.items() if c >= 2])

    state["llm_system_prompt"] = build_system_prompt(
        state["country_codes"], state["business_models"],
        state["target_markets_all"], state["naics_labels"],
    )

    state["all_indices"] = set(range(len(df)))

    sp_chars = len(state["llm_system_prompt"])
    sp_approx_tokens = sp_chars // 4
    print(f"System prompt: {sp_chars} chars (~{sp_approx_tokens} tokens). "
          f"Cache key is stable across requests (version={PROMPT_VERSION}).")
    print(f"Filters: {len(state['country_codes'])} countries, "
          f"{len(state['business_models'])} business models, "
          f"{len(state['naics_labels'])} NAICS labels, "
          f"{len(state['target_markets_all'])} target markets (freq>=2; "
          f"{sum(1 for c in tm_freq.values() if c < 2)} singletons dropped).")
    print("Backend ready.")
    yield
    state.clear()


app = FastAPI(title="Company Qualifier", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    use_reranker: bool = False


def build_system_prompt(countries, biz_models, target_markets, naics_labels) -> str:
    return f"""[prompt-version: {PROMPT_VERSION}]
You convert a natural-language company search query into TWO outputs.

Output JSON shape (ALWAYS exactly this shape, both keys present):
{{
  "structured_filters": {{ ... }},
  "semantic_query": "..."
}}

PART 1 — structured_filters

GROUP A — HARD CONSTRAINTS (only include when the query EXPLICITLY states them;
OMIT the field entirely otherwise — do NOT default to 0 or false):
- country_codes: list[str], values MUST come from this list: {json.dumps(countries)}
- revenue_min, revenue_max: USD numbers (e.g. "$50M" -> 50000000)
- employee_count_min, employee_count_max: numbers
- year_founded_min, year_founded_max: 4-digit years
- is_public: true | false  (ONLY include if the query says "public" or "private")

GROUP B — CATEGORICAL FILTERS (the topic of the query; extract exhaustively):
- naics_labels: list[str], values MUST come from this exact list: {json.dumps(naics_labels)}
- business_models: list[str], values MUST come from: {json.dumps(biz_models)}
- target_markets: list[str], values MUST come from: {json.dumps(target_markets)}

A company enters the candidate pool if it matches AT LEAST ONE categorical value.
Be EXHAUSTIVE for naics_labels and target_markets — pick every label that plausibly
fits the query; missing values silently kill recall; extras are filtered by dense ranking.
Be STRICT for business_models — they are generic and over-inclusion floods the pool.
Only include business_models the query EXPLICITLY names or strongly implies.

EXTRACTION RULES

Country mapping — ISO 3166-1 alpha-2, only from the allowed list above:
- "Scandinavia" -> ["se","no","dk","fi"]
- "Nordic" -> ["se","no","dk","fi","is"]
- "Europe" -> ["at","be","ch","de","dk","es","fi","fr","gb","gr","hr","ie","is","it","lt","lu","nl","no","pl","pt","ro","se","ua"]
- "EU" -> ["at","be","de","dk","es","fi","fr","gr","hr","ie","it","lt","lu","nl","pl","pt","ro","se"]
- "Benelux" -> ["be","nl","lu"]
- "North America" -> ["us","ca"]
- "Asia" -> ["cn","in","jp","kr","sg","tw","hk","id","vn"]
- "APAC" -> ["cn","in","jp","kr","sg","tw","hk","id","vn","au","nz"]
- "Latin America" -> ["ar","br","cl"]
- "Middle East" -> ["kw","tr","eg"]

Business-model hints (canonical values, never invent):
- "B2B"/"enterprise" -> "Business-to-Business"
- "B2C"/"DTC" -> "Business-to-Consumer"
- "SaaS" -> "Software-as-a-Service"
- "subscription" -> "Subscription-Based"
- "e-commerce" -> "E-commerce"
- "non-profit"/"NGO" -> "Non-Profit/Non-Governmental Organization"
- "logistics companies" -> "Logistics/Transportation"
- "manufacturers" -> "Manufacturing"

naics_labels — CRITICAL: select ONLY values from the list above; do NOT invent labels.
Real queries almost always span 3-8 codes. Walk the list and include every label that
could plausibly classify a company matching the query.

Numeric:
- "over $50M" -> revenue_min: 50000000
- "fewer than 200 employees" -> employee_count_max: 200
- "founded after 2018" -> year_founded_min: 2019
- Soft adjectives ("fast-growing", "leading", "innovative") are NOT filters.

PART 2 — semantic_query

A bare comma-separated noun phrase listing DOMAIN keywords for dense retrieval.
NO sentence wrappers ("The company builds…"). NO filler words. 5-12 phrases, ~8-20 words.

Rules:
1. Only terms from the query or their direct synonyms/hyponyms. No inferred attributes
   ("sustainable", "AI-powered", "innovative", "cloud-based").
2. Strip filter terms: no country names, no business-model terms (B2B/SaaS/manufacturer),
   no numeric constraints, no "public"/"private".
3. Style: domain nouns only, as a domain expert would tag the industry.

GOOD EXAMPLES

Query: "Pharmaceutical companies in Switzerland"
{{"structured_filters": {{"country_codes": ["ch"], "target_markets": ["Pharmaceuticals","Healthcare","Biotechnology"], "naics_labels": ["Pharmaceutical Preparation Manufacturing","Medicinal and Botanical Manufacturing","Biological Product (except Diagnostic) Manufacturing","In-Vitro Diagnostic Substance Manufacturing"]}}, "semantic_query": "pharmaceutical preparation, drug manufacturing, medicine, biologics, vaccines, therapeutics, biotechnology, clinical trials"}}

Query: "Companies that could supply packaging materials for a direct-to-consumer cosmetics brand"
{{"structured_filters": {{"target_markets": ["Cosmetics","Personal Care","Beauty and Personal Care"], "naics_labels": ["Plastics Bottle Manufacturing","Glass Container Manufacturing","All Other Plastics Product Manufacturing","Paperboard Container Manufacturing","Metal Can Manufacturing"]}}, "semantic_query": "cosmetics packaging, bottles, jars, tubes, compacts, skincare containers, makeup packaging, haircare packaging"}}

Respond with ONLY a single JSON object matching the shape above. No prose, no markdown."""


def call_llm(query: str, lf_trace=None) -> dict:
    system_prompt = state["llm_system_prompt"]
    content: str | None = None
    usage_snapshot: dict = {}
    lf_gen = None
    if lf_trace:
        lf_gen = lf_trace.start_observation(
            name="filter-extraction",
            as_type="generation",
            model=LLM_MODEL,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ],
            metadata={"prompt_version": PROMPT_VERSION},
        )

    for attempt in range(2):
        try:
            response = state["llm"].chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": query},
                ],
                temperature=0.0,
                max_tokens=1024,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content.strip()

            u = response.usage
            if u:
                details = getattr(u, "prompt_tokens_details", None)
                cached = int(getattr(details, "cached_tokens", 0) or 0)
                comp_details = getattr(u, "completion_tokens_details", None)
                reasoning = int(getattr(comp_details, "reasoning_tokens", 0) or 0)
                usage_snapshot = {
                    "prompt_tokens":     int(u.prompt_tokens or 0),
                    "completion_tokens": int(u.completion_tokens or 0),
                    "cached_tokens":     cached,
                    "reasoning_tokens":  reasoning,
                }
                cache_pct = (
                    f"{100 * cached // u.prompt_tokens}%"
                    if u.prompt_tokens else "?"
                )
                print(
                    f"[llm] prompt={u.prompt_tokens} cached={cached} ({cache_pct})"
                    f" completion={u.completion_tokens} reasoning={reasoning}"
                )
            if lf_gen:
                lf_gen.update(
                    output=content,
                    usage_details={
                        "input":  usage_snapshot.get("prompt_tokens", 0),
                        "output": usage_snapshot.get("completion_tokens", 0),
                    },
                )
                lf_gen.end()
            break
        except Exception as e:
            if lf_gen:
                lf_gen.update(level="ERROR", status_message=str(e))
                lf_gen.end()
            msg = str(e).lower()
            transient = any(t in msg for t in ("timeout", "connection", "rate", "503", "502"))
            if attempt == 0 and transient:
                time.sleep(0.4)
                continue
            raise

    try:
        parsed = json.loads(content) if content else {}
    except json.JSONDecodeError:
        print(f"[warn] LLM returned malformed JSON, falling back to raw query. "
              f"content[:200]={content[:200] if content else 'None'!r}")
        parsed = {"structured_filters": {}, "semantic_query": query}

    if not isinstance(parsed, dict):
        parsed = {"structured_filters": {}, "semantic_query": query}

    sf = parsed.get("structured_filters") or {}
    if not isinstance(sf, dict):
        sf = {}
    enum_filters = [
        ("country_codes", state["country_codes"]),
        ("naics_labels", state["naics_labels"]),
        ("business_models", state["business_models"]),
        ("target_markets", state["target_markets_all"]),
    ]
    for field, allowed in enum_filters:
        if field in sf:
            allowed_set = set(allowed)
            sf[field] = [v for v in (sf[field] or []) if v in allowed_set]
            if not sf[field]:
                sf.pop(field)

    sf.pop("core_offering_keywords", None)

    # Only keep is_public when the query explicitly says "public" or "private" —
    # the LLM hallucinates is_public=false for tech queries, killing recall.
    if "is_public" in sf:
        q_lower = query.lower()
        if "public" not in q_lower and "private" not in q_lower:
            sf.pop("is_public")

    sf = {k: v for k, v in sf.items() if v is not None}

    _zero_strip_keys = {
        "revenue_min", "revenue_max",
        "employee_count_min", "employee_count_max",
        "year_founded_min", "year_founded_max",
    }
    sf = {k: v for k, v in sf.items() if not (k in _zero_strip_keys and v == 0)}

    parsed["structured_filters"] = sf
    if not parsed.get("semantic_query"):
        parsed["semantic_query"] = query
    parsed["_usage"] = usage_snapshot
    return parsed


def apply_hard_filters(filters: dict) -> set[int]:
    df: pd.DataFrame = state["df"]
    mask = pd.Series([True] * len(df), index=df.index)

    if "country_codes" in filters and filters["country_codes"]:
        codes = [c.lower() for c in filters["country_codes"]]
        mask &= df["country_code"].isin(codes)

    if "is_public" in filters and filters["is_public"] is not None:
        null_mask = df["is_public"].isna()
        mask &= (df["is_public"] == filters["is_public"]) | null_mask

    numeric = [
        ("revenue_min", "revenue"), ("revenue_max", "revenue"),
        ("employee_count_min", "employee_count"), ("employee_count_max", "employee_count"),
        ("year_founded_min", "year_founded"), ("year_founded_max", "year_founded"),
    ]
    for field, col in numeric:
        if field not in filters:
            continue
        try:
            val = float(filters[field])
        except (TypeError, ValueError):
            continue
        null_mask = df[col].isna()
        if field.endswith("_min"):
            mask &= (df[col] >= val) | null_mask
        else:
            mask &= (df[col] <= val) | null_mask

    return set(df.index[mask].tolist())


def hard_filter_active(filters: dict) -> bool:
    return any(k in filters for k in HARD_FILTER_KEYS)


def categorical_filter_active(filters: dict) -> bool:
    return any(filters.get(k) for k in CATEGORICAL_FILTER_KEYS)


def matches_for_company(
    idx: int,
    wanted_naics: set[str],
    wanted_tms: set[str],
    wanted_bms: set[str],
) -> dict:
    row = state["df"].iloc[idx]

    naics_match = None
    if wanted_naics:
        company_naics = row.get("naics_label")
        if company_naics in wanted_naics:
            naics_match = company_naics

    matched_tms: list[str] = []
    if wanted_tms:
        company_tms = row.get("target_markets")
        if isinstance(company_tms, list):
            matched_tms = sorted(wanted_tms.intersection(company_tms))

    matched_bms: list[str] = []
    if wanted_bms:
        company_bms = row.get("business_model")
        if isinstance(company_bms, list):
            matched_bms = sorted(wanted_bms.intersection(company_bms))

    return {
        "naics": naics_match,
        "target_markets": matched_tms,
        "business_models": matched_bms,
    }


def passes_categorical(matches: dict) -> bool:
    """OR-across-categories: at least one category has at least one match."""
    return (
        matches["naics"] is not None
        or bool(matches["target_markets"])
        or bool(matches["business_models"])
    )


def get_null_filter_fields(idx: int, filters: dict) -> list[str]:
    """Return the names of filter fields that were requested but null on this row."""
    df: pd.DataFrame = state["df"]
    row = df.iloc[idx]
    nulls: list[str] = []
    seen_cols: set[str] = set()
    numeric_pairs = [
        ("revenue_min",        "revenue",        "revenue"),
        ("revenue_max",        "revenue",        "revenue"),
        ("employee_count_min", "employee_count", "employee count"),
        ("employee_count_max", "employee_count", "employee count"),
        ("year_founded_min",   "year_founded",   "year founded"),
        ("year_founded_max",   "year_founded",   "year founded"),
    ]
    for fkey, col, label in numeric_pairs:
        if fkey in filters and col not in seen_cols and pd.isna(row[col]):
            nulls.append(label)
            seen_cols.add(col)
    if "country_codes" in filters and filters["country_codes"] and pd.isna(row.get("country_code")):
        nulls.append("country")
    if "is_public" in filters and pd.isna(row.get("is_public")):
        nulls.append("public/private status")
    return nulls


def _encode_hybrid(model: BGEM3FlagModel, query: str):
    out = model.encode(
        [query],
        max_length=512,
        return_dense=True,
        return_sparse=True,
        return_colbert_vecs=False,
    )
    dense = out["dense_vecs"][0].tolist()
    weights = out["lexical_weights"][0] or {}
    if weights:
        sparse = SparseVector(
            indices=[int(k) for k in weights.keys()],
            values=[float(v) for v in weights.values()],
        )
    else:
        sparse = SparseVector(indices=[0], values=[0.0])
    return dense, sparse


def dense_retrieval(semantic_query: str, restrict_to: set[int] | None = None) -> dict[int, dict[str, float]]:
    model: BGEM3FlagModel = state["model"]
    client: QdrantClient = state["qdrant"]

    dense_q, sparse_q = _encode_hybrid(model, semantic_query)

    if restrict_to is not None:
        if not restrict_to:
            return {}
        qdrant_filter = Filter(must=[HasIdCondition(has_id=list(restrict_to))])
        limit = len(restrict_to)
    else:
        qdrant_filter = None
        limit = TOP_K_VECTORS

    score_map: dict[int, dict[str, float]] = {}
    for col in ("core_offerings", "description"):
        dense_resp = client.query_points(
            collection_name=col,
            query=dense_q,
            using="dense",
            query_filter=qdrant_filter,
            limit=limit,
            with_payload=True,
        )
        for r in dense_resp.points:
            idx = r.payload["company_index"]
            if idx not in score_map:
                score_map[idx] = {"core_offerings": 0.0, "description": 0.0}
            score_map[idx][col] = float(r.score)

        sparse_limit = limit if restrict_to is not None else TOP_K_VECTORS
        sparse_resp = client.query_points(
            collection_name=col,
            query=sparse_q,
            using="sparse",
            query_filter=qdrant_filter,
            limit=sparse_limit,
            with_payload=True,
        )
        for r in sparse_resp.points:
            idx = r.payload["company_index"]
            if idx not in score_map:
                score_map[idx] = {"core_offerings": 0.0, "description": 0.0}
    return score_map


def _dense_key(idx: int, dense_scores: dict) -> float:
    s = dense_scores.get(idx, {})
    return max(s.get("core_offerings", 0.0), s.get("description", 0.0))


def _get_reranker():
    # Lazy-loaded on first use; ~568M params, ~1-2s per 50 pairs on CPU.
    if state["reranker"] is None:
        from sentence_transformers import CrossEncoder
        print("Loading reranker model (BAAI/bge-reranker-v2-m3)...")
        state["reranker"] = CrossEncoder(
            "BAAI/bge-reranker-v2-m3", max_length=512,
        )
    return state["reranker"]


def rerank_results(query: str, ranked: list) -> list:
    if not ranked:
        return ranked
    reranker = _get_reranker()
    df: pd.DataFrame = state["df"]

    pairs = []
    for idx, _scores, _matches, _src, _nulls, _total in ranked:
        row = df.iloc[idx]
        offerings = row["core_offerings"] if isinstance(row["core_offerings"], list) else []
        desc = row["description"] if isinstance(row["description"], str) else ""
        doc = ", ".join(offerings)
        if desc:
            doc = doc + ". " + desc if doc else desc
        pairs.append([query, doc[:2000]])

    import torch
    rerank_scores = reranker.predict(
        pairs, activation_fct=torch.nn.Sigmoid(),
    )
    rerank_scores = [float(s) for s in rerank_scores]

    reranked = []
    for (idx, scores, matches, src, nulls, _old_total), rscore in zip(ranked, rerank_scores):
        reranked.append((idx, scores, matches, src, nulls, rscore))
    reranked.sort(key=lambda x: x[5], reverse=True)
    return reranked


def _safe(val):
    if isinstance(val, (list, dict)):
        return val
    if hasattr(val, "item"):
        val = val.item()
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    return val


def _safe_bool(val):
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    if val is None:
        return None
    return bool(val)


def build_result(rank: int, idx: int, scores: dict, matches: dict,
                 match_source: str, null_filter_fields: list, total: float) -> dict:
    df: pd.DataFrame = state["df"]
    row = df.iloc[idx]
    return {
        "rank": rank,
        "operational_name": _safe(row["operational_name"]),
        "website": _safe(row["website"]),
        "description": _safe(row["description"]),
        "address": {
            "country_code": _safe(row.get("country_code")),
            "town": _safe(row.get("town")),
            "region_name": _safe(row.get("region_name")),
        },
        "revenue": _safe(row["revenue"]),
        "employee_count": _safe(row["employee_count"]),
        "year_founded": _safe(row["year_founded"]),
        "is_public": _safe_bool(row["is_public"]),
        "primary_naics": _safe(row.get("naics_label")),
        "business_model": row["business_model"] if isinstance(row["business_model"], list) else [],
        "target_markets": row["target_markets"] if isinstance(row["target_markets"], list) else [],
        "core_offerings": row["core_offerings"] if isinstance(row["core_offerings"], list) else [],
        "scores": {
            "core_offerings": round(float(scores.get("core_offerings", 0.0)), 4),
            "description":    round(float(scores.get("description", 0.0)), 4),
            "total":          round(float(total), 4),
        },
        "matches": matches,
        "match_source": match_source,
        "null_filter_fields": null_filter_fields,
        "passed_with_nulls": bool(null_filter_fields),
    }


@app.post("/query")
def query_companies(request: QueryRequest):
    t_start = time.perf_counter()
    timings: dict[str, Any] = {}

    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    lf = state.get("langfuse")
    lf_trace = None
    if lf:
        try:
            lf_trace = lf.start_observation(
                name="company-query",
                as_type="span",
                input={"query": query, "use_reranker": request.use_reranker},
                metadata={"model": LLM_MODEL},
            )
        except Exception:
            lf_trace = None

    t0 = time.perf_counter()
    try:
        llm_output = call_llm(query, lf_trace=lf_trace)
    except Exception as e:
        traceback.print_exc()
        if lf_trace:
            lf_trace.update(level="ERROR", status_message=f"LLM error: {e}")
            lf_trace.end()
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")
    timings["llm_ms"] = round((time.perf_counter() - t0) * 1000)
    timings["llm_usage"] = llm_output.pop("_usage", {})

    filters = llm_output.get("structured_filters", {}) or {}
    semantic_query = llm_output.get("semantic_query") or query

    if lf_trace:
        lf_trace.start_observation(
            name="llm-parsed-filters",
            as_type="span",
            input={"query": query},
            output={"structured_filters": filters, "semantic_query": semantic_query},
        ).end()

    t0 = time.perf_counter()
    is_hard = hard_filter_active(filters)
    hard_indices: set[int] = apply_hard_filters(filters) if is_hard else state["all_indices"]
    timings["filter_ms"] = round((time.perf_counter() - t0) * 1000)

    if lf_trace:
        lf_trace.start_observation(
            name="hard-filter",
            as_type="span",
            input={"filters": {k: v for k, v in filters.items() if k in HARD_FILTER_KEYS}, "corpus_size": len(state["df"])},
            output={"companies_after_hard_filter": len(hard_indices)},
            metadata={"filter_active": is_hard},
        ).end()

    t0 = time.perf_counter()
    cat_active = categorical_filter_active(filters)
    match_details: dict[int, dict] = {}
    categorical_pass: set[int] = set()
    if cat_active:
        wanted_naics = set(filters.get("naics_labels") or [])
        wanted_tms = set(filters.get("target_markets") or [])
        wanted_bms = set(filters.get("business_models") or [])
        for i in hard_indices:
            m = matches_for_company(i, wanted_naics, wanted_tms, wanted_bms)
            match_details[i] = m
            if passes_categorical(m):
                categorical_pass.add(i)
    timings["categorical_ms"] = round((time.perf_counter() - t0) * 1000)

    if lf_trace:
        lf_trace.start_observation(
            name="categorical-filter",
            as_type="span",
            input={
                "naics_labels":    list(filters.get("naics_labels") or []),
                "target_markets":  list(filters.get("target_markets") or []),
                "business_models": list(filters.get("business_models") or []),
            },
            output={"companies_passed_categorical": len(categorical_pass)},
            metadata={"filter_active": cat_active},
        ).end()

    t0 = time.perf_counter()
    restrict = hard_indices if (is_hard or cat_active) else None
    dense_scores = dense_retrieval(semantic_query, restrict_to=restrict)
    timings["dense_ms"] = round((time.perf_counter() - t0) * 1000)

    if lf_trace:
        lf_trace.start_observation(
            name="dense-retrieval",
            as_type="span",
            input={"semantic_query": semantic_query, "restrict_to_count": len(restrict) if restrict else None},
            output={"candidates_found": len(dense_scores)},
            metadata={"mode": "filtered" if restrict else "pure-semantic"},
        ).end()

    if cat_active:
        dense_ranked = sorted(
            hard_indices,
            key=lambda i: _dense_key(i, dense_scores),
            reverse=True,
        )
        dense_safety = set(dense_ranked[:DENSE_SAFETY_NET])
        final_pool = categorical_pass | dense_safety
    elif is_hard:
        final_pool = set(hard_indices)
    else:
        final_pool = {
            i for i, s in dense_scores.items()
            if max(s.get("core_offerings", 0.0), s.get("description", 0.0)) >= SIMILARITY_THRESHOLD
        }

    empty_matches = {"naics": None, "target_markets": [], "business_models": []}
    ranked = []
    dropped_by_gate = 0
    dropped_by_score = 0
    for idx in final_pool:
        scores = {
            "core_offerings": dense_scores.get(idx, {}).get("core_offerings", 0.0),
            "description":    dense_scores.get(idx, {}).get("description", 0.0),
        }
        matches = match_details.get(idx, empty_matches)

        has_naics_match = matches.get("naics") is not None
        if not has_naics_match:
            core_or_desc_max = max(scores["core_offerings"], scores["description"])
            if core_or_desc_max < NAICS_BYPASS_THRESHOLD:
                dropped_by_gate += 1
                continue

        total = weighted_total(scores)
        if total < SCORE_THRESHOLD:
            dropped_by_score += 1
            continue

        match_source = "both" if is_hard else "semantic_only"
        null_fields = get_null_filter_fields(idx, filters) if is_hard else []
        ranked.append((idx, scores, matches, match_source, null_fields, total))

    ranked.sort(key=lambda x: x[5], reverse=True)

    if lf_trace:
        lf_trace.start_observation(
            name="scoring-and-gating",
            as_type="span",
            input={"pool_size": len(final_pool)},
            output={"survivors": len(ranked)},
            metadata={
                "dropped_by_naics_gate": dropped_by_gate,
                "dropped_by_score_threshold": dropped_by_score,
                "score_threshold": SCORE_THRESHOLD,
                "naics_bypass_threshold": NAICS_BYPASS_THRESHOLD,
            },
        ).end()

    rerank_ms = 0
    if request.use_reranker and ranked:
        t_rr = time.perf_counter()
        ranked = rerank_results(query, ranked)
        rerank_ms = round((time.perf_counter() - t_rr) * 1000)
    timings["rerank_ms"] = rerank_ms

    results = [
        build_result(rank + 1, idx, scores, matches, source, null_fields, total)
        for rank, (idx, scores, matches, source, null_fields, total) in enumerate(ranked)
    ]

    timings["total_ms"] = round((time.perf_counter() - t_start) * 1000)
    timings["hard_filter_n"] = len(hard_indices)
    timings["categorical_pass_n"] = len(categorical_pass) if cat_active else None
    timings["pool_n"] = len(final_pool)
    timings["dropped_by_gate"] = dropped_by_gate
    timings["dropped_by_score"] = dropped_by_score
    rerank_tag = f" rerank={rerank_ms}ms" if request.use_reranker else ""
    print(
        f"[query] {timings['total_ms']}ms total  "
        f"llm={timings['llm_ms']}ms  hard={timings['filter_ms']}ms  "
        f"cat={timings['categorical_ms']}ms  dense={timings['dense_ms']}ms{rerank_tag}  "
        f"(hard={len(hard_indices)} cat={len(categorical_pass) if cat_active else '-'} "
        f"pool={len(final_pool)} -gate={dropped_by_gate} -score={dropped_by_score}) "
        f"-> {len(results)} results  | q={query!r}"
    )

    if lf_trace:
        lf_trace.update(
            output={
                "total_results": len(results),
                "top_results": [
                    {
                        "rank": r["rank"],
                        "name": r["operational_name"],
                        "country": r["address"]["country_code"],
                        "scores": r["scores"],
                        "naics": r["primary_naics"],
                        "match_source": r["match_source"],
                    }
                    for r in results[:10]
                ],
            },
            metadata={
                "timings_ms": timings,
                "semantic_query": semantic_query,
                "use_reranker": request.use_reranker,
            },
        )
        lf_trace.end()

    return {
        "query": query,
        "semantic_query": semantic_query,
        "filters_applied": filters,
        "use_reranker": request.use_reranker,
        "total_results": len(results),
        "results": results,
        "timings": timings,
    }


@app.get("/health")
def health():
    return {"status": "ok", "companies_loaded": len(state.get("df", []))}


@app.get("/companies")
def list_companies():
    """Return all companies for client-side filtering in the map explorer."""
    df: pd.DataFrame = state["df"]
    companies = []
    for idx, row in df.iterrows():
        companies.append({
            "id": int(idx),
            "operational_name": _safe(row["operational_name"]),
            "website": _safe(row["website"]),
            "description": str(row["description"])[:220] + "…" if isinstance(row["description"], str) and len(row["description"]) > 220 else _safe(row["description"]),
            "country_code": _safe(row.get("country_code")),
            "town": _safe(row.get("town")),
            "region_name": _safe(row.get("region_name")),
            "revenue": _safe(row["revenue"]),
            "employee_count": _safe(row["employee_count"]),
            "year_founded": _safe(row["year_founded"]),
            "is_public": _safe_bool(row["is_public"]),
            "naics_label": _safe(row.get("naics_label")),
            "business_model": row["business_model"] if isinstance(row["business_model"], list) else [],
            "target_markets": row["target_markets"] if isinstance(row["target_markets"], list) else [],
        })
    return {"companies": companies, "total": len(companies)}


@app.get("/meta")
def get_meta():
    """Return filter option lists for the map explorer."""
    return {
        "naics_labels": state["naics_labels"],
        "business_models": state["business_models"],
        "target_markets": state["target_markets_all"],
        "country_codes": state["country_codes"],
    }
