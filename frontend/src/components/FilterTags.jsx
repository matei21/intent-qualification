import React from 'react'

const FILTER_LABELS = {
  country_codes:      'Countries',
  business_models:    'Business Models',
  naics_labels:       'NAICS',
  target_markets:     'Target Markets',
  is_public:          'Public',
  revenue_min:             'Revenue >=',
  revenue_max:             'Revenue <=',
  employee_count_min:      'Employees >=',
  employee_count_max:      'Employees <=',
  year_founded_min:        'Founded >=',
  year_founded_max:        'Founded <=',
}

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

function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return n.toString()
}

function formatScalar(key, val) {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'number') {
    if (key.includes('revenue')) return '$' + formatNum(val)
    if (key.includes('employee') || key.includes('founded')) return val.toLocaleString()
    return formatNum(val)
  }
  return String(val)
}

function expandValues(key, val) {
  if (Array.isArray(val)) {
    if (key === 'country_codes') return val.map(c => COUNTRY_NAMES[c] || c.toUpperCase())
    return val
  }
  return [formatScalar(key, val)]
}

function isEmptyValue(val) {
  if (val === null || val === undefined) return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'string' && val.trim() === '') return true
  return false
}

function FilterRow({ filterKey, value }) {
  const label = FILTER_LABELS[filterKey] || filterKey
  const chips = expandValues(filterKey, value)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
      <span style={{
        minWidth: 110,
        color: 'var(--dim)',
        fontSize: 12,
        fontWeight: 600,
        paddingTop: 4,
        textAlign: 'right',
        flexShrink: 0,
        fontFamily: 'var(--font-body)',
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
        {chips.map((chip, i) => (
          <span key={`${filterKey}-${i}-${chip}`} className="tag tag-cyan">
            {chip}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function FilterTags({ semanticQuery, filtersApplied }) {
  const filters = filtersApplied || {}
  const populated = Object.entries(filters).filter(([, v]) => !isEmptyValue(v))
  const hasFilters = populated.length > 0

  const ordered = [
    ...Object.keys(FILTER_LABELS).filter(k => populated.find(([pk]) => pk === k)),
    ...populated.map(([k]) => k).filter(k => !(k in FILTER_LABELS)),
  ]

  if (!semanticQuery && !hasFilters) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 12,
      padding: '12px 16px',
      background: 'var(--surface-dim)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      fontFamily: 'var(--font-body)',
    }}>
      {semanticQuery && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            minWidth: 110,
            color: 'var(--dim)',
            fontSize: 12,
            fontWeight: 600,
            paddingTop: 2,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            semantic
          </span>
          <span style={{
            color: 'var(--text)',
            fontSize: 13,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}>
            "{semanticQuery}"
          </span>
        </div>
      )}

      {hasFilters && (
        <>
          {semanticQuery && <hr className="divider" style={{ margin: '2px 0' }} />}
          {ordered.map(key => (
            <FilterRow key={key} filterKey={key} value={filters[key]} />
          ))}
        </>
      )}

      {!hasFilters && semanticQuery && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            minWidth: 110,
            color: 'var(--dim)',
            fontSize: 12,
            fontWeight: 600,
            paddingTop: 2,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            filters
          </span>
          <span style={{ color: 'var(--dim)', fontSize: 12, fontStyle: 'italic', paddingTop: 2 }}>
            none — pure semantic search
          </span>
        </div>
      )}
    </div>
  )
}
