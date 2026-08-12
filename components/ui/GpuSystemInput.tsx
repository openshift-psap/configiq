'use client'

import * as React from 'react'
import type { GpuOption } from '@/lib/hooks/useAicCatalog'
import styles from './GpuSystemInput.module.css'

interface GpuSystemInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  gpuOptions: GpuOption[]
}

export function GpuSystemInput({ id, value, onChange, gpuOptions }: GpuSystemInputProps) {
  const current = gpuOptions.find(g => g.systemId === value)

  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className={styles.label}>GPU system</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={styles.select}
      >
        {gpuOptions.length === 0
          ? <option value={value} disabled>Loading GPU catalog…</option>
          : gpuOptions.map(g => (
              <option key={g.systemId} value={g.systemId}>
                {g.label}{g.vramGb ? ` — ${g.vramGb} GB` : ''}
              </option>
            ))
        }
      </select>
      {current && (
        <div className={styles.helperText}>
          {current.vramGb != null && <>{current.vramGb} GB</>}
          {current.bandwidthTbps != null && <> · {current.bandwidthTbps} TB/s</>}
          {current.tflopsBf16 != null && <> · {current.tflopsBf16.toFixed(0)} TFLOPS</>}
        </div>
      )}
    </div>
  )
}
