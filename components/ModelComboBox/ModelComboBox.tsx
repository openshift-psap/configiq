'use client'

import * as React from 'react'
import { Switch, Checkbox } from '@patternfly/react-core'
import { getAppConfig } from '@/lib/app-config'
import styles from './ModelComboBox.module.css'

export interface ComboBoxItem {
  value: string
  label: string
  group: string
}

interface ComboBoxProps {
  value: string
  onChange: (value: string) => void
  items: ComboBoxItem[]
  placeholder?: string
  id?: string
  allowCustom?: boolean
  supportedModels?: string[]
  hfToken?: string
  helperText?: React.ReactNode
}

interface GroupedItems {
  group: string
  items: ComboBoxItem[]
}

function groupItems(items: ComboBoxItem[]): GroupedItems[] {
  const map = new Map<string, ComboBoxItem[]>()
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map, ([group, items]) => ({
    group,
    items: items.toSorted((a, b) => a.label.localeCompare(b.label)),
  })).toSorted((a, b) => a.group.localeCompare(b.group))
}

function highlightMatch(text: string, query: string) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className={styles.matchHighlight}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

const FP8_SUFFIX_RE = /-FP8(-\w+)*$/

const NVFP4_SUFFIX_RE = /-NVFP4(-\w+)*$/

function isFp8Model(modelId: string): boolean {
  return FP8_SUFFIX_RE.test(modelId)
}

function isNvfp4Model(modelId: string): boolean {
  return NVFP4_SUFFIX_RE.test(modelId)
}

function toBaseModelId(modelId: string): string {
  return modelId.replace(FP8_SUFFIX_RE, '').replace(NVFP4_SUFFIX_RE, '')
}

function suggestedNames(): string {
  const names = getAppConfig().suggestedModelNames
  return names.length > 0 ? names.join(', ') : 'Nemotron, DeepSeek V4, Gemma 4, Kimi'
}

export function ComboBox({ value, onChange, items, placeholder, id, allowCustom = false, supportedModels, hfToken, helperText }: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [supportedOnly, setSupportedOnly] = React.useState(false)
  const prevModel = React.useRef(value)
  const [focusIndex, setFocusIndex] = React.useState(-1)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const variantMap = React.useMemo(() => {
    const map = new Map<string, { fp8?: string; nvfp4?: string }>()
    for (const item of items) {
      const base = toBaseModelId(item.value)
      if (base === item.value) continue
      if (!map.has(base)) map.set(base, {})
      const entry = map.get(base)!
      if (isFp8Model(item.value)) entry.fp8 = item.value
      else if (isNvfp4Model(item.value)) entry.nvfp4 = item.value
    }
    return map
  }, [items])

  const currentBase = toBaseModelId(value)
  const activeVariant: 'fp8' | 'nvfp4' | null = isFp8Model(value) ? 'fp8' : isNvfp4Model(value) ? 'nvfp4' : null
  const variants = variantMap.get(currentBase)

  const baseItems = React.useMemo(() =>
    items.filter(i => !isFp8Model(i.value) && !isNvfp4Model(i.value)),
    [items])

  const validatedBaseItems = React.useMemo(() =>
    supportedModels ? baseItems.filter(i => {
      if (supportedModels.includes(i.value)) return true
      const v = variantMap.get(i.value)
      if (!v) return false
      return (v.fp8 != null && supportedModels.includes(v.fp8)) ||
             (v.nvfp4 != null && supportedModels.includes(v.nvfp4))
    }) : baseItems,
    [baseItems, supportedModels, variantMap])

  const activeItems = supportedOnly ? validatedBaseItems : baseItems

  const handleToggle = (_: React.FormEvent, checked: boolean) => {
    setSupportedOnly(checked)
    if (checked) {
      prevModel.current = value
      if (!validatedBaseItems.some(i => i.value === currentBase) && validatedBaseItems.length > 0) {
        onChange(validatedBaseItems[0].value)
      }
    } else {
      onChange(prevModel.current)
    }
  }

  const selectedItem = activeItems.find(i => i.value === currentBase)
  const displayValue = open ? filter : (activeVariant ? value : (selectedItem?.label ?? value))

  const filtered = React.useMemo(() => {
    if (!filter) return activeItems
    const q = filter.toLowerCase()
    return activeItems.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.value.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q)
    )
  }, [activeItems, filter])

  const groups = React.useMemo(() => groupItems(filtered), [filtered])

  const flatItems = React.useMemo(() => {
    const flat: ComboBoxItem[] = []
    for (const g of groups) flat.push(...g.items)
    return flat
  }, [groups])

  const exactMatch = items.some(i => i.value.toLowerCase() === filter.toLowerCase() || i.label.toLowerCase() === filter.toLowerCase())
  const showCustom = allowCustom && open && filter.trim() && !exactMatch

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
        setFocusIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  React.useEffect(() => {
    if (open && focusIndex >= 0 && menuRef.current) {
      const item = menuRef.current.querySelector(`[data-index="${focusIndex}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, focusIndex])

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setFilter('')
    setFocusIndex(-1)
    inputRef.current?.blur()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFilter(e.target.value)
    setFocusIndex(-1)
    if (!open) setOpen(true)
  }

  function handleInputFocus() {
    setOpen(true)
    setFilter('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const totalItems = flatItems.length + (showCustom ? 1 : 0)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (totalItems === 0) { if (!open) setOpen(true); break }
        setFocusIndex(prev => (prev + 1) % totalItems)
        if (!open) setOpen(true)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (totalItems === 0) { if (!open) setOpen(true); break }
        setFocusIndex(prev => (prev <= 0 ? totalItems - 1 : prev - 1))
        if (!open) setOpen(true)
        break
      case 'Enter':
        e.preventDefault()
        if (focusIndex >= 0 && focusIndex < flatItems.length) {
          select(flatItems[focusIndex].value)
        } else if (focusIndex === flatItems.length && showCustom) {
          select(filter.trim())
        } else if (allowCustom && filter.trim()) {
          select(filter.trim())
        } else if (flatItems.length === 1) {
          select(flatItems[0].value)
        }
        break
      case 'Escape':
        setOpen(false)
        setFilter('')
        setFocusIndex(-1)
        inputRef.current?.blur()
        break
      case 'Tab':
        setOpen(false)
        setFilter('')
        setFocusIndex(-1)
        break
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
    setFilter('')
    setFocusIndex(-1)
    inputRef.current?.focus()
  }

  function handleChevronClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      setFilter('')
      setFocusIndex(-1)
    } else {
      setOpen(true)
      setFilter('')
      inputRef.current?.focus()
    }
  }

  function handleQuantToggle(variant: 'fp8' | 'nvfp4') {
    return (_: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      if (checked && variants?.[variant]) {
        onChange(variants[variant]!)
      } else {
        onChange(currentBase)
      }
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>Model — Hugging Face ID</label>
        {supportedModels && (
          <Switch
            id={id ? `${id}-validated-only` : 'validated-only'}
            label="Tested only"
            isChecked={supportedOnly}
            onChange={handleToggle}
            isReversed
          />
        )}
      </div>
      <div className={styles.toggleAnchor}>
      <div className={`${styles.toggle} ${open ? styles.toggleOpen : ''}`}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className={styles.input}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Type or select...'}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-activedescendant={focusIndex >= 0 ? `opt-${focusIndex}` : undefined}
        />
        {value && !open && (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            aria-label="Clear selection"
            tabIndex={-1}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          onClick={handleChevronClick}
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {open && (
        <div
          className={styles.menu}
          ref={menuRef}
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
        >
          {groups.length === 0 && !showCustom && (
            <div className={styles.empty}>No matches</div>
          )}

          {groups.map(group => (
            <React.Fragment key={group.group}>
              {group.group && (
                <div className={styles.groupLabel}>{group.group}</div>
              )}
              {group.items.map(item => {
                const idx = flatItems.indexOf(item)
                const isSelected = item.value === value
                const isFocused = idx === focusIndex
                return (
                  <div
                    key={item.value}
                    id={`opt-${idx}`}
                    data-index={idx}
                    role="option"
                    aria-selected={isSelected}
                    className={
                      `${styles.option}` +
                      `${isFocused ? ` ${styles.optionFocused}` : ''}` +
                      `${isSelected ? ` ${styles.optionSelected}` : ''}`
                    }
                    onMouseDown={e => { e.preventDefault(); select(item.value) }}
                    onMouseEnter={() => setFocusIndex(idx)}
                  >
                    <span className={styles.optionName}>
                      {highlightMatch(item.label, filter)}
                    </span>
                  </div>
                )
              })}
            </React.Fragment>
          ))}

          {showCustom && (
            <div
              id={`opt-${flatItems.length}`}
              data-index={flatItems.length}
              role="option"
              aria-selected={false}
              className={
                `${styles.option} ${styles.customOption}` +
                `${focusIndex === flatItems.length ? ` ${styles.optionFocused}` : ''}`
              }
              onMouseDown={e => { e.preventDefault(); select(filter.trim()) }}
              onMouseEnter={() => setFocusIndex(flatItems.length)}
            >
              <span className={styles.customOptionLabel}>Use:</span>
              {filter.trim()}
            </div>
          )}
        </div>
      )}
      </div>

      {variants && (variants.fp8 || variants.nvfp4) && (
        <div className={styles.quantRow}>
          {variants.fp8 && (
            <Checkbox
              id={id ? `${id}-fp8` : 'fp8-toggle'}
              label="Use FP8 quantization"
              isChecked={activeVariant === 'fp8'}
              onChange={handleQuantToggle('fp8')}
            />
          )}
          {variants.nvfp4 && (
            <Checkbox
              id={id ? `${id}-nvfp4` : 'nvfp4-toggle'}
              label="Use NVFP4 quantization"
              isChecked={activeVariant === 'nvfp4'}
              onChange={handleQuantToggle('nvfp4')}
            />
          )}
        </div>
      )}

      {supportedModels && (
        <div className={styles.helperText}>
          {helperText ?? (supportedOnly ? (
              <span>Tested: {suggestedNames()}, ... — type to autocomplete</span>
            ) : (
              <>
                <div>Tested: {suggestedNames()}, ... — type to autocomplete</div>
                {value && !supportedModels.includes(value) && getAppConfig().modelRequestUrl && (
                  <div>New model? <a href={getAppConfig().modelRequestUrl + encodeURIComponent(value)} target="_blank" rel="noopener" className={styles.requestLink}>Request testing →</a></div>
                )}
                {hfToken ? (
                  <div style={{ color: '#0066cc', fontWeight: 500 }}>HF token active</div>
                ) : (
                  <div>Gated model? <a href="/settings" className={styles.requestLink}>Add your HF token in Settings →</a></div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}
