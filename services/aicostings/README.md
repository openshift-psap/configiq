# aicostings

GPU and LLM pricing API for AI infrastructure cost modelling.

## Overview

aicostings provides live pricing data for frontier LLM APIs and GPU cloud
compute. It scrapes pricing from multiple providers on a schedule, caches
results in Valkey, and serves them via a REST API.

**Endpoints:**

| Endpoint | Description |
|---|---|
| `GET /models` | Frontier LLM API pricing ($/M tokens, by provider and tier) |
| `GET /systems` | GPU pricing (cloud $/hr by provider.region, hardware new/used range) |
| `GET /health` | Service status (last scrape timestamps, staleness flags) |
| `GET /metrics` | Prometheus / OTLP-JSON metrics (requires the `otel` extra) |
| `GET,POST /mcp` | MCP endpoint exposing the API as tools (requires the `mcp` extra) |

The GPU system catalog and vendor display names in `/systems` come from the
aiconfigurator SDK (via the shared `configiq.systems` module), so aicostings and
the aiconfigurator API never drift on which GPUs exist or how they're named.

## Quick start

This service depends on the in-tree [`configiq`](../configiq-py) package (a uv
path dependency) and on the aiconfigurator SDK wheels published by the Red Hat
fork. The SDK's Rust-compiled core is currently **manylinux x86_64 only**, so a
full install (and the test suite) runs on x86-64 Linux or in the container.

```bash
# Install with the shared lib, SDK wheels, and dev + observability extras.
uv sync --extra dev --extra otel --extra mcp

# Start Valkey (requires podman or docker)
podman run -d --name valkey -p 6379:6379 registry.redhat.io/rhel9/valkey-8

# Run the API server
uv run python -m tools.api_service.app

# Run tests
uv run pytest -v
```

The API will be available at `http://localhost:8080`.

### Container

The image bundles the shared `configiq` package, so its build context is the
parent `services/` directory:

```bash
podman build -f services/aicostings/Containerfile -t aicostings services/
# or, with Valkey, via compose from this directory:
podman compose up --build
```

## Data sources

### Frontier model pricing

- **OpenRouter** (`GET https://openrouter.ai/api/v1/models`) — primary
  source; structured pricing for 100+ models.
- **Curated YAML overrides** (`data/model-overrides.yaml`) — for models
  not on OpenRouter.

### Cloud GPU pricing

| Provider | Method |
|---|---|
| AWS | Pricing API |
| GCP | Cloud Billing Catalog API |
| Azure | Retail Prices API |
| IBM Cloud | Global Catalog API |
| Vast.ai | Public REST API |
| RunPod | Public GraphQL API |
| Lambda Labs | REST API |
| Hetzner | Cloud API |
| Scaleway | Instances API |
| CoreWeave | HTML scrape |
| Nebius | HTML scrape |

### Hardware purchase costs

- `new_usd`: curated YAML (`data/hardware-costs.yaml`), manually updated
  quarterly. Flagged as indicative in the API response.
- `used_usd`: eBay completed listings (to be implemented).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VALKEY_URL` | `valkey://localhost:6379/0` | Valkey connection URL |

## Architecture

- **FastAPI + Pydantic** — REST API
- **APScheduler 4.x** — embedded async scheduler
- **aiohttp** — concurrent provider fetches
- **Valkey** — data store with TTL-based staleness
- **configiq** — shared GPU system catalog, OpenTelemetry wiring, and MCP mount
  (observability + MCP are optional extras; the app degrades gracefully without them)

### Observability

With the `otel` extra installed, the app emits OpenTelemetry traces (OTLP HTTP to
`OTEL_EXPORTER_OTLP_ENDPOINT`, default `http://localhost:4318`) and exposes
`/metrics` in either Prometheus text or OTLP-JSON format (content-negotiated via
the `Accept` header). Alongside the standard HTTP/process instruments, aicostings
records domain metrics for scrape health: `costings.scrape.total`,
`costings.scrape.duration`, and `costings.scrape.records`, each labelled by
source.

All pricing data is scraped on schedule and cached in Valkey. API endpoints
read directly from Valkey with no outbound calls at query time.

**Scrape schedule:**

| Interval | Sources |
|---|---|
| 6 hours | Vast.ai, RunPod (spot prices) |
| 24 hours | All on-demand cloud rates, OpenRouter frontier models |
| 7 days | Hardware costs (eBay + curated YAML) |

## API reference

See `docs/api/openapi.yaml` for the full OpenAPI specification.

## Project structure

```
data/
  gpu-id-mapping.yaml      # provider GPU name → AIC system ID
  hardware-costs.yaml      # GPU purchase prices (curated)
tools/
  api_service/
    app.py                 # FastAPI application + scheduler
    valkey.py              # Valkey client wrapper
    scrapers/
      models.py            # OpenRouter + curated overrides
      cloud_rates.py       # per-provider cloud rate scrapers
      hardware_costs.py    # hardware cost loader
tests/
  unit/                    # unit + integration tests
  fixtures/                # sample API responses for tests
Containerfile
compose.yml
docs/
  api/openapi.yaml
```

## License

Apache License 2.0. See [LICENSE](LICENSE).
