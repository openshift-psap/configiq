'use client'

import { useState, useEffect } from 'react'
import type { PricingSource } from '@/contexts/SettingsContext'

// ── Types ──────────────────────────────────────────────────────────────────

export interface FrontierModel {
  id: string
  name: string
  provider: string
  tier: 'fast' | 'balanced' | 'frontier'
  price_per_m_input: number
  price_per_m_output: number
  context_window: number | null
  updated_at: string | null
  /** Which feed this model's pricing came from (present in ?source=merged). */
  source?: 'openrouter' | 'litellm' | 'override'
}

export interface CloudRates {
  on_demand: number | null
  reserved_1yr: number | null
  reserved_3yr: number | null
  spot_median: number | null
}

export interface HardwareCost {
  new_usd: number | null
  new_usd_low: number | null
  new_usd_high: number | null
  indicative: boolean
  source_label: string | null
  source_url: string | null
  source_date: string | null
}

export interface SourceStatus {
  last_success: string | null
  last_error: { at: string; message: string } | null
  stale: boolean
}

export interface CostingsHealth {
  status: string
  version: string
  sources: Record<string, SourceStatus>
}

export interface CostingsData {
  models: FrontierModel[]
  // systemId → provider.region → rates
  gpuCloudRates: Map<string, Record<string, CloudRates>>
  gpuHardwareCosts: Map<string, HardwareCost>
  health: CostingsHealth | null
  modelsUpdatedAt: string | null
  modelsStale: boolean
  isLoading: boolean
  error: string | null
}

// A single cloud rate chosen for a GPU, tagged with where it came from and
// whether it is an on-demand or spot price, so callers can label it honestly.
export interface ResolvedCloudRate {
  rate: number
  provider: string // provider.region key, e.g. "aws.us-east-1"
  kind: 'on_demand' | 'spot'
}

// Pick a single representative cloud $/hr for a GPU from its per-provider rates.
// Preference order: the preferred provider's on-demand (then its spot), then the
// cheapest on-demand across all providers, then the cheapest spot. Returns null
// when no provider publishes any usable rate. Spot is only used as a fallback so
// callers can surface that it is not an on-demand price.
export function resolveCloudRate(
  cloudRates: Record<string, CloudRates> | undefined,
  preferredProvider?: string | null,
): ResolvedCloudRate | null {
  if (!cloudRates) return null

  if (preferredProvider) {
    const pr = cloudRates[preferredProvider]
    if (pr?.on_demand != null) return { rate: pr.on_demand, provider: preferredProvider, kind: 'on_demand' }
    if (pr?.spot_median != null) return { rate: pr.spot_median, provider: preferredProvider, kind: 'spot' }
  }

  let cheapestOnDemand: ResolvedCloudRate | null = null
  let cheapestSpot: ResolvedCloudRate | null = null
  for (const [provider, r] of Object.entries(cloudRates)) {
    if (r.on_demand != null && (cheapestOnDemand == null || r.on_demand < cheapestOnDemand.rate)) {
      cheapestOnDemand = { rate: r.on_demand, provider, kind: 'on_demand' }
    }
    if (r.spot_median != null && (cheapestSpot == null || r.spot_median < cheapestSpot.rate)) {
      cheapestSpot = { rate: r.spot_median, provider, kind: 'spot' }
    }
  }
  return cheapestOnDemand ?? cheapestSpot
}

// ── Module-level cache ─────────────────────────────────────────────────────
// Survives re-renders and navigation; 1-hour TTL.

const CACHE_TTL_MS = 60 * 60 * 1000

let cachedModels: FrontierModel[] | null = null
let cachedCloudRates: Map<string, Record<string, CloudRates>> | null = null
let cachedHardwareCosts: Map<string, HardwareCost> | null = null
let cachedHealth: CostingsHealth | null = null
let cachedModelsUpdatedAt: string | null = null
let cachedModelsStale = false
let cacheTimestamp: number | null = null
// The pricing source the cache currently holds; a change invalidates it so
// switching the source on the Sources page refetches the right feed.
let cachedSource: PricingSource | null = null
let fetchPromise: Promise<void> | null = null

function isCacheValid(source: PricingSource): boolean {
  return (
    cachedModels !== null &&
    cachedCloudRates !== null &&
    cachedHardwareCosts !== null &&
    cachedSource === source &&
    cacheTimestamp !== null &&
    Date.now() - cacheTimestamp < CACHE_TTL_MS
  )
}

function parseCloudRates(
  systems: Record<string, unknown>[],
): Map<string, Record<string, CloudRates>> {
  const result = new Map<string, Record<string, CloudRates>>()
  for (const sys of systems) {
    const id = sys.id as string
    const rates = sys.cloud_rates as Record<string, CloudRates> | undefined
    if (id && rates) result.set(id, rates)
  }
  return result
}

function parseHardwareCosts(
  systems: Record<string, unknown>[],
): Map<string, HardwareCost> {
  const result = new Map<string, HardwareCost>()
  for (const sys of systems) {
    const id = sys.id as string
    const hw = sys.hardware_cost as HardwareCost | undefined
    if (id && hw) result.set(id, hw)
  }
  return result
}

// ── Hook ───────────────────────────────────────────────────────────────────

const EMPTY: CostingsData = {
  models: [],
  gpuCloudRates: new Map(),
  gpuHardwareCosts: new Map(),
  health: null,
  modelsUpdatedAt: null,
  modelsStale: false,
  isLoading: false,
  error: null,
}

export function useCostings(enabled: boolean, pricingSource: PricingSource = 'merged'): CostingsData {
  const [data, setData] = useState<CostingsData>(
    enabled && isCacheValid(pricingSource)
      ? {
          models: cachedModels!,
          gpuCloudRates: cachedCloudRates!,
          gpuHardwareCosts: cachedHardwareCosts!,
          health: cachedHealth,
          modelsUpdatedAt: cachedModelsUpdatedAt,
          modelsStale: cachedModelsStale,
          isLoading: false,
          error: null,
        }
      : enabled
        ? { ...EMPTY, isLoading: true }
        : EMPTY,
  )

  useEffect(() => {
    if (!enabled) {
      setData(EMPTY)
      return
    }

    if (isCacheValid(pricingSource)) {
      setData({
        models: cachedModels!,
        gpuCloudRates: cachedCloudRates!,
        gpuHardwareCosts: cachedHardwareCosts!,
        health: cachedHealth,
        modelsUpdatedAt: cachedModelsUpdatedAt,
        modelsStale: cachedModelsStale,
        isLoading: false,
        error: null,
      })
      return
    }

    // Source changed (or cache stale) — show the loading state while refetching.
    setData(prev => ({ ...prev, isLoading: true, error: null }))

    // Deduplicate concurrent fetches for the same source.
    if (!fetchPromise) {
      fetchPromise = (async () => {
        const [modelsRes, systemsRes, healthRes] = await Promise.all([
          fetch(`/api/costings/models?source=${pricingSource}`),
          fetch('/api/costings/systems?include=cloud,hardware'),
          fetch('/api/costings/health'),
        ])

        if (!modelsRes.ok) throw new Error(`/models ${modelsRes.status}`)
        if (!systemsRes.ok) throw new Error(`/systems ${systemsRes.status}`)

        const modelsData = await modelsRes.json()
        const systemsData = await systemsRes.json()
        const healthData = healthRes.ok ? await healthRes.json() : null

        const systems = (systemsData.systems ?? []) as Record<string, unknown>[]

        cachedModels = (modelsData.models ?? []) as FrontierModel[]
        cachedCloudRates = parseCloudRates(systems)
        cachedHardwareCosts = parseHardwareCosts(systems)
        cachedHealth = healthData as CostingsHealth | null
        cachedModelsUpdatedAt = modelsData.updated_at ?? null
        cachedModelsStale = modelsData.stale ?? false
        cachedSource = pricingSource
        cacheTimestamp = Date.now()
      })()
    }

    let cancelled = false
    fetchPromise
      .then(() => {
        if (!cancelled) {
          setData({
            models: cachedModels!,
            gpuCloudRates: cachedCloudRates!,
            gpuHardwareCosts: cachedHardwareCosts!,
            health: cachedHealth,
            modelsUpdatedAt: cachedModelsUpdatedAt,
            modelsStale: cachedModelsStale,
            isLoading: false,
            error: null,
          })
        }
      })
      .catch((err: unknown) => {
        fetchPromise = null
        if (!cancelled) {
          setData(prev => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to fetch costings data',
          }))
        }
      })

    return () => { cancelled = true }
  }, [enabled, pricingSource])

  return data
}
