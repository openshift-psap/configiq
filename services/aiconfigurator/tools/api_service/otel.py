# SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""OpenTelemetry instrumentation for AIConfigurator API."""

import logging
import os

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.urllib3 import URLLib3Instrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)

# Global meter provider for metrics access
_meter_provider = None
_in_memory_reader = None


def get_meter_provider():
    """Get the global MeterProvider instance."""
    return _meter_provider


def get_otlp_metrics():
    """Export current metrics in OTLP JSON format.

    Returns:
        dict: OTLP-formatted metrics data
    """
    if not _in_memory_reader:
        return None

    # Collect current metrics
    metrics_data = _in_memory_reader.get_metrics_data()

    # Convert to OTLP JSON format
    return _metrics_data_to_otlp_json(metrics_data)


def _metrics_data_to_otlp_json(metrics_data):
    """Convert OpenTelemetry MetricsData to OTLP JSON format.

    Args:
        metrics_data: MetricsData from InMemoryMetricReader

    Returns:
        dict: OTLP-formatted JSON structure
    """
    resource_metrics = []

    for resource_metrics_obj in metrics_data.resource_metrics:
        scope_metrics_list = []

        for scope_metrics_obj in resource_metrics_obj.scope_metrics:
            metrics_list = []

            for metric in scope_metrics_obj.metrics:
                metric_dict = {
                    "name": metric.name,
                    "description": metric.description or "",
                    "unit": metric.unit or "",
                }

                # Handle different metric types
                if hasattr(metric.data, 'data_points'):
                    data_points = []
                    for point in metric.data.data_points:
                        dp = {
                            "attributes": [
                                {"key": k, "value": {"stringValue": str(v)}}
                                for k, v in (point.attributes.items() if point.attributes else {})
                            ],
                            "timeUnixNano": str(point.time_unix_nano),
                        }

                        # Add value based on metric type
                        if hasattr(point, 'value'):
                            if hasattr(metric.data, 'is_monotonic'):
                                # Counter
                                dp["asDouble"] = float(point.value)
                                metric_dict["sum"] = {
                                    "dataPoints": data_points,
                                    "aggregationTemporality": 2,  # CUMULATIVE
                                    "isMonotonic": metric.data.is_monotonic
                                }
                            else:
                                # Gauge
                                dp["asDouble"] = float(point.value)
                                metric_dict["gauge"] = {"dataPoints": data_points}
                        elif hasattr(point, 'bucket_counts'):
                            # Histogram
                            dp["asDouble"] = float(point.sum) if hasattr(point, 'sum') else 0
                            dp["count"] = str(point.count) if hasattr(point, 'count') else "0"
                            dp["bucketCounts"] = [str(c) for c in point.bucket_counts]
                            dp["explicitBounds"] = [float(b) for b in point.explicit_bounds] if hasattr(point, 'explicit_bounds') else []
                            metric_dict["histogram"] = {
                                "dataPoints": data_points,
                                "aggregationTemporality": 2  # CUMULATIVE
                            }

                        data_points.append(dp)

                metrics_list.append(metric_dict)

            scope_metrics_list.append({
                "scope": {
                    "name": scope_metrics_obj.scope.name,
                    "version": scope_metrics_obj.scope.version or "",
                },
                "metrics": metrics_list
            })

        # Build resource attributes
        resource_attrs = []
        if resource_metrics_obj.resource.attributes:
            for k, v in resource_metrics_obj.resource.attributes.items():
                resource_attrs.append({
                    "key": k,
                    "value": {"stringValue": str(v)}
                })

        resource_metrics.append({
            "resource": {"attributes": resource_attrs},
            "scopeMetrics": scope_metrics_list
        })

    return {"resourceMetrics": resource_metrics}


def init_otel_tracing():
    """Initialize OpenTelemetry tracing with OTLP exporter."""
    otel_endpoint = os.getenv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318')

    resource = Resource.create({
        'service.name': 'aiconfigurator',
        'service.version': '1.0.0',
        'service.instance.id': str(os.getpid()),
        'process.pid': os.getpid(),
    })

    tracer_provider = TracerProvider(resource=resource)
    trace.set_tracer_provider(tracer_provider)

    otlp_exporter = OTLPSpanExporter(endpoint=otel_endpoint)
    tracer_provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    FastAPIInstrumentor().instrument()
    RequestsInstrumentor().instrument()
    URLLib3Instrumentor().instrument()

    logger.info(f'OpenTelemetry tracing initialized with OTLP endpoint: {otel_endpoint}')


def init_otel_metrics():
    """Initialize OpenTelemetry metrics with dual export support.

    Exports metrics in both:
    - Prometheus text format (via PrometheusMetricReader)
    - OTLP JSON format (via InMemoryMetricReader)

    NOTE: Metrics are per-worker in multi-worker deployments (e.g., uvicorn --workers 4).
    Each worker exports its own metrics via /metrics with service.instance.id and process.pid
    labels to distinguish workers. For aggregated metrics across workers, use nginx to
    round-robin /metrics scrapes and Prometheus to aggregate via PromQL.
    """
    global _meter_provider, _in_memory_reader

    resource = Resource.create({
        'service.name': 'aiconfigurator',
        'service.version': '1.0.0',
        'service.instance.id': str(os.getpid()),  # Unique instance identifier
        'process.pid': os.getpid(),                # Process ID
    })

    # Create metric readers for dual export
    # 1. PrometheusMetricReader for Prometheus format
    prometheus_reader = PrometheusMetricReader()

    # 2. InMemoryMetricReader for OTLP JSON format (on-demand export)
    _in_memory_reader = InMemoryMetricReader()

    # MeterProvider with multiple readers - same metrics exported in both formats
    _meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[prometheus_reader, _in_memory_reader],
    )
    metrics.set_meter_provider(_meter_provider)

    logger.info(f'OpenTelemetry metrics initialized: Prometheus + OTLP JSON (instance={os.getpid()})')
