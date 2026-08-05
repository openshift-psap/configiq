/**
 * Test script to verify FP8 weight memory fix
 * Run with: npx ts-node test-fp8-fix.ts
 */

import { extractConfig } from './lib/gpu-math/kv-config'
import { estimateWeightMemoryBytes } from './lib/gpu-math/inference-config/weight-memory'

// Simple test case: Llama-3.1-70B FP8 (hypothetical)
// This is a dense model, not MoE, so the math is straightforward
const llama31_70B_FP8Config = {
  "architectures": ["LlamaForCausalLM"],
  "model_type": "llama",
  "dtype": "bfloat16",           // Compute dtype (NOT storage dtype)
  "torch_dtype": "bfloat16",
  "num_hidden_layers": 80,
  "hidden_size": 8192,
  "intermediate_size": 28672,
  "num_attention_heads": 64,
  "num_key_value_heads": 8,
  "vocab_size": 128256,
  "head_dim": 128,
  "quantization_config": {
    "quant_method": "fp8",
    "weight_block_size": [128, 128],
    "modules_to_not_convert": [
      "model.embed_tokens",
      "lm_head",
    ]
  }
}

// Expected:
// - Total params: ~70B
// - Embedding params (unquantized): 128256 * 8192 = 1.05B × 2 bytes = 2.1 GB
// - Layer params (quantized): ~68B × 1 byte = ~68 GB
// - Total: ~70 GB

// Test 1: Extract config
console.log('═══ Test: Llama-3.1-70B FP8 ═══')
const cfg = extractConfig(llama31_70B_FP8Config)
console.log('Model type:', cfg.model_type)
console.log('Layers:', cfg.L)
console.log('Hidden size:', cfg.hidden_size)
console.log('Vocab size:', cfg.vocab_size)
console.log('Base dtype (torch_dtype):', cfg.dtype)
console.log('Quantization type:', cfg.quantization_config.type)
console.log('')

// Test 2: Estimate weight memory
console.log('═══ Weight Memory Estimate ═══')
const weightBytes = estimateWeightMemoryBytes(cfg)
const weightGB = weightBytes / 1e9

console.log('')
console.log('═══ Result ═══')
console.log(`Weight memory: ${weightGB.toFixed(1)} GB`)
console.log('')

// Verify against expected
// For Llama 3.1 70B FP8:
// - ~70B params total
// - If ALL quantized at FP8: 70 GB
// - With embedding/lm_head unquantized (~2.1B params): ~68 GB quantized + 4.2 GB unquantized = ~72 GB
const expectedMinGB = 68
const expectedMaxGB = 75
const isCorrect = weightGB >= expectedMinGB && weightGB <= expectedMaxGB

// Also check that it's NOT using BF16 (which would be ~140 GB)
const wouldBeBF16 = 140

if (isCorrect) {
  console.log(`✅ PASS: ${weightGB.toFixed(1)} GB is within expected range [${expectedMinGB}-${expectedMaxGB} GB]`)
  console.log('')
  console.log('Bug is fixed! FP8 models now use 1 byte/param instead of 2 bytes/param.')
  console.log(`(BF16 would have been ~${wouldBeBF16} GB — roughly 2× larger)`)
} else {
  console.log(`❌ FAIL: ${weightGB.toFixed(1)} GB is outside expected range [${expectedMinGB}-${expectedMaxGB} GB]`)
  console.log('')
  if (weightGB > 120) {
    console.log('⚠️ Still using 2 bytes/param (BF16 compute dtype) instead of 1 byte/param (FP8 storage)')
    console.log('   Bug NOT fixed.')
  }
}

console.log('')

process.exit(isCorrect ? 0 : 1)
