import React, { useRef } from 'react'

const EXAMPLE_QUERIES = [
  'Logistic companies in Romania',
  'Public software companies with more than 1,000 employees',
  'Food and beverage manufacturers in France',
  'Companies that could supply packaging materials for a direct-to-consumer cosmetics brand',
  'Construction companies in the United States with revenue over $50 million',
  'Pharmaceutical companies in Switzerland',
  'B2B SaaS companies providing HR solutions in Europe',
  'Clean energy startups founded after 2018 with fewer than 200 employees',
  'Fast-growing fintech companies competing with traditional banks in Europe',
  'E-commerce companies using Shopify or similar platforms',
  'Renewable energy equipment manufacturers in Scandinavia',
  'Companies that manufacture or supply critical components for electric vehicle battery production',
]

export default function SearchBar({ value, onChange, onSearch, loading }) {
  const inputRef = useRef(null)

  const handleKey = (e) => {
    if (e.key === 'Enter' && !loading) onSearch()
  }

  return (
    <div style={{ width: '100%', maxWidth: 760 }}>
      <div style={{
        display: 'flex',
        gap: 12,
        background: '#fff',
        border: '1.5px solid var(--border-dark)',
        borderRadius: 12,
        padding: '6px 6px 6px 18px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
        onFocusCapture={e => {
          e.currentTarget.style.borderColor = 'var(--primary)'
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(255,184,0,0.15)'
        }}
        onBlurCapture={e => {
          e.currentTarget.style.borderColor = 'var(--border-dark)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="e.g. Logistics companies in Romania with revenue over $10M"
          disabled={loading}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            padding: '12px 0',
          }}
        />
        <button
          onClick={onSearch}
          disabled={loading || !value.trim()}
          style={{
            padding: '12px 26px',
            background: loading || !value.trim() ? 'var(--surface-dim)' : 'var(--primary)',
            color: loading || !value.trim() ? 'var(--dim)' : '#111',
            border: 'none',
            borderRadius: 10,
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: 14,
            cursor: loading || !value.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            if (!loading && value.trim()) {
              e.currentTarget.style.background = 'var(--primary-hover)'
            }
          }}
          onMouseLeave={e => {
            if (!loading && value.trim()) {
              e.currentTarget.style.background = 'var(--primary)'
            }
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Example queries */}
      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {EXAMPLE_QUERIES.map(q => (
          <button
            key={q}
            onClick={() => { onChange(q); setTimeout(() => inputRef.current?.focus(), 0) }}
            style={{
              background: 'var(--surface-dim)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              borderRadius: 999,
              padding: '5px 13px',
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--primary-light)'
              e.currentTarget.style.borderColor = 'var(--primary)'
              e.currentTarget.style.color = '#92600A'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--surface-dim)'
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}
