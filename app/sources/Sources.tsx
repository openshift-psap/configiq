'use client';

import * as React from 'react';
import { useSettings, AICOSTINGS_API_URL } from '@/contexts/SettingsContext';
import styles from './Sources.module.css';

interface SourceStatus {
  last_success: string | null;
  last_error: { at: string; message: string } | null;
  stale: boolean;
}

interface HealthData {
  version: string;
  sources: Record<string, SourceStatus>;
}

interface CloudRate {
  on_demand: number | null;
  reserved_1yr: number | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 48) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  if (m > 0) return `${m}m ago`;
  return 'just now';
}

function SourceBadge({ status }: { status: SourceStatus }) {
  if (status.last_error && status.stale) {
    return <span className={styles.error}><span className={styles.dot} style={{ background: '#c9190b' }} />Error</span>;
  }
  if (status.stale) {
    return <span className={styles.stale}><span className={styles.dot} style={{ background: '#795600' }} />Stale</span>;
  }
  if (status.last_success) {
    return <span className={styles.fresh}><span className={styles.dot} style={{ background: '#3e8635' }} />Fresh</span>;
  }
  return <span className={styles.unknown}><span className={styles.dot} style={{ background: '#6a6e73' }} />Unknown</span>;
}

export default function Sources() {
  const { preferredCloudProvider, setPreferredCloudProvider } = useSettings();
  const [health, setHealth] = React.useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = React.useState(true);
  const [healthError, setHealthError] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<string[]>([]);

  React.useEffect(() => {
    setHealthLoading(true);
    fetch(`${AICOSTINGS_API_URL}/health`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: HealthData) => { setHealth(d); setHealthError(null); })
      .catch(e => setHealthError(String(e)))
      .finally(() => setHealthLoading(false));
  }, []);

  React.useEffect(() => {
    fetch(`${AICOSTINGS_API_URL}/systems?include=cloud`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        const keys = new Set<string>();
        for (const sys of (d.systems ?? [])) {
          for (const k of Object.keys(sys.cloud_rates ?? {})) keys.add(k);
        }
        setProviders(Array.from(keys).sort());
      })
      .catch(() => {});
  }, []);

  const sortedSources = health
    ? Object.entries(health.sources).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Sources</h1>
        <p className={styles.subtitle}>
          Pricing data source status, cloud provider preference, and on-prem cost profiles.
        </p>
      </div>

      {/* ── Section 1: Pricing data sources ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Pricing data sources</div>
            <div className={styles.sectionDesc}>
              Live scrape status for each data source powering cost calculations.
              {health && ` aicostings v${health.version}`}
            </div>
          </div>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last success</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {healthLoading && (
              <tr className={styles.loadingRow}>
                <td colSpan={4}>Connecting to aicostings…</td>
              </tr>
            )}
            {healthError && (
              <tr className={styles.loadingRow}>
                <td colSpan={4} style={{ color: '#c9190b' }}>
                  Could not reach {AICOSTINGS_API_URL} — {healthError}
                </td>
              </tr>
            )}
            {!healthLoading && !healthError && sortedSources.map(([name, status]) => (
              <tr key={name}>
                <td><span className={styles.sourceName}>{name}</span></td>
                <td><SourceBadge status={status} /></td>
                <td style={{ color: 'var(--gc-text-2)', fontSize: '12px', fontFamily: 'var(--mono)' }}>
                  {relativeTime(status.last_success)}
                </td>
                <td>
                  {status.last_error && (
                    <div className={styles.errorMsg}>
                      {status.last_error.message}
                      <div style={{ color: '#6a6e73', marginTop: 2 }}>{relativeTime(status.last_error.at)}</div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Section 2: Cloud provider preference ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>Cloud provider preference</div>
            <div className={styles.sectionDesc}>
              Which provider and region to use when calculating self-hosted cloud costs.
              {preferredCloudProvider && <> Currently: <code style={{ fontSize: '12px' }}>{preferredCloudProvider}</code></>}
            </div>
          </div>
          {preferredCloudProvider && (
            <button
              style={{ fontSize: '12px', color: '#6a6e73', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
              onClick={() => setPreferredCloudProvider(null)}
            >
              Clear
            </button>
          )}
        </div>
        {providers.length === 0 ? (
          <div className={styles.emptyState}>
            No cloud rates available — check aicostings connection above.
          </div>
        ) : (
          <div className={styles.providerGrid}>
            {providers.map(p => (
              <button
                key={p}
                className={`${styles.providerOption} ${preferredCloudProvider === p ? styles.providerOptionActive : ''}`}
                onClick={() => setPreferredCloudProvider(p)}
              >
                <span className={styles.providerDot} />
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: On-prem cost profiles (placeholder) ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>On-prem cost profiles</div>
            <div className={styles.sectionDesc}>
              Customer-specific hardware, power, and staffing cost profiles. Stored locally.
            </div>
          </div>
        </div>
        <div className={styles.emptyState}>
          On-prem cost profiles coming soon.
        </div>
      </div>
    </div>
  );
}
