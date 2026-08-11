export interface FrontierModel {
  id: string
  name: string
  provider: string
  pricePerMInput: number
  pricePerMOutput: number
  tier: 'fast' | 'balanced' | 'frontier'
}

// TODO (Costings REST API): replace all placeholder pricing below with live data
// from the Costings API once designed. Prices in USD per million tokens.
// Verify current pricing at each provider's pricing page before any public launch.
export const FRONTIER_MODELS: FrontierModel[] = [
  // Fast tier
  { id: 'claude-fable-5',      name: 'Claude Fable 5',      provider: 'Anthropic', pricePerMInput: 0.80,  pricePerMOutput: 4.00,   tier: 'fast' },      // TODO: verify
  { id: 'gpt-5.6-luna',        name: 'GPT-5.6 Luna',        provider: 'OpenAI',    pricePerMInput: 0.15,  pricePerMOutput: 0.60,   tier: 'fast' },      // TODO: verify
  { id: 'gemini-2.0-flash',    name: 'Gemini 2.0 Flash',    provider: 'Google',    pricePerMInput: 0.10,  pricePerMOutput: 0.40,   tier: 'fast' },      // TODO: verify
  // Balanced tier
  { id: 'claude-sonnet-5',     name: 'Claude Sonnet 5',     provider: 'Anthropic', pricePerMInput: 3.00,  pricePerMOutput: 15.00,  tier: 'balanced' },  // TODO: verify
  { id: 'gpt-5.6-terra',       name: 'GPT-5.6 Terra',       provider: 'OpenAI',    pricePerMInput: 2.50,  pricePerMOutput: 10.00,  tier: 'balanced' },  // TODO: verify
  { id: 'gemini-2.5-pro',      name: 'Gemini 2.5 Pro',      provider: 'Google',    pricePerMInput: 1.25,  pricePerMOutput: 10.00,  tier: 'balanced' },  // TODO: verify
  // Frontier tier
  { id: 'claude-opus-5',       name: 'Claude Opus 5',       provider: 'Anthropic', pricePerMInput: 15.00, pricePerMOutput: 75.00,  tier: 'frontier' },  // TODO: verify
  { id: 'gpt-5.6-sol',         name: 'GPT-5.6 Sol',         provider: 'OpenAI',    pricePerMInput: 15.00, pricePerMOutput: 60.00,  tier: 'frontier' },  // TODO: verify
]

export function getFrontierModel(id: string): FrontierModel | undefined {
  return FRONTIER_MODELS.find(m => m.id === id)
}

export function getFrontierModelsByTier(tier: FrontierModel['tier']): FrontierModel[] {
  return FRONTIER_MODELS.filter(m => m.tier === tier)
}
