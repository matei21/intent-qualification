import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const COUNTRY_NAMES = {
  ar: 'Argentina', at: 'Austria', au: 'Australia', be: 'Belgium', br: 'Brazil',
  ca: 'Canada', ch: 'Switzerland', cl: 'Chile', cn: 'China', de: 'Germany',
  dk: 'Denmark', eg: 'Egypt', es: 'Spain', fi: 'Finland', fr: 'France',
  gb: 'United Kingdom', gr: 'Greece', hk: 'Hong Kong', hr: 'Croatia',
  id: 'Indonesia', ie: 'Ireland', in: 'India', is: 'Iceland', it: 'Italy',
  jp: 'Japan', kr: 'South Korea', kw: 'Kuwait', lt: 'Lithuania', lu: 'Luxembourg',
  nl: 'Netherlands', no: 'Norway', nz: 'New Zealand', pl: 'Poland', pt: 'Portugal',
  ro: 'Romania', ru: 'Russia', se: 'Sweden', sg: 'Singapore', tr: 'Turkey',
  tw: 'Taiwan', ua: 'Ukraine', us: 'United States', vn: 'Vietnam',
}

// ---------------------------------------------------------------------------
// Generic dropdown wrapper
// ---------------------------------------------------------------------------
function FilterDropdown({ label, activeCount, children, nullCount, nullLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState(null)

  const updatePosition = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const openUp = spaceBelow < 260 && rect.top > spaceBelow
    const estimatedHeight = 320
    const height = Math.max(180, Math.min(estimatedHeight, openUp ? rect.top - 12 : spaceBelow))

    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, rect.left),
      top: openUp ? Math.max(8, rect.top - height - 8) : rect.bottom + 6,
      width: Math.max(rect.width, 240),
      maxHeight: height,
      zIndex: 1300,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()

    const handler = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inTrigger && !inMenu) setOpen(false)
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', handler)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, updatePosition])

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 32,
          padding: '0 10px',
          background: activeCount > 0 ? 'var(--primary-light)' : 'var(--surface)',
          border: `1px solid ${activeCount > 0 ? 'rgba(255,184,0,0.5)' : open ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 6,
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: activeCount > 0 ? 600 : 400,
          color: activeCount > 0 ? '#7a4f00' : open ? 'var(--text)' : 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'all 0.12s',
          whiteSpace: 'nowrap',
        }}
        title={activeCount > 0 ? `${label} active: ${activeCount}${nullCount > 0 ? `, ${nullCount} null` : ''}` : label}
      >
        {label}
        {activeCount > 0 && (
          <span style={{
            background: 'var(--primary)', color: '#111', borderRadius: 999,
            padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
          }}>
            {activeCount}
          </span>
        )}
        {nullCount > 0 && (
          <span style={{
            background: 'rgba(245,158,11,0.10)',
            color: 'var(--warning)',
            border: '1px solid rgba(245,158,11,0.20)',
            borderRadius: 999,
            padding: '0 5px',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '16px',
          }}>
            {nullCount} null
          </span>
        )}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{
          flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }}>
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            ...menuStyle,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: menuStyle.maxHeight, overflowY: 'auto' }}>
            {children}
            {nullCount > 0 && (
              <div style={{
                borderTop: '1px solid var(--border)',
                padding: '6px 12px',
                fontSize: 11,
                color: 'var(--dim)',
                fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ color: 'var(--warning)', fontSize: 10 }}>&#9432;</span>
                {nullCount} {nullLabel || 'companies missing this data'}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Searchable multiselect inside a dropdown
// ---------------------------------------------------------------------------
function MultiDropdown({ label, options, selected, onChange, nullCount, nullLabel }) {
  const [search, setSearch] = useState('')
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const preview = selected.length > 0
    ? selected.length === 1
      ? selected[0]
      : `${selected.slice(0, 2).join(', ')}${selected.length > 2 ? ` +${selected.length - 2}` : ''}`
    : ''

  const toggle = (opt) => {
    onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt])
  }

  return (
    <FilterDropdown label={label} activeCount={selected.length} nullCount={nullCount} nullLabel={nullLabel}>
      <div style={{ padding: '8px 8px 4px' }}>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            width: '100%', background: 'var(--surface-dim)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '5px 9px', fontFamily: 'var(--font-body)',
            fontSize: 12, color: 'var(--text)', outline: 'none',
          }}
        />
        {selected.length > 0 && (
          <div style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--dim)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.4,
          }}>
            Selected: {preview}
          </div>
        )}
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '8px 12px', color: 'var(--dim)', fontSize: 12 }}>No matches</div>
        )}
        {filtered.map(opt => {
          const checked = selected.includes(opt)
          return (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 12px', cursor: 'pointer',
              background: checked ? 'var(--primary-light)' : 'transparent',
              fontSize: 12, fontFamily: 'var(--font-body)',
              color: checked ? '#7a4f00' : 'var(--text)',
            }}
              onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'var(--surface-dim)' }}
              onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(opt)}
                style={{ accentColor: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
            </label>
          )
        })}
      </div>
      {selected.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--border)', padding: '5px 10px',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <button onClick={() => onChange([])} style={{
            background: 'none', border: 'none', color: 'var(--danger)',
            fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600,
          }}>
            Clear
          </button>
        </div>
      )}
    </FilterDropdown>
  )
}

// ---------------------------------------------------------------------------
// Range popover (revenue / employees / year)
// ---------------------------------------------------------------------------
function RangeDropdown({ label, minKey, maxKey, filters, onFiltersChange, prefix, nullCount, nullLabel }) {
  const min = filters[minKey], max = filters[maxKey]
  const activeCount = (min !== '' ? 1 : 0) + (max !== '' ? 1 : 0)
  const summary = activeCount > 0
    ? `${min !== '' ? `${prefix || ''}${min}` : 'Any'}${max !== '' ? ` - ${prefix || ''}${max}` : ''}`
    : ''

  return (
    <FilterDropdown label={label} activeCount={activeCount} nullCount={nullCount} nullLabel={nullLabel}>
      <div style={{ padding: '12px' }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dim)', marginBottom: 8 }}>
          {label}
        </div>
        {activeCount > 0 && (
          <div style={{
            marginBottom: 8,
            fontSize: 11,
            color: 'var(--dim)',
            fontFamily: 'var(--font-body)',
          }}>
            Selected: {summary}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {[
            { key: minKey, ph: prefix ? `${prefix}0` : '0' },
            { key: maxKey, ph: 'No limit' },
          ].map(({ key, ph }, i) => (
            <React.Fragment key={key}>
              {i === 1 && <span style={{ color: 'var(--dim)', fontSize: 11, flexShrink: 0 }}>—</span>}
              <div style={{ position: 'relative', flex: 1 }}>
                {prefix && (
                  <span style={{
                    position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-mono)', pointerEvents: 'none',
                  }}>{prefix}</span>
                )}
                <input
                  type="number"
                  value={filters[key]}
                  onChange={e => onFiltersChange({ ...filters, [key]: e.target.value })}
                  placeholder={ph}
                  style={{
                    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 5, padding: prefix ? '6px 6px 6px 16px' : '6px 8px',
                    fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', outline: 'none',
                  }}
                />
              </div>
            </React.Fragment>
          ))}
        </div>
        {activeCount > 0 && (
          <button
            onClick={() => onFiltersChange({ ...filters, [minKey]: '', [maxKey]: '' })}
            style={{
              marginTop: 8, background: 'none', border: 'none', color: 'var(--danger)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, padding: 0,
            }}
          >
            Clear
          </button>
        )}
      </div>
    </FilterDropdown>
  )
}

// ---------------------------------------------------------------------------
// Business model toggle chips (inline, no dropdown)
// ---------------------------------------------------------------------------
function BizModelDropdown({ options, selected, onChange, nullCount }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuRef = useRef(null)
  const [menuStyle, setMenuStyle] = useState(null)

  const updatePosition = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const openUp = spaceBelow < 220 && rect.top > spaceBelow
    const estimatedHeight = 240
    const height = Math.max(160, Math.min(estimatedHeight, openUp ? rect.top - 12 : spaceBelow))
    setMenuStyle({
      position: 'fixed',
      left: Math.max(8, rect.left),
      top: openUp ? Math.max(8, rect.top - height - 8) : rect.bottom + 6,
      width: Math.max(rect.width, 240),
      maxHeight: height,
      zIndex: 1300,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePosition()

    const handler = (e) => {
      const inTrigger = ref.current && ref.current.contains(e.target)
      const inMenu = menuRef.current && menuRef.current.contains(e.target)
      if (!inTrigger && !inMenu) setOpen(false)
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', handler)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, updatePosition])

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          height: 32, padding: '0 10px',
          background: selected.length > 0 ? 'var(--primary-light)' : 'var(--surface)',
          border: `1px solid ${selected.length > 0 ? 'rgba(255,184,0,0.5)' : open ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: 6, fontFamily: 'var(--font-body)', fontSize: 12,
          fontWeight: selected.length > 0 ? 600 : 400,
          color: selected.length > 0 ? '#7a4f00' : open ? 'var(--text)' : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
        }}
        title={selected.length > 0 ? `${selected.length} business model${selected.length === 1 ? '' : 's'} selected${nullCount > 0 ? `, ${nullCount} null` : ''}` : 'Business Model'}
      >
        Business Model
        {selected.length > 0 && (
          <span style={{
            background: 'var(--primary)', color: '#111', borderRadius: 999,
            padding: '0 5px', fontSize: 10, fontWeight: 700, lineHeight: '16px',
          }}>{selected.length}</span>
        )}
        {nullCount > 0 && (
          <span style={{
            background: 'rgba(245,158,11,0.10)',
            color: 'var(--warning)',
            border: '1px solid rgba(245,158,11,0.20)',
            borderRadius: 999,
            padding: '0 5px',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '16px',
          }}>
            {nullCount} null
          </span>
        )}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{
          flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
        }}>
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          style={{
            ...menuStyle,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
            padding: '10px 12px',
            overflow: 'hidden',
          }}
        >
          <div style={{ maxHeight: menuStyle.maxHeight, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {options.map(bm => {
                const active = selected.includes(bm)
                return (
                  <button key={bm} onClick={() => {
                    onChange(active ? selected.filter(x => x !== bm) : [...selected, bm])
                  }} style={{
                    padding: '3px 10px', borderRadius: 999,
                    border: `1px solid ${active ? 'rgba(255,184,0,0.5)' : 'var(--border)'}`,
                    background: active ? 'var(--primary-light)' : 'var(--surface-dim)',
                    color: active ? '#7a4f00' : 'var(--text-muted)',
                    fontSize: 11, fontFamily: 'var(--font-body)',
                    fontWeight: active ? 600 : 400, cursor: 'pointer', transition: 'all 0.1s',
                  }}>{bm}</button>
                )
              })}
            </div>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} style={{
                marginTop: 8, background: 'none', border: 'none', color: 'var(--danger)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, padding: 0,
              }}>Clear</button>
            )}
            {nullCount > 0 && (
              <div style={{
                marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
                fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--font-body)',
              }}>
                <span style={{ color: 'var(--warning)', fontSize: 10 }}>&#9432;</span>{' '}
                {nullCount} companies have no business model data
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------
export default function FilterBar({
  meta,
  filters,
  onFiltersChange,
  selectedCountry,
  onClearCountry,
  nullCounts,
}) {
  const naicsList = meta?.naics_labels || []
  const bizModels = meta?.business_models || []
  const targetMarketsList = meta?.target_markets || []

  const hasAny = (
    selectedCountry ||
    filters.naics_labels.length > 0 ||
    filters.business_models.length > 0 ||
    filters.target_markets.length > 0 ||
    filters.revenue_min !== '' || filters.revenue_max !== '' ||
    filters.employee_count_min !== '' || filters.employee_count_max !== '' ||
    filters.year_founded_min !== '' || filters.year_founded_max !== ''
  )

  const clearAll = () => {
    onFiltersChange({
      naics_labels: [], business_models: [], target_markets: [],
      revenue_min: '', revenue_max: '',
      employee_count_min: '', employee_count_max: '',
      year_founded_min: '', year_founded_max: '',
      is_public: null,
    })
    onClearCountry()
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 24px',
      height: 60,
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {/* Country chip */}
      {selectedCountry && (
        <button
          onClick={onClearCountry}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 28, padding: '0 8px 0 10px',
            background: 'var(--primary-light)', border: '1px solid rgba(255,184,0,0.5)',
            borderRadius: 999, fontFamily: 'var(--font-body)', fontSize: 12,
            fontWeight: 600, color: '#7a4f00', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {COUNTRY_NAMES[selectedCountry] || selectedCountry.toUpperCase()}
          <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.6 }}>×</span>
        </button>
      )}

      {selectedCountry && (
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
      )}

      {/* Industry / NAICS */}
      <MultiDropdown
        label="Industry"
        options={naicsList}
        selected={filters.naics_labels}
        onChange={val => onFiltersChange({ ...filters, naics_labels: val })}
        nullCount={nullCounts?.naics ?? 0}
        nullLabel="companies without NAICS data"
      />

      {/* Business Models */}
      <BizModelDropdown
        options={bizModels}
        selected={filters.business_models}
        onChange={val => onFiltersChange({ ...filters, business_models: val })}
        nullCount={nullCounts?.business_model ?? 0}
      />

      {/* Target Markets */}
      <MultiDropdown
        label="Markets"
        options={targetMarketsList}
        selected={filters.target_markets}
        onChange={val => onFiltersChange({ ...filters, target_markets: val })}
        nullCount={nullCounts?.target_markets ?? 0}
        nullLabel="companies without market data"
      />

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Revenue */}
      <RangeDropdown
        label="Revenue"
        minKey="revenue_min" maxKey="revenue_max"
        filters={filters} onFiltersChange={onFiltersChange}
        prefix="$"
        nullCount={nullCounts?.revenue ?? 0}
        nullLabel="companies without revenue data"
      />

      {/* Employees */}
      <RangeDropdown
        label="Employees"
        minKey="employee_count_min" maxKey="employee_count_max"
        filters={filters} onFiltersChange={onFiltersChange}
        nullCount={nullCounts?.employee_count ?? 0}
        nullLabel="companies without employee data"
      />

      {/* Founded */}
      <RangeDropdown
        label="Founded"
        minKey="year_founded_min" maxKey="year_founded_max"
        filters={filters} onFiltersChange={onFiltersChange}
        nullCount={nullCounts?.year_founded ?? 0}
        nullLabel="companies without founding year"
      />

      {/* Clear all */}
      {hasAny && (
        <>
          <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
          <button
            onClick={clearAll}
            style={{
              height: 28, padding: '0 10px', background: 'none', flexShrink: 0,
              border: '1px solid var(--border)', borderRadius: 6,
              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
              color: 'var(--danger)', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Clear all
          </button>
        </>
      )}
    </div>
  )
}
