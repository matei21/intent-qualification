import React, { useState, useCallback } from 'react'
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'

// ISO 3166-1 numeric → alpha-2 mapping
const NUMERIC_TO_A2 = {
  '32': 'ar', '40': 'at', '36': 'au', '56': 'be', '76': 'br',
  '124': 'ca', '756': 'ch', '152': 'cl', '156': 'cn', '276': 'de',
  '208': 'dk', '818': 'eg', '724': 'es', '246': 'fi', '250': 'fr',
  '826': 'gb', '300': 'gr', '344': 'hk', '191': 'hr', '360': 'id',
  '372': 'ie', '356': 'in', '352': 'is', '380': 'it', '392': 'jp',
  '410': 'kr', '414': 'kw', '440': 'lt', '442': 'lu', '528': 'nl',
  '578': 'no', '554': 'nz', '616': 'pl', '620': 'pt', '642': 'ro',
  '643': 'ru', '752': 'se', '702': 'sg', '792': 'tr', '158': 'tw',
  '804': 'ua', '840': 'us', '704': 'vn',
}

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

function getCountryColor(a2, distribution, maxCount, selected) {
  if (selected === a2) return '#E6A000'
  const count = distribution[a2] || 0
  if (count === 0) return '#E9ECF0'
  // sqrt scale from pale gold → full amber
  const t = Math.sqrt(count / Math.max(maxCount, 1))
  const r1 = 254, g1 = 243, b1 = 199
  const r2 = 245, g2 = 158, b2 = 11
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`
}

export default function WorldMap({ countryDistribution, maxCount, selectedCountry, onCountryClick }) {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, name: '', count: 0 })
  const [hoveredA2, setHoveredA2] = useState(null)
  const [zoom, setZoom] = useState(1)

  const handleMouseMove = useCallback((e) => {
    setTooltip(t => ({ ...t, x: e.clientX + 14, y: e.clientY - 10 }))
  }, [])

  const clampZoom = useCallback((value) => Math.min(6, Math.max(0.8, value)), [])

  const adjustZoom = useCallback((delta) => {
    setZoom(current => clampZoom(Number((current + delta).toFixed(2))))
  }, [clampZoom])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 420 }}
      onMouseMove={handleMouseMove}
    >
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {[
          { label: '+', title: 'Zoom in', action: () => adjustZoom(0.2) },
          { label: '−', title: 'Zoom out', action: () => adjustZoom(-0.2) },
          { label: 'Reset', title: 'Reset zoom', action: () => setZoom(1) },
        ].map(btn => (
          <button
            key={btn.title}
            onClick={btn.action}
            title={btn.title}
            style={{
              width: btn.label === 'Reset' ? 56 : 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid rgba(17,24,39,0.12)',
              background: 'rgba(255,255,255,0.94)',
              color: 'var(--text)',
              fontFamily: 'var(--font-body)',
              fontSize: btn.label === 'Reset' ? 11 : 18,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <ComposableMap
        width={800}
        height={420}
        style={{ width: '100%', height: '100%' }}
        projectionConfig={{ scale: 130, center: [10, 10] }}
      >
        <ZoomableGroup zoom={zoom} minZoom={0.8} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map(geo => {
                const numId = String(geo.id)
                const a2 = NUMERIC_TO_A2[numId]
                const count = a2 ? (countryDistribution[a2] || 0) : 0
                const isKnown = Boolean(a2)
                const isSelected = selectedCountry === a2
                const isHovered = hoveredA2 === a2

                let fill = isKnown
                  ? getCountryColor(a2, countryDistribution, maxCount, selectedCountry)
                  : '#E9ECF0'

                // Lighten slightly on hover (when not selected)
                if (isHovered && isKnown && !isSelected) {
                  fill = count > 0 ? '#FCD34D' : '#D1D5DB'
                }

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none', cursor: isKnown ? 'pointer' : 'default' },
                      hover:   { outline: 'none', cursor: isKnown ? 'pointer' : 'default' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() => {
                      if (!isKnown) return
                      setHoveredA2(a2)
                      setTooltip(t => ({
                        ...t,
                        visible: true,
                        name: COUNTRY_NAMES[a2] || a2.toUpperCase(),
                        count,
                      }))
                    }}
                    onMouseLeave={() => {
                      setHoveredA2(null)
                      setTooltip(t => ({ ...t, visible: false }))
                    }}
                    onClick={() => {
                      if (!isKnown) return
                      onCountryClick(isSelected ? null : a2)
                    }}
                  />
                )
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip.visible && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          pointerEvents: 'none',
          zIndex: 1000,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          padding: '8px 12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          minWidth: 120,
        }}>
          <div style={{ fontWeight: 700, color: '#111827', marginBottom: 4 }}>
            {tooltip.name}
          </div>
          <div style={{ color: '#6B7280', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#FFB800', fontSize: 10 }}>●</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#111827' }}>
              {tooltip.count}
            </span>
            <span>{tooltip.count === 1 ? 'company' : 'companies'}</span>
          </div>
        </div>
      )}

      {/* Watermark hint */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 12,
        fontSize: 11,
        color: '#9CA3AF',
        fontFamily: 'var(--font-body)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        hover a country · click to explore · use + / − to zoom
      </div>
    </div>
  )
}
