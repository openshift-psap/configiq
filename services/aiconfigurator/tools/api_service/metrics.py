# SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Custom metrics for AIConfigurator API using OpenTelemetry."""

import logging
import os

from opentelemetry import metrics
from opentelemetry.metrics import CallbackOptions, Observation

logger = logging.getLogger(__name__)

# Global references
_meter = None
_process = None

# Metric instruments
http_requests_total = None
http_request_bytes_total = None
http_response_bytes_total = None
http_request_duration_seconds = None
process_cpu_percent = None
process_memory_bytes = None


def init_metrics():
    """Initialize custom metrics using OpenTelemetry metrics API."""
    global _meter, _process
    global http_requests_total, http_request_bytes_total, http_response_bytes_total
    global http_request_duration_seconds, process_cpu_percent, process_memory_bytes

    try:
        import psutil
        _process = psutil.Process(os.getpid())
    except ImportError:
        logger.warning("psutil not available; process metrics disabled")
        _process = None

    # Get meter from global meter provider
    _meter = metrics.get_meter("aiconfigurator.api")

    # HTTP request counter
    http_requests_total = _meter.create_counter(
        name="http.server.requests",
        description="Total HTTP requests received",
        unit="1"
    )

    # HTTP request bytes counter
    http_request_bytes_total = _meter.create_counter(
        name="http.server.request.body.size",
        description="Total HTTP request body bytes received",
        unit="By"
    )

    # HTTP response bytes counter
    http_response_bytes_total = _meter.create_counter(
        name="http.server.response.body.size",
        description="Total HTTP response body bytes sent",
        unit="By"
    )

    # HTTP request duration histogram
    http_request_duration_seconds = _meter.create_histogram(
        name="http.server.request.duration",
        description="HTTP request duration",
        unit="s"
    )

    # Process CPU usage counter (cumulative CPU seconds)
    if _process:
        def cpu_callback(options: CallbackOptions):
            try:
                cpu_times = _process.cpu_times()
                # Total CPU seconds = user + system
                total_seconds = cpu_times.user + cpu_times.system
                yield Observation(total_seconds)
            except Exception as e:
                logger.debug("Failed to collect CPU metric: %s", e)

        process_cpu_percent = _meter.create_observable_counter(
            name="process.cpu.seconds",
            callbacks=[cpu_callback],
            description="Total CPU seconds consumed (user + system)",
            unit="s"
        )

    # Process memory usage gauge (observable)
    if _process:
        def memory_callback(options: CallbackOptions):
            try:
                mem = _process.memory_info().rss
                yield Observation(mem)
            except Exception as e:
                logger.debug("Failed to collect memory metric: %s", e)

        process_memory_bytes = _meter.create_observable_gauge(
            name="process.memory.usage",
            callbacks=[memory_callback],
            description="Current memory usage in bytes",
            unit="By"
        )

    logger.info("Custom metrics initialized: HTTP + process metrics")


def record_http_request(method: str, endpoint: str, status_code: int,
                        request_bytes: int, response_bytes: int, duration: float):
    """Record metrics for a completed HTTP request.

    Args:
        method: HTTP method (GET, POST, etc.)
        endpoint: Request path/endpoint
        status_code: HTTP status code
        request_bytes: Request body size in bytes
        response_bytes: Response body size in bytes
        duration: Request duration in seconds
    """
    if not http_requests_total:
        return  # Metrics not initialized

    attrs = {
        "http.request.method": method,
        "url.path": endpoint,
        "http.response.status_code": status_code,
    }

    attrs_no_status = {
        "http.request.method": method,
        "url.path": endpoint,
    }

    # Record all metrics
    http_requests_total.add(1, attrs)
    http_request_bytes_total.add(request_bytes, attrs_no_status)
    http_response_bytes_total.add(response_bytes, attrs)
    http_request_duration_seconds.record(duration, attrs)
