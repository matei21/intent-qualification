import React from 'react'

const SEMANTIC_SCORES = [
  { key: 'core_offerings', label: 'Core',        emphasis: true },
  { key: 'description',    label: 'Description', emphasis: true },
]

function scoreColor(val) {
  if (val >= 0.6) return 'var(--success)'   // emerald
  if (val >= 0.4) return 'var(--warning)'   // amber
  if (val > 0)    return 'var(--indigo)'    // indigo
  return 'var(--dim)'
}

function ScoreBar({ label, value, emphasis }) {
  const v = value ?? 0
  const color = scoreColor(v)
  const pct = Math.min(100, v * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 80,
        color: emphasis ? 'var(--text)' : 'var(--dim)',
        fontSize: 11,
        fontWeight: emphasis ? 700 : 500,
        textAlign: 'right',
        flexShrink: 0,
        fontFamily: 'var(--font-body)',
      }}>
        {label}
      </span>
      <div style={{
        flex: 1,
        height: emphasis ? 7 : 5,
        background: 'var(--border)',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        width: 36,
        fontSize: 11,
        fontWeight: 600,
        color: v > 0 ? color : 'var(--dim)',
        textAlign: 'right',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
      }}>
        {v.toFixed(2)}
      </span>
    </div>
  )
}

export default function ScoreBars({ scores }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {SEMANTIC_SCORES.map(s => (
        <ScoreBar
          key={s.key}
          label={s.label}
          value={scores[s.key]}
          emphasis={s.emphasis}
        />
      ))}
    </div>
  )
}
