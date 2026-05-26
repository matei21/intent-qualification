import React, { useState } from 'react'

function formatRevenue(n) {
  if (!n && n !== 0) return null
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n
}

function formatEmployees(n) {
  if (!n && n !== 0) return null
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString()
}

export default function CompanyCard({ company, compact, galleryMode }) {
  const [descExpanded, setDescExpanded] = useState(false)

  const rev = formatRevenue(company.revenue)
  const emp = formatEmployees(company.employee_count)
  const yr = company.year_founded ? Math.round(company.year_founded) : null

  const dataParts = [
    rev && `${rev} rev`,
    emp && `${emp} emp`,
    yr && `Est. ${yr}`,
  ].filter(Boolean)

  const bmTags = (company.business_model || []).slice(0, galleryMode ? 4 : 3)
  const tmTags = (company.target_markets || []).slice(0, galleryMode ? 3 : 2)

  const location = [company.town, company.region_name].filter(Boolean).join(', ')

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: galleryMode ? '14px 16px' : compact ? '12px 14px' : '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: galleryMode ? 9 : 8,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Name + website row */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-body)', lineHeight: 1.3 }}>
          {company.operational_name || '—'}
        </div>
        {company.website && (
          <a
            href={`https://${company.website}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              color: 'var(--dim)',
              textDecoration: 'none',
              fontFamily: 'var(--font-body)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {company.website}
          </a>
        )}
      </div>

      {/* Tags row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {company.naics_label && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 10,
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
            background: 'var(--primary-light)',
            color: '#92600A',
            border: '1px solid rgba(255,184,0,0.4)',
            whiteSpace: 'nowrap',
            maxWidth: 180,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
            title={company.naics_label}
          >
            {company.naics_label}
          </span>
        )}
        {bmTags.map(bm => (
          <span key={bm} className="tag tag-cyan" style={{ fontSize: 10 }}>{bm}</span>
        ))}
        {tmTags.map(tm => (
          <span key={tm} className="tag tag-gray" style={{ fontSize: 10 }}>{tm}</span>
        ))}
      </div>

      {/* Description */}
      {location && galleryMode && (
        <div style={{
          fontSize: 11, color: 'var(--dim)',
          fontFamily: 'var(--font-body)', letterSpacing: '0.01em',
        }}>
          {location}
        </div>
      )}

      {company.description && (
        <div>
          <p
            onClick={() => setDescExpanded(e => !e)}
            style={{
              color: 'var(--text-muted)',
              fontSize: 12,
              lineHeight: 1.55,
              fontFamily: 'var(--font-body)',
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: descExpanded ? 'unset' : (galleryMode ? 4 : 2),
              overflow: 'hidden',
              cursor: 'pointer',
              margin: 0,
            }}
          >
            {company.description}
          </p>
        </div>
      )}

      {/* Data line */}
      {dataParts.length > 0 && (
        <div style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--dim)',
          letterSpacing: '0.01em',
        }}>
          {dataParts.join(' · ')}
        </div>
      )}
    </div>
  )
}
