# SPDX-License-Identifier: Apache-2.0

"""Hosted LLM API pricing scrapers.

Primary source:  OpenRouter API  (https://openrouter.ai/api/v1/models)
Secondary source: LiteLLM Catalog API (https://api.litellm.ai/model_catalog)
Curated YAML overrides for any models missing from both.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import aiohttp
import yaml

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/models"
LITELLM_URL = "https://api.litellm.ai/model_catalog"
LITELLM_PAGE_SIZE = 500  # max page size the API accepts; pagination continues until a short page
CURATED_OVERRIDES_PATH = Path(__file__).parent.parent.parent.parent / "data" / "model-overrides.yaml"

TIER_KEYWORDS = {
    "fast": ["haiku", "flash", "mini", "luna", "fable", "small", "lite"],
    "frontier": ["opus", "sol", "ultra", "pro-max"],
}


def _classify_tier(model_id: str, model_name: str) -> str:
    lower = (model_id + " " + model_name).lower()
    for tier, keywords in TIER_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return tier
    return "balanced"


def _infer_provider(model_id: str) -> str:
    prefix = model_id.split("/")[0].lower() if "/" in model_id else ""
    mapping = {
        "anthropic": "Anthropic",
        "openai": "OpenAI",
        "google": "Google",
        "meta-llama": "Meta",
        "mistralai": "Mistral",
        "deepseek": "DeepSeek",
        "cohere": "Cohere",
        "groq": "Groq",
    }
    return mapping.get(prefix, prefix.title())


def _parse_openrouter_model(m: dict[str, Any]) -> dict[str, Any] | None:
    pricing = m.get("pricing", {})
    prompt_price = pricing.get("prompt")
    completion_price = pricing.get("completion")
    if prompt_price is None or completion_price is None:
        return None

    try:
        price_per_m_input = float(prompt_price) * 1_000_000
        price_per_m_output = float(completion_price) * 1_000_000
    except (ValueError, TypeError):
        return None

    if price_per_m_input == 0 and price_per_m_output == 0:
        return None

    model_id = m.get("id", "")
    model_name = m.get("name", "")

    return {
        "id": model_id,
        "name": model_name,
        "provider": _infer_provider(model_id),
        "tier": _classify_tier(model_id, model_name),
        "price_per_m_input": round(price_per_m_input, 4),
        "price_per_m_output": round(price_per_m_output, 4),
        "context_window": m.get("context_length"),
    }


async def fetch_openrouter_models(session: aiohttp.ClientSession) -> list[dict[str, Any]]:
    try:
        async with session.get(OPENROUTER_URL, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                logger.warning("OpenRouter returned %d", resp.status)
                return []
            data = await resp.json()
    except Exception as e:
        logger.error("OpenRouter fetch failed: %s", e)
        return []

    raw_models = data.get("data", [])
    parsed = []
    for m in raw_models:
        result = _parse_openrouter_model(m)
        if result:
            parsed.append(result)

    logger.info("OpenRouter: parsed %d models from %d total", len(parsed), len(raw_models))
    return parsed


def load_curated_overrides() -> list[dict[str, Any]]:
    if not CURATED_OVERRIDES_PATH.exists():
        return []
    try:
        with open(CURATED_OVERRIDES_PATH) as f:
            data = yaml.safe_load(f)
        return data.get("models", []) if data else []
    except Exception as e:
        logger.warning("Failed to load curated overrides: %s", e)
        return []


def _parse_litellm_model(m: dict[str, Any]) -> dict[str, Any] | None:
    input_cost = m.get("input_cost_per_token")
    output_cost = m.get("output_cost_per_token")
    if input_cost is None or output_cost is None:
        return None
    try:
        price_per_m_input = float(input_cost) * 1_000_000
        price_per_m_output = float(output_cost) * 1_000_000
    except (ValueError, TypeError):
        return None
    if price_per_m_input == 0 and price_per_m_output == 0:
        return None

    model_id = m.get("id", "")
    provider = (m.get("provider") or "").title()

    return {
        "id": model_id,
        "name": model_id.split("/")[-1] if "/" in model_id else model_id,
        "provider": provider,
        "tier": _classify_tier(model_id, model_id),
        "price_per_m_input": round(price_per_m_input, 4),
        "price_per_m_output": round(price_per_m_output, 4),
        "context_window": m.get("max_input_tokens"),
    }


async def fetch_litellm_models(session: aiohttp.ClientSession) -> list[dict[str, Any]]:
    """Fetch all chat models from the LiteLLM Catalog API with pagination."""
    parsed: list[dict[str, Any]] = []
    page = 1
    while True:
        try:
            params = {"mode": "chat", "page_size": LITELLM_PAGE_SIZE, "page": page}
            async with session.get(LITELLM_URL, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    logger.warning("LiteLLM returned %d on page %d", resp.status, page)
                    break
                data = await resp.json()
        except Exception as e:
            logger.error("LiteLLM fetch failed on page %d: %s", page, e)
            raise

        items = data.get("data", [])
        for m in items:
            result = _parse_litellm_model(m)
            if result:
                parsed.append(result)

        if len(items) < LITELLM_PAGE_SIZE:
            break
        page += 1

    logger.info("LiteLLM: parsed %d models across %d page(s)", len(parsed), page)
    return parsed


ModelScrapeResult = tuple[list[dict[str, Any]], dict[str, Exception | None]]


async def scrape_all_models(session: aiohttp.ClientSession) -> ModelScrapeResult:
    """Scrape model pricing from OpenRouter and LiteLLM concurrently.

    Returns:
        merged: deduplicated model list (OpenRouter primary, LiteLLM fills gaps)
        errors: mapping of source name → Exception (or None if successful)
    """
    import asyncio

    or_task = asyncio.create_task(fetch_openrouter_models(session))
    lt_task = asyncio.create_task(fetch_litellm_models(session))

    errors: dict[str, Exception | None] = {}
    or_models: list[dict[str, Any]] = []
    lt_models: list[dict[str, Any]] = []

    for source, task in [("models.openrouter", or_task), ("models.litellm", lt_task)]:
        try:
            result = await task
            errors[source] = None
            if source == "models.openrouter":
                or_models = result
            else:
                lt_models = result
        except Exception as e:
            logger.error("%s fetch failed: %s", source, e)
            errors[source] = e

    overrides = load_curated_overrides()
    override_ids = {m["id"] for m in overrides}

    # OpenRouter is primary; LiteLLM fills gaps; overrides win over both
    or_ids = {m["id"] for m in or_models}
    lt_gap_models = [m for m in lt_models if m["id"] not in or_ids and m["id"] not in override_ids]

    merged = [m for m in or_models if m["id"] not in override_ids]
    merged.extend(lt_gap_models)
    merged.extend(overrides)
    merged.sort(key=lambda m: m["id"])

    logger.info(
        "Models merged: %d total (OpenRouter: %d, LiteLLM gaps: %d, overrides: %d)",
        len(merged), len(or_models), len(lt_gap_models), len(overrides),
    )
    return merged, errors
