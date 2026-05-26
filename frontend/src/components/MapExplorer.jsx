import React, { useState, useEffect, useMemo } from 'react'
import WorldMap from './WorldMap.jsx'
import FilterBar from './FilterBar.jsx'
import CompanyGallery from './CompanyGallery.jsx'

const API = 'http://localhost:8000'

const DEFAULT_FILTERS = {
  naics_labels: [],
  business_models: [],
  target_markets: [],
  revenue_min: '',
  revenue_max: '',
  employee_count_min: '',
  employee_count_max: '',
  year_founded_min: '',
  year_founded_max: '',
  is_public: null,
}

function applyFilters(companies, filters) {
  return companies.filter(c => {
    if (filters.naics_labels.length > 0 && !filters.naics_labels.includes(c.naics_label)) return false
    if (filters.business_models.length > 0 && !filters.business_models.some(bm => c.business_model?.includes(bm))) return false
    if (filters.target_markets.length > 0 && !filters.target_markets.some(tm => c.target_markets?.includes(tm))) return false
    if (filters.revenue_min !== '' && c.revenue !== null && c.revenue < Number(filters.revenue_min)) return false
    if (filters.revenue_max !== '' && c.revenue !== null && c.revenue > Number(filters.revenue_max)) return false
    if (filters.employee_count_min !== '' && c.employee_count !== null && c.employee_count < Number(filters.employee_count_min)) return false
    if (filters.employee_count_max !== '' && c.employee_count !== null && c.employee_count > Number(filters.employee_count_max)) return false
    if (filters.year_founded_min !== '' && c.year_founded !== null && c.year_founded < Number(filters.year_founded_min)) return false
    if (filters.year_founded_max !== '' && c.year_founded !== null && c.year_founded > Number(filters.year_founded_max)) return false
    if (filters.is_public !== null && c.is_public !== null && c.is_public !== filters.is_public) return false
    return true
  })
}

function MapSkeleton() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface-dim)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--dim)', fontFamily: 'var(--font-body)', fontSize: 13 }}>
        <div className="skeleton" style={{ width: 200, height: 14, margin: '0 auto 10px' }} />
        <div className="skeleton" style={{ width: 140, height: 10, margin: '0 auto' }} />
      </div>
    </div>
  )
}

export default function MapExplorer() {
  const [companies, setCompanies] = useState([])
  const [meta, setMeta] = useState({})
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${API}/companies`).then(r => r.json()),
      fetch(`${API}/meta`).then(r => r.json()),
    ])
      .then(([compData, metaData]) => {
        setCompanies(compData.companies || [])
        setMeta(metaData)
      })
      .catch(err => console.error('MapExplorer: failed to load data', err))
      .finally(() => setLoading(false))
  }, [])

  const filteredByFilters = useMemo(
    () => applyFilters(companies, filters),
    [companies, filters]
  )

  const countryDistribution = useMemo(() => {
    return filteredByFilters.reduce((acc, c) => {
      if (c.country_code) acc[c.country_code] = (acc[c.country_code] || 0) + 1
      return acc
    }, {})
  }, [filteredByFilters])

  const maxCount = useMemo(
    () => Math.max(...Object.values(countryDistribution), 1),
    [countryDistribution]
  )

  const displayedCompanies = useMemo(() => {
    if (selectedCountry) return filteredByFilters.filter(c => c.country_code === selectedCountry)
    return filteredByFilters
  }, [filteredByFilters, selectedCountry])

  const nullCounts = useMemo(() => ({
    naics: companies.filter(c => !c.naics_label).length,
    business_model: companies.filter(c => !c.business_model?.length).length,
    target_markets: companies.filter(c => !c.target_markets?.length).length,
    revenue: companies.filter(c => c.revenue === null || c.revenue === undefined).length,
    employee_count: companies.filter(c => c.employee_count === null || c.employee_count === undefined).length,
    year_founded: companies.filter(c => c.year_founded === null || c.year_founded === undefined).length,
  }), [companies])

  return (
    <section
      id="data-explorer"
      style={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
        scrollSnapAlign: 'start',
      }}
    >
      {/* Section header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--text)', letterSpacing: '-0.02em', margin: 0,
          }}>
            Data Explorer
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: 0, marginTop: 1 }}>
            Browse and filter the full company corpus. Click a country to focus.
          </p>
        </div>

        {/* Stat pills */}
        {!loading && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {[
              { val: companies.length, label: 'companies' },
              { val: new Set(companies.map(c => c.country_code).filter(Boolean)).size, label: 'countries' },
              { val: new Set(companies.map(c => c.naics_label).filter(Boolean)).size, label: 'industries' },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700,
                  color: 'var(--text)', lineHeight: 1.1,
                }}>{val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{
        height: 280,
        flexShrink: 0,
        background: '#F0F2F5',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {loading ? <MapSkeleton /> : (
          <WorldMap
            countryDistribution={countryDistribution}
            maxCount={maxCount}
            selectedCountry={selectedCountry}
            onCountryClick={setSelectedCountry}
          />
        )}
      </div>

      {/* Filter bar */}
      <FilterBar
        meta={meta}
        filters={filters}
        onFiltersChange={setFilters}
        selectedCountry={selectedCountry}
        onClearCountry={() => setSelectedCountry(null)}
        nullCounts={nullCounts}
      />

      {/* Gallery */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="skeleton" style={{ width: 160, height: 14, margin: '0 auto 8px' }} />
            <div className="skeleton" style={{ width: 100, height: 10, margin: '0 auto' }} />
          </div>
        </div>
      ) : (
        <CompanyGallery
          companies={displayedCompanies}
          totalCount={companies.length}
        />
      )}

      {/* Scroll-down nudge */}
      <div style={{
        textAlign: 'center',
        padding: '12px 24px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <a
          href="#search"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontFamily: 'var(--font-body)', fontWeight: 600,
            color: 'var(--indigo)', textDecoration: 'none',
            padding: '5px 16px',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 999,
            background: 'rgba(99,102,241,0.04)',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.10)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.04)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
          }}
        >
          Search by Intent
        </a>
      </div>
    </section>
  )
}
