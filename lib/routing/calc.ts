import { type FrontierModel } from '@/lib/pricing/frontier-models'

export interface TierState {
  id: string
  pct: number
  tokensIn: number
  tokensOut: number
  frontierModelId: string
  ossModelId: string
  gpuType: string
  gpuPerReplica: number
  capacityPerReplica: number
}

export interface TierCostResult {
  tierId: string
  frontierAnnual: number
  selfHostedAnnual: number | null  // null when GPU pricing unavailable
  replicas: number
  gpuCount: number
  dailyQueries: number
}

export interface RoutingResult {
  tiers: TierCostResult[]
  totalFrontier: number
  totalSelfHosted: number | null
  savings: number | null
  savingsPct: number | null
}

export function computeFrontierCost(
  tier: TierState,
  dailyQueries: number,
  frontierModels: FrontierModel[],
): number {
  const model = frontierModels.find(m => m.id === tier.frontierModelId)
  if (!model) return 0
  const perQuery =
    (tier.tokensIn / 1_000_000) * model.pricePerMInput +
    (tier.tokensOut / 1_000_000) * model.pricePerMOutput
  const tierDailyQueries = dailyQueries * (tier.pct / 100)
  return perQuery * tierDailyQueries * 365
}

export function computeSelfHostedCost(
  tier: TierState,
  users: number,
  concurrencyPct: number,
  hourlyRate: number | null,
): { annualCost: number | null; replicas: number; gpuCount: number } {
  const peakConcurrent = users * (concurrencyPct / 100) * 1.2
  const peakTierReqs = peakConcurrent * (tier.pct / 100)
  const replicas = Math.max(1, Math.ceil(peakTierReqs / tier.capacityPerReplica))
  const gpuCount = replicas * tier.gpuPerReplica
  if (hourlyRate == null) return { annualCost: null, replicas, gpuCount }
  return { annualCost: gpuCount * hourlyRate * 24 * 30 * 12, replicas, gpuCount }
}

export function computeAllTiers(
  tiers: TierState[],
  users: number,
  queriesPerUserPerDay: number,
  concurrencyPct: number,
  frontierModels: FrontierModel[],
  getRate: (gpuId: string) => number | null,
): RoutingResult {
  const dailyQueries = users * queriesPerUserPerDay

  const results: TierCostResult[] = tiers.map(tier => {
    const frontierAnnual = computeFrontierCost(tier, dailyQueries, frontierModels)
    const { annualCost, replicas, gpuCount } = computeSelfHostedCost(
      tier, users, concurrencyPct, getRate(tier.gpuType),
    )
    return {
      tierId: tier.id,
      frontierAnnual,
      selfHostedAnnual: annualCost,
      replicas,
      gpuCount,
      dailyQueries: dailyQueries * (tier.pct / 100),
    }
  })

  const totalFrontier = results.reduce((s, r) => s + r.frontierAnnual, 0)
  const anyNull = results.some(r => r.selfHostedAnnual == null)
  const totalSelfHosted = anyNull ? null : results.reduce((s, r) => s + (r.selfHostedAnnual ?? 0), 0)
  const savings = totalSelfHosted != null ? totalFrontier - totalSelfHosted : null
  const savingsPct = savings != null && totalFrontier > 0 ? (savings / totalFrontier) * 100 : null

  return { tiers: results, totalFrontier, totalSelfHosted, savings, savingsPct }
}

export interface VolumePoint {
  dailyQueries: number
  frontier: number
  selfHosted: number | null
}

const VOLUME_MULTIPLIERS = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

export function computeCostVolumePoints(
  tiers: TierState[],
  baseUsers: number,
  queriesPerUserPerDay: number,
  concurrencyPct: number,
  frontierModels: FrontierModel[],
  getRate: (gpuId: string) => number | null,
): VolumePoint[] {
  return VOLUME_MULTIPLIERS.map(m => {
    const users = Math.round(baseUsers * m)
    const result = computeAllTiers(tiers, users, queriesPerUserPerDay, concurrencyPct, frontierModels, getRate)
    return { dailyQueries: users * queriesPerUserPerDay, frontier: result.totalFrontier, selfHosted: result.totalSelfHosted }
  })
}

export function findBreakeven(points: VolumePoint[]): number | null {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (prev.selfHosted == null || curr.selfHosted == null) continue
    const prevDiff = prev.frontier - prev.selfHosted
    const currDiff = curr.frontier - curr.selfHosted

    if (prevDiff * currDiff < 0) {
      const t = prevDiff / (prevDiff - currDiff)
      return prev.dailyQueries + t * (curr.dailyQueries - prev.dailyQueries)
    }
  }
  return null
}
