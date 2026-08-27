# SPDX-License-Identifier: Apache-2.0

"""Cloud GPU pricing scrapers.

Each provider scraper returns a list of RateRecord dicts:
  { "system_id": str, "provider_region": str, "on_demand": float|None, "spot_median": float|None }

Provider GPU names are mapped to AIC system IDs via the gpu-id-mapping.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import aiohttp
import yaml

logger = logging.getLogger(__name__)

GPU_ID_MAPPING_PATH = Path(__file__).parent.parent.parent.parent / "data" / "gpu-id-mapping.yaml"

RateRecord = dict[str, Any]


def load_gpu_id_mapping() -> dict[str, str]:
    if not GPU_ID_MAPPING_PATH.exists():
        return {}
    with open(GPU_ID_MAPPING_PATH) as f:
        data = yaml.safe_load(f)
    return data if data else {}


def _map_gpu_name(name: str, mapping: dict[str, str]) -> str | None:
    lower = name.lower()
    for pattern, system_id in mapping.items():
        if pattern.lower() in lower:
            return system_id
    return None


# ── Azure ─────────────────────────────────────────────────────────────────────

AZURE_GPU_SKUS = ["Standard_ND96asr_v4", "Standard_ND96amsr_A100_v4", "Standard_NC80adis_H100_v5"]
AZURE_API = "https://prices.azure.com/api/retail/prices"


async def scrape_azure(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    records: list[RateRecord] = []
    for sku in AZURE_GPU_SKUS:
        try:
            params = {
                "$filter": f"armSkuName eq '{sku}' and priceType eq 'Consumption'",
                "$top": "100",
            }
            async with session.get(AZURE_API, params=params, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    logger.warning("Azure %s returned %d", sku, resp.status)
                    continue
                data = await resp.json()

            for item in data.get("Items", []):
                region = item.get("armRegionName", "")
                price = item.get("retailPrice")
                meter = item.get("meterName", "")
                if not region or price is None:
                    continue

                system_id = _map_gpu_name(sku, mapping)
                if not system_id:
                    continue

                is_spot = "spot" in meter.lower()
                records.append({
                    "system_id": system_id,
                    "provider_region": f"azure.{region}",
                    "on_demand": None if is_spot else round(price, 4),
                    "spot_median": round(price, 4) if is_spot else None,
                })
        except Exception as e:
            logger.error("Azure scrape failed for %s: %s", sku, e)

    logger.info("Azure: %d rate records", len(records))
    return records


# ── Placeholder scrapers (to be implemented per provider) ─────────────────────

async def scrape_aws(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("AWS scraper: not yet implemented")
    return []


async def scrape_gcp(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("GCP scraper: not yet implemented")
    return []


async def scrape_ibmcloud(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("IBM Cloud scraper: not yet implemented")
    return []


async def scrape_vastai(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("Vast.ai scraper: not yet implemented")
    return []


async def scrape_runpod(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("RunPod scraper: not yet implemented")
    return []


async def scrape_lambda(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("Lambda Labs scraper: not yet implemented")
    return []


async def scrape_hetzner(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("Hetzner scraper: not yet implemented")
    return []


async def scrape_scaleway(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("Scaleway scraper: not yet implemented")
    return []


async def scrape_coreweave(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("CoreWeave scraper: not yet implemented")
    return []


async def scrape_nebius(session: aiohttp.ClientSession, mapping: dict[str, str]) -> list[RateRecord]:
    logger.info("Nebius scraper: not yet implemented")
    return []


ALL_SCRAPERS = [
    ("azure", scrape_azure),
    ("aws", scrape_aws),
    ("gcp", scrape_gcp),
    ("ibmcloud", scrape_ibmcloud),
    ("vastai", scrape_vastai),
    ("runpod", scrape_runpod),
    ("lambda", scrape_lambda),
    ("hetzner", scrape_hetzner),
    ("scaleway", scrape_scaleway),
    ("coreweave", scrape_coreweave),
    ("nebius", scrape_nebius),
]


def _merge_records(records: list[RateRecord]) -> dict[str, dict[str, dict[str, float | None]]]:
    """Merge rate records into per-system, per-provider.region structure."""
    systems: dict[str, dict[str, dict[str, float | None]]] = {}

    for rec in records:
        sid = rec["system_id"]
        pr = rec["provider_region"]
        if sid not in systems:
            systems[sid] = {}
        if pr not in systems[sid]:
            systems[sid][pr] = {"on_demand": None, "spot_median": None}

        if rec.get("on_demand") is not None:
            systems[sid][pr]["on_demand"] = rec["on_demand"]
        if rec.get("spot_median") is not None:
            systems[sid][pr]["spot_median"] = rec["spot_median"]

    return systems


ProviderResult = tuple[str, list[RateRecord] | Exception]


async def scrape_all_cloud_rates(
    session: aiohttp.ClientSession,
) -> tuple[dict[str, dict[str, dict[str, float | None]]], dict[str, Exception | None]]:
    """Scrape all cloud providers concurrently.

    Returns:
        merged: per-system, per-provider.region rate data
        errors: mapping of provider name → Exception (or None if successful)
    """
    import asyncio

    mapping = load_gpu_id_mapping()
    tasks = [scraper(session, mapping) for _, scraper in ALL_SCRAPERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_records: list[RateRecord] = []
    errors: dict[str, Exception | None] = {}

    for (name, _), result in zip(ALL_SCRAPERS, results):
        if isinstance(result, Exception):
            logger.error("Scraper %s failed: %s", name, result)
            errors[name] = result
        else:
            errors[name] = None
            all_records.extend(result)

    merged = _merge_records(all_records)
    logger.info("Cloud rates: %d systems with pricing, %d provider errors",
                len(merged), sum(1 for e in errors.values() if e is not None))
    return merged, errors
