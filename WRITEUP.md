## Approach

### System architecture

The pipeline has four stages that run in sequence per query:

**Stage 1 — LLM filter extraction.** A single LLM API call (default: llama-4-scout-17b via Groq; configurable to any OpenAI-compatible provider) converts the free-text query into two outputs: a `structured_filters` object and a `semantic_query` string. The structured filters split into two classes:

- *Hard filters* — country codes, revenue range, employee count, year founded, is_public. Applied as exact or range predicates on the pandas DataFrame. A company must pass all hard filters to continue.
- *Categorical filters* — NAICS industry codes, business models, target markets. Applied with OR-across-categories logic: a company passes if it matches at least one value in at least one of the three sets. This is intentionally permissive — categorical filters are used to narrow the vector search space, not as knockout criteria.

The `semantic_query` is a bare comma-separated noun phrase, stripped of filter terms and sentence wrappers. It feeds the embedding model directly.

**Stage 2 — Hard filtering.** A pandas boolean mask over the in-memory DataFrame (456 rows). Fast and deterministic. Null values are treated as "uncertain" and pass through — a company with no recorded revenue is not excluded by a revenue filter.

**Stage 3 — Hybrid dense retrieval.** The semantic_query is embedded with BGE-M3 (1024-d dense + sparse lexical weights). Qdrant searches two collections — `core_offerings` and `description` — using dense cosine similarity. The description collection was embedded from KeyBERT-extracted keyphrases rather than raw prose, which significantly improved retrieval quality (raw prose embeddings clustered in a 0.40–0.52 cosine band corpus-wide due to boilerplate like "specialized in providing solutions globally").

A categorical safety net pulls the top-10 dense candidates from the hard-filtered set unconditionally, so a company with strong semantic signal is never silently dropped by an overly aggressive categorical filter.

**Stage 4 — Scoring and gating.** Each surviving candidate gets a composite score:

```
total = 0.50 × cosine(core_offerings) + 0.50 × cosine(description)
```

Two gating rules apply before returning results:
- *NAICS-bypass rule:* if a company has no NAICS match from the categorical filter, it needs `max(core, desc) ≥ 0.60` to survive. This blocks weak semantic matches from drifting in without any categorical signal.
- *Score floor:* `total ≥ 0.50` in all modes.

An optional cross-encoder reranker (BGE-reranker-v2-m3) can re-score the surviving pool. It is CPU-bound and slow (~1–2 s for 100 candidates), but removes semantic noise from long descriptions by scoring query-document pairs directly.

### Thinking process - Why this design

The core motivation was to avoid the two options which we were advised against:

1. **Pure similarity search** retrieves too broadly and the results are not accurate enough. A query can retrieve false similarity and the different lengths of descriptions can also be a big problem, as the key and important words could have been lost in the sea of filler words.

2. **LLM-per-company scoring** is too expensive. Sending each of 456 companies through an LLM for relevance scoring would cost hundreds of times more than the per-query token budget. The LLM runs exactly once per query, on the query itself, and that is it. The LLM token cost is around 4k tokens per search, meaning that we would need around 250 searches to reach 1M used tokens for one LLM (the 15-70B parameters cheap models used cost around 30-60 cents per million tokens), so the cost of under a dollar for 250 company searches seemed easy to justify.

The hybrid approach — LLM for filter extraction, vectors for ranking — gets precision near a per-company LLM approach at a fraction of the cost, because the LLM does the heavy lifting by reducing the number of analyzed companies and possible matches drastically.

## Mistakes made at the start and improvements 
First I tried to get the LLM to predict NAICS codes by itself, and the hallucinations were horrible, that is why I started naming all possible NAICS codes in the system prompt for it to be able to name the codes which are a match for the prompt. 

Then, another problem was that I applied cosine similarity for the base description, and a lot of key words were lost in the sea of filler words, which is why I have added KeyBERT that extracted meaningful keywords for the description to be matched against the original prompt. This way, the description score is now production-ready, as the scores seem a lot more plausible. 

A very important upgrade I have thought about was the filtering for the NAICS code. There were a lot of false negatives who had no connection to the original prompt, no target_markets match, no core_offerings and no NAICS codes match. This is why I have implemented some rules that have made the app perform way better, the app requires all results who do not have a matching NAICS code to have at least one of the core_offerings or description over 0.60, meaning that the average matching aspects that didn't even have the NAICS code in the matching area were just scrapped, and this rid the list of a lot of false negatives. 

Also another important aspect was that the core_offerings were treated equally to the description, this helped a lot, because there were HR-oriented companies who just didn't have a detailed enough description in order for the cosine similarity to mark them as a match to the HR-oriented prompt, but the offerings contained recruiting consulting, recruitment platforms, payroll services and others, so the score being calculated as 50% core_offerings and 50% description has been extremely helpful. 

---

## 3.2 Tradeoffs

**Accuracy vs. latency vs tokens.** The LLM extraction adds 400–1000 ms per query but dramatically improves precision for structured queries (country, revenue, founding year). A pure-vector system with no LLM layer returned geographically incorrect results when tested — e.g., logistics companies from the US appearing in a Romania-only query. Also, giving the LLM a very long system prompt and using around 4k of tokens can be considered a medium usage of tokens, but the results have been extremely good and satisfactory, so the tradeoff has been justified, in my opinion.

**Recall vs. precision.** Categorical filters use OR-across-categories logic and null-pass behavior, both of which favor recall over precision. This is intentional: the score gating and NAICS-bypass rule handle precision at a later stage. The cost is a noisy pool at intermediate stages, which the dense scoring needs to clean up. I consider that it's more important to find all relevant companies for the user than to avoid giving them 5-10 unrelated results which are flagged as low-confidence anyway, because they have a low total_score. 

**Embedding model size vs. retrieval quality.** BGE-M3 (1024-d) was chosen over lighter alternatives because it supports true hybrid dense+sparse retrieval in a single encode pass. The sparse lexical weights are essential for queries with rare exact terms ("Shopify", "lithium-ion", specific NAICS labels) that a dense model would smear with semantic neighbors. Lighter models were tested and showed ~0.08–0.12 lower cosine discrimination on domain-specific terms.

**Model cost vs. accuracy for LLM.** The default model is llama-4-scout-17b (via Groq), but the backend accepts any OpenAI-compatible provider via `LLM_BASE_URL` and `LLM_MODEL` env vars. The model handles filter extraction accurately for most query types. The failure mode is occasional NAICS hallucination (the model inventing plausible-sounding codes not in the corpus), which was fixed by including the full allowed NAICS list in the system prompt. For the complexity of this extraction task — structured JSON with a fixed schema — a 17B model is sufficient.

## 3.3 Error Analysis

Tests were run against 12 representative queries. Results are from a 456-company corpus.

**Q10 — "E-commerce companies using Shopify or similar platforms" (118 results, low precision)**

This is a technology-stack query. The corpus does not record which platforms a company uses — only what the company does. The LLM correctly identified "ecommerce platforms, Shopify" as the semantic query, but without a "uses Shopify" metadata field, the dense search can only match companies whose descriptions mention Shopify by name or imply platform technology. The filter combination (SaaS + E-commerce business models, broad NAICS) pulled in 118 companies — nearly a quarter of the corpus — most of which are tangentially related tech companies, not Shopify merchants. This is a fundamental problem that the app hasn't been able to solve, but also one that the LLM + mathematical cosine similarity architecture couldn't be able to solve, as it couldn't have done anything in order to know which companies use certain platforms. The only way I could think about for solving this would've been too costly and inefficient for solving this one prompt, and it was related to giving the model agentic capabilities in order to process the website of the companies or to search the web or the database websites for information about the prompt. I have considered this not good enough to be able to be justified.

**Q8 — "Clean energy startups founded after 2018 with fewer than 200 employees" (43 results, demographic filtering degraded)**

4 of the top 5 results are missing both `employee_count` and `year_founded`. Because null values pass all hard filters ("uncertain" treatment), companies with no recorded size or age bypass both constraints. The semantic relevance is correct — these are wind and solar companies — but whether they qualify as startups under 200 employees cannot be verified. The top result, Verta (Norway), has no employee count on record. This is intentional, as we can't guarrantee that the database will always be perfect, but it was important for me to be transparent with the user and to give them a possibly good result that they can later check for employee_count.

**Q3 — "Food and beverage manufacturers in France" (21 results, NAICS pollution)**

The LLM included "Mattress Manufacturing", "Pharmaceutical Preparation Manufacturing", and three biotech NAICS codes alongside the correct food/beverage codes. In this case the result count was unaffected (21, same as previous runs) because French pharma companies don't describe themselves with food vocabulary and are gated out by the dense score. But the polluted NAICS list is a latent precision risk — it would admit pharma companies in France that have food-adjacent language in their descriptions. This was addressed in a later prompt version by including the full allowed NAICS list in the system prompt. Now, the results are way better, this was a solved problem but also one that is LLM-specific, a better reasoner most probably wouldn't have run into this problem.

**Q9 — "Fast-growing fintech companies competing with traditional banks in Europe" (21 results, scores 0.64–0.66)**

Only one NAICS code extracted ("Financial Transactions Processing, Reserve, and Clearinghouse Activities"). Digital banking platforms, neobanks, and lending fintechs fall across several NAICS categories (Software Publishers, State Commercial Banks, etc.) that were not included. The narrow NAICS creates an overly restrictive pre-filter, and some legitimate fintech companies are filtered out before they reach the dense ranking stage. Scores are lower than typical because "fintech competing with banks" is a broad, high-level description rather than a specific industry term. This is also a LLM-specific problem that could be solved by choosing a better reasoner.

## 3.4 Scaling to 100,000 companies

For scaling to 100k companies, the app seems decently prepared. The **architecture of the LLM call** would not be different, the number of tokens would be the absolute same. If for 450 companies it would've been feasible to use LLM calls for each company (like in the original project description), for 100k it certainly wouldn't have been posible or feasible. But, with the current architecture, extracting filters from the same prompt for 100k companies or for 450 is absolutely the same. 

**Embedding 100k companies requires a GPU.** The change we would need would be to use a GPU for the embedding, especially with BGE-M3, but the app architecture for the backend / user wouldn't be different, only the ingestion pipeline or the data engineering would need to adapt. 

**Qdrant scales horizontally.** The vector index itself handles 100k points without architectural changes — Qdrant's index is efficient at this scale.

**The embeddings** could become a bit clustered at 100k companies, but the similarity score seems to give accurate results, there is no flagrant false-positive at over 0.6 total similarity score from the tests I have run, so the only problem could be that from the range of similarity score 0.6-0.7, the order in which the companies are displayed are not the best (a 0.6 company might be more related to the original prompt than the 0.7 one), but that could be solved by using more query time by checking the "Use reranker" button, if the user is interested in this.

## 3.5 Failure Modes

**When the system produces confident but incorrect results:**

1. *Technology-stack queries.* Queries asking about which tools or platforms a company uses ("uses Salesforce", "built on AWS", "Shopify store") return results based on semantic proximity to those tool names, not verified metadata. A company that mentions Shopify in a single sentence of its description may rank highly even if it's not primarily an e-commerce merchant.

2. *Null-data inflation.* When a query specifies demographic constraints (founding year, employee count) and a substantial portion of the corpus lacks those fields, the results are dominated by null-passing companies. The system reports the null fields in the response, but confident-looking rank #1 results may fail the actual criteria.

3. *Broad categorical + no hard filters.* Queries without country or numeric hard filters rely entirely on categorical pre-filtering and dense scoring. If the LLM generates an overly permissive categorical filter (or the query is semantically similar to many industries), the pool can be 100+ companies and the 0.50 score floor passes many weak matches. The threshold could be set differently depending on the LLM used, but that would require a large and exhaustive analysis of each specific LLM and their filter extraction.

4. *NAICS label hallucination.* Before the full NAICS list was included in the prompt, the LLM occasionally generated plausible-sounding codes that don't exist in the corpus. These codes match zero companies, silently reducing recall without any visible error.

**What to monitor in production:**

- *Result count distribution.* P95 result count per query. A spike above ~60 indicates filter degradation or a very broad query type entering the system. Alert threshold: >80 results with no hard filters active.
- *Null-filter-fields rate.* Percentage of returned results that passed with at least one null filter field. A high rate on queries with explicit demographic constraints signals data quality degradation in the corpus.
- *LLM filter extraction quality via Langfuse.* Track structured filter fields extracted per query. A sudden drop in NAICS codes extracted (e.g., median drops to 1) or an increase in empty structured_filters indicates prompt regression.
- *LLM latency.* The system observed bimodal LLM latency: 400–1000 ms (normal) and 5–6 s (provider variability, observed on Groq). Monitor P95 LLM latency; sustained spikes above 3 s indicate infrastructure issues worth routing around or switching providers.
