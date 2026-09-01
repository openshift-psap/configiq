// GET /api/costings/models
// Same-origin proxy for the aicostings /models endpoint. Forwards the optional
// ?source= selector (merged | openrouter | litellm) to the upstream and returns
// its raw shape { models, source, updated_at, stale }.
//
// The browser must call this route rather than aicostings directly, so the
// per-host gateway is resolved server-side. That keeps the .dev/.xyz two-host
// split correct client-side and removes the need for a build-time
// NEXT_PUBLIC_AICOSTINGS_API_URL.

import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_TIMEOUT_SECONDS = 30
const VALID_SOURCES = ['merged', 'openrouter', 'litellm'] as const

export async function GET(req: NextRequest) {
  // Dev default mirrors app/api/gpus/route.ts so local dev works without the
  // gateway env set; production sets AICOSTINGS_GATEWAY_URL per host.
  const baseUrl = process.env.AICOSTINGS_GATEWAY_URL || 'https://aicostings.dev'
  const timeoutSeconds =
    parseInt(process.env.AICOSTINGS_TIMEOUT_SECONDS || '', 10) || DEFAULT_TIMEOUT_SECONDS

  const source = (new URL(req.url).searchParams.get('source') || 'merged').toLowerCase()
  if (!VALID_SOURCES.includes(source as (typeof VALID_SOURCES)[number])) {
    return NextResponse.json(
      {
        status: 'failed',
        error: {
          code: 'INVALID_SOURCE',
          message: `invalid source '${source}'; expected one of ${VALID_SOURCES.join(', ')}`,
        },
      },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }

  try {
    const res = await fetch(`${baseUrl}/models?source=${source}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          status: 'failed',
          error: { code: 'COSTINGS_ERROR', message: `aicostings /models returned ${res.status}` },
        },
        { status: 502, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } },
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Mirrors the useCostings client-side cache TTL (1 hour).
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    })
  } catch (err: unknown) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return NextResponse.json(
        { status: 'failed', error: { code: 'COSTINGS_TIMEOUT', message: 'aicostings API timed out' } },
        { status: 504, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }
    return NextResponse.json(
      { status: 'failed', error: { code: 'COSTINGS_UNAVAILABLE', message: 'aicostings API is unreachable' } },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } },
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
