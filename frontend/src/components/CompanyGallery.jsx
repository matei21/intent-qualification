import React, { useState, useEffect } from 'react'
import CompanyCard from './CompanyCard.jsx'

const PAGE_SIZE = 3

function NavButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 30, height: 30,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: disabled ? 'var(--surface-dim)' : 'var(--surface)',
        border: `1px solid ${disabled ? 'var(--border)' : 'var(--border-dark)'}`,
        borderRadius: 6,
        fontSize: 15, fontFamily: 'var(--font-body)',
        color: disabled ? 'var(--dim)' : 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--primary)' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--border-dark)' }}
    >
      {children}
    </button>
  )
}

export default function CompanyGallery({ companies, totalCount }) {
  const [page, setPage] = useState(0)
  const [animClass, setAnimClass] = useState('')
  const [animKey, setAnimKey] = useState(0)

  const totalPages = Math.max(1, Math.ceil(companies.length / PAGE_SIZE))
  const slice = companies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [companies])

  const go = (delta) => {
    const next = page + delta
    if (next < 0 || next >= totalPages) return
    setAnimClass(delta > 0 ? 'gallery-slide-right' : 'gallery-slide-left')
    setAnimKey(k => k + 1)
    setPage(next)
  }

  if (companies.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.35 }}>—</div>
          <p style={{ color: 'var(--dim)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            No companies match the current filters
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 24px 8px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{
            fontSize: 18, fontWeight: 700,
            color: 'var(--indigo)', fontFamily: 'var(--font-mono)',
          }}>
            {companies.length}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
            {companies.length !== totalCount && totalCount
              ? `of ${totalCount} companies`
              : 'companies'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--dim)', userSelect: 'none',
          }}>
            {page + 1} / {totalPages}
          </span>
          <NavButton onClick={() => go(-1)} disabled={page === 0}>←</NavButton>
          <NavButton onClick={() => go(1)} disabled={page >= totalPages - 1}>→</NavButton>
        </div>
      </div>

      {/* Cards */}
      <div
        key={animKey}
        className={animClass}
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          padding: '14px 24px',
          alignContent: 'start',
          overflowY: 'auto',
        }}
      >
        {slice.map(c => (
          <CompanyCard key={c.id ?? c.operational_name} company={c} galleryMode />
        ))}
      </div>
    </div>
  )
}
