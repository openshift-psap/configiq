# AIConfigurator REST API

A thin FastAPI wrapper over the [aiconfigurator](https://github.com/redhat-performance/aiconfigurator)
SDK, exposing GPU recommendation, performance estimation, and memory estimation
as HTTP endpoints. ConfigIQ's `app/api/*` proxy routes call this service.

This directory contains **only** the REST wrapper. The SDK itself (including its
Rust-compiled `aiconfigurator_core` extension) is not vendored here — it is
installed as a wheel published by the Red Hat fork's GitHub Releases.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/recommend` | GPU sizing recommendations |
| POST | `/estimate` | Single-point performance estimate |
| POST | `/memory` | Memory / KV-cache breakdown |
| GET | `/models` | Supported models |
| GET | `/systems` | Supported GPU systems |

Full spec: [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

## Run with the container (recommended)

The SDK's `aiconfigurator-core` wheel currently ships only for `linux/amd64`
(manylinux x86_64), so the container is the portable way to run this service:

```bash
docker build -t aiconfigurator services/aiconfigurator
docker run --rm -p 7860:7860 aiconfigurator
curl http://localhost:7860/systems
```

By default the image installs the latest SDK wheels from the fork's rolling
`deploy-api-latest` release. Pin a specific build with:

```bash
docker build -t aiconfigurator \
  --build-arg AIC_WHEELS_URL=https://github.com/redhat-performance/aiconfigurator/releases/expanded_assets/deploy-api-v0.11.0+<sha> \
  services/aiconfigurator
```

## Local development

No versions or platforms are pinned in `pyproject.toml`; the SDK wheels are
resolved from the fork's release assets via `[tool.uv] find-links`. On a
`linux/amd64` host:

```bash
cd services/aiconfigurator
uv venv && uv pip install -e . --group dev
uv run pytest          # tests mock the SDK; no perf DB required
uv run ruff check .
uvicorn tools.api_service.app:app --reload --port 7860
```

On other platforms (e.g. macOS/arm) the `aiconfigurator-core` wheel is not yet
available; use the container instead.
