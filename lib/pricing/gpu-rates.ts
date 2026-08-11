// TODO (Costings REST API): replace live pricing lookup with Costings API call.
// Until then, functions return null when pricing is unknown — callers must grey
// out cost-dependent UI rather than showing fabricated numbers.

export function getCloudRate(
  gpuId: string,
  livePricing?: Record<string, number>,
): number | null {
  if (livePricing && livePricing[gpuId] !== undefined) {
    return livePricing[gpuId]
  }
  return null
}

export function getOwnedRate(
  gpuId: string,
): number | null {
  // TODO (Costings REST API): return hardware amortisation rate from Costings API
  return null
}
