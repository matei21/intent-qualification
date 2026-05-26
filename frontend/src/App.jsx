import React, { useEffect, useState } from 'react'
import SearchBar from './components/SearchBar.jsx'
import FilterTags from './components/FilterTags.jsx'
import ResultCard from './components/ResultCard.jsx'
import MapExplorer from './components/MapExplorer.jsx'

const API = 'http://localhost:8000'

function SkeletonCard() {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)',
      borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 20, width: '45%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '30%' }} />
        </div>
        <div className="skeleton" style={{ width: 56, height: 32 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 58, height: 10 }} />
            <div className="skeleton" style={{ flex: 1, height: 5 }} />
            <div className="skeleton" style={{ width: 36, height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ companiesCount }) {
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'var(--primary-light)', border: '1px solid rgba(255,184,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#92600A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <h3 style={{
        fontSize: 16, fontWeight: 700, marginBottom: 10,
        color: 'var(--text)', fontFamily: 'var(--font-body)',
      }}>
        Describe the companies you're looking for
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
        The system uses an LLM to extract structured filters{' '}
        <span style={{ color: 'var(--indigo)', fontWeight: 500 }}>(country, revenue, employee count…)</span>{' '}
        then runs semantic vector search across{' '}
        <span style={{ color: 'var(--indigo)', fontWeight: 500 }}>
          {companiesCount ? `${companiesCount} companies` : 'the corpus'}
        </span>.
      </p>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [useReranker, setUseReranker] = useState(false)
  const [companiesCount, setCompaniesCount] = useState(null)

  useEffect(() => {
    fetch(`${API}/health`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.companies_loaded) setCompaniesCount(data.companies_loaded) })
      .catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!query.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`${API}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), use_reranker: useReranker }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        height: 60,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        justifyContent: 'space-between',
        zIndex: 100,
      }}>
        <a href="#" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <span style={{
            fontSize: 16, fontWeight: 800, color: 'var(--primary)',
            fontFamily: 'var(--font-body)', letterSpacing: '-0.02em',
          }}>
            Intent
          </span>
          <span style={{
            fontSize: 16, fontWeight: 500, color: 'var(--text)',
            fontFamily: 'var(--font-body)', letterSpacing: '-0.02em',
          }}>
            Qualifier
          </span>
        </a>

        {/* Right side: token pill + reranker badge */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {result && result.timings?.llm_usage?.prompt_tokens > 0 && (() => {
            const u = result.timings.llm_usage
            const cached = u.cached_tokens ?? 0
            const total = u.prompt_tokens ?? 0
            const pct = total > 0 ? Math.round(100 * cached / total) : 0
            return (
              <span
                title={`LLM prompt tokens: ${total} total, ${cached} cached (${pct}%), ${u.reasoning_tokens ?? 0} reasoning`}
                style={{
                  background: cached > 0 ? 'rgba(16,185,129,0.07)' : 'rgba(100,100,100,0.07)',
                  border: `1px solid ${cached > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(100,100,100,0.2)'}`,
                  color: cached > 0 ? '#065f46' : 'var(--text-muted)',
                  borderRadius: 4, padding: '2px 8px', fontSize: 11,
                  fontWeight: 600, cursor: 'default',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {cached > 0 ? `cached ${pct}% · ` : ''}{total} tkns
              </span>
            )
          })()}
          {result && result.use_reranker && (
            <span style={{
              background: 'var(--indigo-light)',
              border: '1px solid rgba(99,102,241,0.25)',
              color: 'var(--indigo)',
              borderRadius: 4, padding: '2px 8px', fontSize: 11,
              fontWeight: 600, fontFamily: 'var(--font-mono)',
            }}>
              reranked · {result.timings?.rerank_ms ?? '-'}ms
            </span>
          )}
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Scroll-snap container                                             */}
      {/* ---------------------------------------------------------------- */}
      <div style={{
        flex: 1,
        overflowY: 'scroll',
        scrollSnapType: 'y proximity',
        scrollBehavior: 'smooth',
      }}>

      {/* ---------------------------------------------------------------- */}
      {/* Map Explorer (snap section 1)                                     */}
      {/* ---------------------------------------------------------------- */}
      <MapExplorer />

      {/* ---------------------------------------------------------------- */}
      {/* LLM Search section (snap section 2)                              */}
      {/* ---------------------------------------------------------------- */}
      <section id="search" style={{
        background: '#fff',
        borderTop: '1px solid var(--border)',
        scrollSnapAlign: 'start',
        minHeight: 'calc(100vh - 60px)',
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '72px 40px 56px' }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{
              fontFamily: 'var(--font-body)',
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}>
              Search by Intent
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
              Describe what you're looking for in plain language — the system extracts structured filters and runs semantic vector search.
            </p>
          </div>

          {/* Search bar centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <SearchBar
              value={query}
              onChange={setQuery}
              onSearch={handleSearch}
              loading={loading}
            />

            {/* Reranker toggle */}
            <div style={{
              width: '100%', maxWidth: 760,
              marginTop: 12, display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 12, color: 'var(--text-muted)',
            }}>
              <label
                htmlFor="use-reranker"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
                title="When on, the top-K results are re-scored by a cross-encoder (bge-reranker-v2-m3). Slower, but suppresses semantic noise from long descriptions."
              >
                <input
                  id="use-reranker"
                  type="checkbox"
                  checked={useReranker}
                  onChange={e => setUseReranker(e.target.checked)}
                  disabled={loading}
                  style={{ cursor: loading ? 'not-allowed' : 'pointer', accentColor: 'var(--indigo)' }}
                />
                <span style={{ fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                  Use reranker
                </span>
                <span style={{ color: 'var(--dim)', fontSize: 11 }}>
                  (cross-encoder, slower, sharper top-K)
                </span>
              </label>
            </div>

            {result && !loading && (
              <div style={{ width: '100%', maxWidth: 760, marginTop: 12 }}>
                <FilterTags
                  semanticQuery={result.semantic_query}
                  filtersApplied={result.filters_applied}
                />
              </div>
            )}
          </div>

          {/* Results */}
          <div style={{ maxWidth: 820, margin: '32px auto 0' }}>
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 8,
                padding: '12px 16px',
                color: 'var(--danger)',
                fontSize: 13,
                marginBottom: 16,
                fontFamily: 'var(--font-body)',
              }}>
                Error: {error}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
              </div>
            )}

            {!loading && result && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{
                    fontSize: 22, fontWeight: 700, color: 'var(--indigo)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {result.total_results}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'var(--font-body)' }}>
                    companies matched
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.results.map(r => (
                    <ResultCard key={`${r.rank}-${r.operational_name}`} result={r} />
                  ))}
                </div>
              </>
            )}

            {!loading && !result && !error && <EmptyState companiesCount={companiesCount} />}
          </div>
        </div>
      </section>

      </div>{/* end scroll-snap container */}
    </div>
  )
}
