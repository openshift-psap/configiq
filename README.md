# ConfigIQ

LLM inference sizing, GPU comparison, and cost modeling for engineers and infrastructure teams.

**Live at [configiq.dev](https://configiq.dev)**

Built with Next.js + PatternFly, powered by [AIConfigurator](https://aiconfigurator.dev).

## What it does

| Tool | Description |
|------|-------------|
| **Quick Estimate** | Fast GPU memory and cost estimate from model + load profile |
| **Advanced Calculator** | Detailed sizing with batching, quantization, and cost modeling |
| **KV Cache Calculator** | Memory breakdown and KV cache capacity analysis |
| **GPU Explorer** | Compare GPUs across memory, throughput, cost, and availability |
| **Hybrid Savings** | Model cost savings across cloud, on-premise, and hybrid strategies |
| **Routing Economics** | Analyze request routing between model tiers |

## Getting started

### Prerequisites

- Node.js >= 20
- npm >= 10

### Setup

```bash
git clone https://github.com/openshift-psap/configiq.git
cd configiq
npm install
cp .env.example .env.local
npm run dev
```

App runs at **http://localhost:3000**.

### Available commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run type-check   # TypeScript check without building
npm run lint         # ESLint
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router + TypeScript |
| UI | PatternFly v5 |
| Backend API | [AIConfigurator](https://aiconfigurator.dev) (GPU sizing + memory estimation) |
| Deployment | Vercel |

## Project structure

```
app/                  Next.js App Router pages
  layout.tsx          Root layout, fonts, PatternFly CSS imports
  page.tsx            Homepage
  quick-estimate/     Quick Estimate tool
  calculator/         Advanced Calculator
  kv-cache/           KV Cache Calculator
  gpu-explorer/       GPU Explorer
  hybrid-savings/     Hybrid Savings
  routing/            Routing Economics
  api/                Next.js API routes (proxy to AIConfigurator)
    recommend/        POST — GPU sizing via AIC /recommend
    estimate/         POST — GPU performance via AIC /estimate
    memory/           POST — memory breakdown via AIC /memory
    models/           GET — model catalog via AIC /models
    gpus/             GET — GPU catalog via AIC /system
components/
  layout/
    AppShell.tsx      Top-nav masthead + sidebar navigation
lib/
  gpu-math/           GPU sizing formulas (client-side)
  api/                AIConfigurator API clients
  pricing/            Cloud GPU pricing data
docs/                 Architecture docs and ADRs
```

## Contributing

### Before opening a PR

CI runs automatically and must pass:

```bash
npm run type-check   # Must be clean
npm run lint         # Must be clean
npm run build        # Must succeed
```

### Code conventions

1. **GPU math belongs in `lib/gpu-math/`** — never write sizing formulas inside React components.
2. **PatternFly only** — do not add Tailwind, shadcn/ui, or any other component library.
3. **Sentence case everywhere** — no title case in headings or labels.
4. **Server components by default** — add `"use client"` only when needed.
5. **No `any` types** — TypeScript strict mode is enforced.
