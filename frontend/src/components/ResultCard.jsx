import React, { useState } from 'react'
import ScoreBars from './ScoreBars.jsx'

const COUNTRY_NAMES = {
  ar: 'Argentina', at: 'Austria', au: 'Australia', be: 'Belgium',
  br: 'Brazil', ca: 'Canada', ch: 'Switzerland', cl: 'Chile',
  cn: 'China', de: 'Germany', dk: 'Denmark', eg: 'Egypt',
  es: 'Spain', fi: 'Finland', fr: 'France', gb: 'United Kingdom',
  gr: 'Greece', hk: 'Hong Kong', hr: 'Croatia', id: 'Indonesia',
  ie: 'Ireland', in: 'India', is: 'Iceland', it: 'Italy',
  jp: 'Japan', kr: 'South Korea', kw: 'Kuwait', lt: 'Lithuania',
  lu: 'Luxembourg', nl: 'Netherlands', no: 'Norway', nz: 'New Zealand',
  pl: 'Poland', pt: 'Portugal', ro: 'Romania', ru: 'Russia',
  se: 'Sweden', sg: 'Singapore', tr: 'Turkey', tw: 'Taiwan',
  ua: 'Ukraine', us: 'United States', vn: 'Vietnam',
}

function formatRevenue(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n
}

function formatEmployees(n) {
  if (!n && n !== 0) return '—'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toLocaleString()
}

function SourceBadge({ source }) {
  const config = {
    both: { label: 'Filters + Semantic', cls: 'tag-green' },
    filters_only: { label: 'Filters Only', cls: 'tag-cyan' },
    semantic_only: { label: 'Semantic Only', cls: 'tag-purple' },
  }[source] || { label: source, cls: 'tag-gray' }
  return <span className={`tag ${config.cls}`}>{config.label}</span>
}

function TagList({ items, limit = 5, colorCls = 'tag-gray' }) {
  const [expanded, setExpanded] = useState(false)
  if (!items || !items.length) return <span style={{ color: 'var(--dim)', fontSize: 12 }}>—</span>
  const visible = expanded ? items : items.slice(0, limit)
  const hasMore = items.length > limit
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {visible.map(item => (
        <span key={item} className={`tag ${colorCls}`}>{item}</span>
      ))}
      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'transparent', border: 'none', color: 'var(--indigo)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)',
            padding: '2px 4px', fontWeight: 600,
          }}
        >
          {expanded ? 'less' : `+${items.length - limit} more`}
        </button>
      )}
    </div>
  )
}

function DetailRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{
        minWidth: 110, color: 'var(--dim)', fontSize: 12,
        fontWeight: 500, paddingTop: 2, fontFamily: 'var(--font-body)',
      }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

export default function ResultCard({ result }) {
  const [descExpanded, setDescExpanded] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const addr = result.address || {}
  const countryName = COUNTRY_NAMES[addr.country_code] || addr.country_code || null
  const location = [countryName, addr.town, addr.region_name]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .join(' · ')

  const totalScore = result.scores.total
  const scoreColor = totalScore > 0.55
    ? 'var(--success)'
    : totalScore > 0.40
      ? 'var(--warning)'
      : 'var(--dim)'

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--primary)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Rank badge */}
        <div style={{
          minWidth: 48,
          height: 48,
          borderRadius: 8,
          background: 'var(--primary-light)',
          border: '1px solid rgba(255,184,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 17,
          color: '#92600A',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
        }}>
          #{result.rank}
        </div>

        {/* Name + website + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text)',
              fontFamily: 'var(--font-body)',
            }}>
              {result.operational_name}
            </span>
            {result.website && (
              <a
                href={`https://${result.website}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--dim)', fontSize: 12, fontFamily: 'var(--font-body)' }}
              >
                {result.website}
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <SourceBadge source={result.match_source} />
            {result.is_public === null || result.is_public === undefined ? (
              <span className="tag tag-gray">Public/Private unknown</span>
            ) : (
              <span className={`tag ${result.is_public ? 'tag-cyan' : 'tag-gray'}`}>
                {result.is_public ? 'Public' : 'Private'}
              </span>
            )}
            {result.null_filter_fields?.length > 0 && (
              <span className="tag tag-amber" title={`Missing: ${result.null_filter_fields.join(', ')}`}>
                ! Missing: {result.null_filter_fields.join(', ')}
              </span>
            )}
          </div>
        </div>

        {/* Total score */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontSize: 22,
            fontWeight: 700,
            color: scoreColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {result.scores.total.toFixed(2)}
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 11, fontFamily: 'var(--font-body)' }}>
            total score
          </div>
        </div>
      </div>

      {/* Score bars */}
      <ScoreBars scores={result.scores} />

      {/* Categorical matches */}
      {(() => {
        const m = result.matches
        const hasMatches = m && (
          Boolean(m.naics)
          || (m.target_markets?.length > 0)
          || (m.business_models?.length > 0)
        )
        return hasMatches
      })() && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '8px 12px',
          background: 'rgba(255,184,0,0.05)',
          border: '1px solid rgba(255,184,0,0.2)',
          borderRadius: 6,
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--dim)',
            fontFamily: 'var(--font-body)',
          }}>
            matched
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {result.matches.naics && (
              <span className="tag tag-green" title="NAICS label match">
                NAICS · {result.matches.naics}
              </span>
            )}
            {result.matches.target_markets?.map(m => (
              <span key={`tm-${m}`} className="tag tag-cyan" title="target market match">
                {m}
              </span>
            ))}
            {result.matches.business_models?.map(m => (
              <span key={`bm-${m}`} className="tag tag-purple" title="business model match">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      <hr className="divider" />

      {/* Description */}
      <div>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: 13,
          lineHeight: 1.65,
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: descExpanded ? 'unset' : 2,
          overflow: 'hidden',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          margin: 0,
        }}
          onClick={() => setDescExpanded(e => !e)}
        >
          {result.description}
        </p>
        <button
          onClick={() => setDescExpanded(e => !e)}
          style={{
            background: 'transparent', border: 'none', color: 'var(--indigo)',
            fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
            marginTop: 2, padding: 0, fontWeight: 600,
          }}
        >
          {descExpanded ? 'less' : 'more'}
        </button>
      </div>

      {/* Collapsible details */}
      <div>
        <button
          onClick={() => setDetailsOpen(o => !o)}
          style={{
            background: 'var(--surface-dim)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            borderRadius: 6,
            padding: '5px 14px',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'border-color 0.12s, background 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--border-dark)'
            e.currentTarget.style.background = '#ECECEE'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = 'var(--surface-dim)'
          }}
        >
          {detailsOpen ? 'Hide details' : 'Show details'}
        </button>

        {detailsOpen && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Location">
              <span style={{ color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                {location || '—'}
              </span>
            </DetailRow>
            <DetailRow label="Revenue">
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                {formatRevenue(result.revenue)}
              </span>
            </DetailRow>
            <DetailRow label="Employees">
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                {formatEmployees(result.employee_count)}
              </span>
            </DetailRow>
            <DetailRow label="Year founded">
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                {result.year_founded ? Math.round(result.year_founded) : '—'}
              </span>
            </DetailRow>
            <DetailRow label="NAICS">
              <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                {result.primary_naics || '—'}
              </span>
            </DetailRow>
            <DetailRow label="Business model">
              <TagList items={result.business_model} limit={6} colorCls="tag-purple" />
            </DetailRow>
            <DetailRow label="Target markets">
              <TagList items={result.target_markets} limit={6} colorCls="tag-cyan" />
            </DetailRow>
            <DetailRow label="Core offerings">
              <TagList items={result.core_offerings} limit={5} colorCls="tag-gray" />
            </DetailRow>
          </div>
        )}
      </div>
    </div>
  )
}
