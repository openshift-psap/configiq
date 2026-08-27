# SPDX-License-Identifier: Apache-2.0

"""Tests for scraper modules."""

import json
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tools.api_service.scrapers.cloud_rates import (
    _aws_gpu_instance_types,
    _merge_records,
    active_scrapers,
    load_gpu_id_mapping,
    scrape_azure,
    scrape_vastai,
)
from tools.api_service.scrapers.hardware_costs import load_hardware_costs
from tools.api_service.scrapers.models import (
    _classify_tier,
    _infer_provider,
    _parse_openrouter_model,
    fetch_litellm_models,
    fetch_openrouter_models,
    scrape_all_models,
)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


# ── Model scraper tests ───────────────────────────────────────────────────────


class TestClassifyTier:
    def test_fast_tier(self):
        assert _classify_tier("anthropic/claude-fable-5", "Claude Fable 5") == "fast"
        assert _classify_tier("openai/gpt-5.6-luna", "GPT-5.6 Luna") == "fast"
        assert _classify_tier("google/gemini-2.0-flash", "Gemini 2.0 Flash") == "fast"

    def test_frontier_tier(self):
        assert _classify_tier("anthropic/claude-opus-5", "Claude Opus 5") == "frontier"
        assert _classify_tier("openai/gpt-5.6-sol", "GPT-5.6 Sol") == "frontier"

    def test_balanced_default(self):
        assert _classify_tier("anthropic/claude-sonnet-5", "Claude Sonnet 5") == "balanced"
        assert _classify_tier("openai/gpt-4o", "GPT-4o") == "balanced"


class TestInferProvider:
    def test_known_providers(self):
        assert _infer_provider("anthropic/claude-3") == "Anthropic"
        assert _infer_provider("openai/gpt-4") == "OpenAI"
        assert _infer_provider("google/gemini-2") == "Google"
        assert _infer_provider("meta-llama/llama-3") == "Meta"

    def test_unknown_provider(self):
        assert _infer_provider("someorg/model") == "Someorg"

    def test_no_slash(self):
        assert _infer_provider("standalone-model") == ""


class TestParseOpenRouterModel:
    def test_valid_model(self):
        m = {
            "id": "anthropic/claude-sonnet-5",
            "name": "Claude Sonnet 5",
            "context_length": 200000,
            "pricing": {"prompt": "0.000003", "completion": "0.000015"},
        }
        result = _parse_openrouter_model(m)
        assert result is not None
        assert result["id"] == "anthropic/claude-sonnet-5"
        assert result["provider"] == "Anthropic"
        assert result["tier"] == "balanced"
        assert result["price_per_m_input"] == 3.0
        assert result["price_per_m_output"] == 15.0
        assert result["context_window"] == 200000

    def test_free_model_excluded(self):
        m = {
            "id": "some/free-model",
            "name": "Free Model",
            "pricing": {"prompt": "0", "completion": "0"},
        }
        assert _parse_openrouter_model(m) is None

    def test_missing_pricing_excluded(self):
        m = {"id": "some/model", "name": "Model", "pricing": {}}
        assert _parse_openrouter_model(m) is None

    def test_no_pricing_key(self):
        m = {"id": "some/model", "name": "Model"}
        assert _parse_openrouter_model(m) is None


class TestFetchOpenRouterModels:
    @pytest.mark.asyncio
    async def test_with_fixture_data(self):
        fixture_path = FIXTURES_DIR / "openrouter_sample.json"
        fixture_data = json.loads(fixture_path.read_text())

        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=fixture_data)

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        models = await fetch_openrouter_models(mock_session)
        assert len(models) > 0
        for m in models:
            assert "id" in m
            assert "price_per_m_input" in m
            assert "price_per_m_output" in m
            assert m["price_per_m_input"] > 0

    @pytest.mark.asyncio
    async def test_raises_on_api_error(self):
        # A non-200 must propagate so scrape_all_models records the source as
        # errored rather than as a successful empty scrape.
        mock_response = MagicMock()
        mock_response.status = 500

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        with pytest.raises(RuntimeError):
            await fetch_openrouter_models(mock_session)


class TestFetchLiteLLMModels:
    @pytest.mark.asyncio
    async def test_raises_on_api_error(self):
        # A non-200 must propagate so scrape_all_models records the source as
        # errored rather than persisting a partial page set as a fresh scrape.
        mock_response = MagicMock()
        mock_response.status = 500

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        with pytest.raises(RuntimeError):
            await fetch_litellm_models(mock_session)


class TestScrapeAllModels:
    @pytest.mark.asyncio
    async def test_merges_overrides(self):
        openrouter_models = [
            {"id": "a/model-1", "name": "M1", "provider": "A", "tier": "fast",
             "price_per_m_input": 1.0, "price_per_m_output": 2.0, "context_window": 8000},
        ]
        overrides = [
            {"id": "a/model-1", "name": "M1 Override", "provider": "A", "tier": "fast",
             "price_per_m_input": 0.5, "price_per_m_output": 1.0, "context_window": 16000},
            {"id": "custom/model", "name": "Custom", "provider": "Custom", "tier": "balanced",
             "price_per_m_input": 5.0, "price_per_m_output": 10.0, "context_window": 4000},
        ]

        with (
            patch("tools.api_service.scrapers.models.fetch_openrouter_models", return_value=openrouter_models),
            patch("tools.api_service.scrapers.models.fetch_litellm_models", return_value=[]),
            patch("tools.api_service.scrapers.models.load_curated_overrides", return_value=overrides),
        ):
            mock_session = AsyncMock()
            result, _errors = await scrape_all_models(mock_session)

        ids = [m["id"] for m in result]
        assert "a/model-1" in ids
        assert "custom/model" in ids
        overridden = next(m for m in result if m["id"] == "a/model-1")
        assert overridden["price_per_m_input"] == 0.5


# ── Cloud rates tests ─────────────────────────────────────────────────────────


class TestMergeRecords:
    def test_merges_on_demand_and_spot(self):
        records = [
            {"system_id": "h100_sxm", "provider_region": "aws.us-east-1", "on_demand": 3.89, "spot_median": None},
            {"system_id": "h100_sxm", "provider_region": "aws.us-east-1", "on_demand": None, "spot_median": 1.50},
        ]
        result = _merge_records(records)
        assert result["h100_sxm"]["aws.us-east-1"]["on_demand"] == 3.89
        assert result["h100_sxm"]["aws.us-east-1"]["spot_median"] == 1.50

    def test_multiple_systems_and_regions(self):
        records = [
            {"system_id": "h100_sxm", "provider_region": "aws.us-east-1", "on_demand": 3.89, "spot_median": None},
            {"system_id": "h200_sxm", "provider_region": "gcp.us-central1", "on_demand": 4.50, "spot_median": None},
        ]
        result = _merge_records(records)
        assert "h100_sxm" in result
        assert "h200_sxm" in result


class TestGpuIdMapping:
    def test_loads_from_yaml(self):
        mapping = load_gpu_id_mapping()
        assert isinstance(mapping, dict)
        assert len(mapping) > 0
        assert any("H100" in k for k in mapping)


class TestScrapeAzure:
    @pytest.mark.asyncio
    async def test_skips_windows_products(self):
        # Azure returns Linux and Windows meters for the same SKU/region; the
        # Windows record must not overwrite the Linux on-demand price.
        items = {"Items": [
            {"armSkuName": "Standard_ND96asr_v4", "armRegionName": "eastus",
             "retailPrice": 3.0, "meterName": "ND96asr v4",
             "productName": "Virtual Machines NDasr A100 v4 Series"},
            {"armSkuName": "Standard_ND96asr_v4", "armRegionName": "eastus",
             "retailPrice": 5.0, "meterName": "ND96asr v4",
             "productName": "Virtual Machines NDasr A100 v4 Series Windows"},
        ]}
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=items)

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        records = await scrape_azure(mock_session, {"Standard_ND96asr_v4": "a100_sxm"})
        # Only the Linux variant survives, so exactly one on-demand record at 3.0.
        assert [r["on_demand"] for r in records] == [3.0]
        assert all("windows" not in r["provider_region"].lower() for r in records)


class TestAwsInstanceTypes:
    def test_extracts_only_aws_instance_types(self):
        mapping = {
            "p5.48xlarge": "h100_sxm",
            "H100 SXM": "h100_sxm",
            "p4d.24xlarge": "a100_sxm",
            "A100 80GB": "a100_sxm",
        }
        assert _aws_gpu_instance_types(mapping) == {"p5.48xlarge", "p4d.24xlarge"}


_KEY_VARS = ["RUNPOD_API_KEY", "LAMBDA_API_KEY", "GCP_BILLING_API_KEY",
             "SCALEWAY_SECRET_KEY", "IBMCLOUD_API_KEY"]


class TestActiveScrapers:
    def test_credential_free_always_active(self, monkeypatch):
        for var in _KEY_VARS:
            monkeypatch.delenv(var, raising=False)
        names = [name for name, _ in active_scrapers()]
        assert names == ["azure", "aws", "vastai"]

    def test_key_activates_provider(self, monkeypatch):
        for var in _KEY_VARS:
            monkeypatch.delenv(var, raising=False)
        monkeypatch.setenv("RUNPOD_API_KEY", "test-key")
        names = [name for name, _ in active_scrapers()]
        assert "runpod" in names
        assert "lambda" not in names  # its key is still unset


class TestScrapeVastai:
    @pytest.mark.asyncio
    async def test_medians_per_gpu(self):
        offers = {"offers": [
            {"gpu_name": "H100 SXM", "num_gpus": 8, "dph_total": 16.0},   # 2.0/GPU
            {"gpu_name": "H100 SXM", "num_gpus": 4, "dph_total": 12.0},   # 3.0/GPU
            {"gpu_name": "Totally Unknown GPU", "num_gpus": 1, "dph_total": 1.0},  # unmapped
        ]}
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=offers)

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        records = await scrape_vastai(mock_session, {"H100 SXM": "h100_sxm"})
        assert len(records) == 1
        rec = records[0]
        assert rec["system_id"] == "h100_sxm"
        assert rec["on_demand"] is None
        assert rec["spot_median"] == 2.5  # median(2.0, 3.0)

    @pytest.mark.asyncio
    async def test_raises_on_api_error(self):
        mock_response = MagicMock()
        mock_response.status = 503

        @asynccontextmanager
        async def mock_get(*args, **kwargs):
            yield mock_response

        mock_session = MagicMock()
        mock_session.get = mock_get

        with pytest.raises(RuntimeError):
            await scrape_vastai(mock_session, {"H100 SXM": "h100_sxm"})


# ── Hardware costs tests ──────────────────────────────────────────────────────


class TestHardwareCosts:
    def test_loads_from_yaml(self):
        costs = load_hardware_costs()
        assert isinstance(costs, dict)
        assert "h200_sxm" in costs
        assert costs["h200_sxm"]["new_usd"] == 33750
        assert costs["h100_sxm"]["tdp_watts"] == 700

    def test_all_systems_have_required_fields(self):
        costs = load_hardware_costs()
        for sid, cost in costs.items():
            assert "new_usd" in cost, f"{sid} missing new_usd"
            assert "tdp_watts" in cost, f"{sid} missing tdp_watts"
            assert "gpus_per_node" in cost, f"{sid} missing gpus_per_node"
