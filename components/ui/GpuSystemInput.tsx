'use client'

import * as React from 'react'
import { Switch } from '@patternfly/react-core'
import { getAppConfig } from '@/lib/app-config'
import type { GpuOption } from '@/lib/hooks/useAicCatalog'
import styles from './GpuSystemInput.module.css'

interface GpuSystemInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  gpuOptions: GpuOption[]
}

export function GpuSystemInput({ id, value, onChange, gpuOptions }: GpuSystemInputProps) {
  const [supportedOnly, setSupportedOnly] = React.useState(false)
  const prevGpu = React.useRef(value)

  const cfg = getAppConfig()
  const supportedSystems = cfg.supportedSystems ?? []
  const validatedOptions = gpuOptions.filter(g => supportedSystems.includes(g.systemId))
  const activeOptions = supportedOnly ? validatedOptions : gpuOptions
  const current = activeOptions.find(g => g.systemId === value)

  const handleToggle = (_: React.FormEvent, checked: boolean) => {
    setSupportedOnly(checked)
    if (checked) {
      prevGpu.current = value
      if (!supportedSystems.includes(value) && validatedOptions.length > 0) {
        onChange(validatedOptions[0].systemId)
      }
    } else {
      onChange(prevGpu.current)
    }
  }

  const vendorGroups = React.useMemo(() => {
    const groups = new Map<string, GpuOption[]>()
    for (const g of activeOptions) {
      const key = g.vendor ?? 'other'
      const list = groups.get(key)
      if (list) list.push(g)
      else groups.set(key, [g])
    }
    return groups
  }, [activeOptions])

  return (
    <div className={styles.wrapper}>
      <label htmlFor={id} className={styles.label}>GPU system</label>
      <div className={styles.toggle}>
        <Switch
          id={`${id}-validated-only`}
          label="Tested only"
          isChecked={supportedOnly}
          onChange={handleToggle}
          isReversed
        />
      </div>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={styles.select}
      >
        {activeOptions.length === 0
          ? <option value={value} disabled>Loading GPU catalog…</option>
          : [...vendorGroups.entries()].map(([vendor, gpus]) => (
              <optgroup key={vendor} label={vendor.toUpperCase()}>
                {gpus.map(g => (
                  <option key={g.systemId} value={g.systemId}>
                    {g.label}
                    {g.vramGb ? ` — ${g.vramGb} GB` : ''}
                    {g.bandwidthTbps != null ? ` · ${g.bandwidthTbps} TB/s` : ''}
                    {g.tflopsBf16 != null ? ` · ${g.tflopsBf16.toFixed(0)} TFLOPS` : ''}
                  </option>
                ))}
              </optgroup>
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
