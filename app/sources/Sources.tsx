'use client';

import * as React from 'react';
import { useSettings, AICOSTINGS_API_URL } from '@/contexts/SettingsContext';
import { useOnPremProfile, DEFAULT_PROFILE, type OnPremCostProfile } from '@/lib/hooks/useOnPremProfile';
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

function newProfile(): OnPremCostProfile {
  return { ...DEFAULT_PROFILE, id: String(Date.now()), name: 'New profile', hardware: { ...DEFAULT_PROFILE.hardware }, datacenter: { ...DEFAULT_PROFILE.datacenter }, lifecycle: { ...DEFAULT_PROFILE.lifecycle } }
}

export default function Sources() {
  const { preferredCloudProvider, setPreferredCloudProvider } = useSettings();
  const { profiles, activeProfileId, setActiveProfile, saveProfile, deleteProfile, exportProfile, importProfile } = useOnPremProfile();
  const [editingProfile, setEditingProfile] = React.useState<OnPremCostProfile | null>(null);
  const [importText, setImportText] = React.useState('');
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

      {/* ── Section 3: On-prem cost profiles ── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionTitle}>On-prem cost profiles</div>
            <div className={styles.sectionDesc}>
              Customer-specific hardware, power, and staffing costs. Stored locally — exportable as JSON.
            </div>
          </div>
          <button
            style={{ fontSize: '13px', color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => setEditingProfile(newProfile())}
          >
            + New profile
          </button>
        </div>

        {profiles.length === 0 && !editingProfile && (
          <div className={styles.emptyState}>
            No profiles yet. Create one to model on-prem GPU infrastructure costs.
          </div>
        )}

        {profiles.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Profile name</th>
                <th>$/node</th>
                <th>PUE</th>
                <th>Depreciation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id}>
                  <td>
                    <span className={styles.sourceName}>{p.name}</span>
                    {activeProfileId === p.id && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>ACTIVE</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>${p.hardware.serverCostPerNode.toLocaleString()}</td>
                  <td style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>{p.datacenter.pue.toFixed(2)}×</td>
                  <td style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>{p.lifecycle.depreciationYears}yr</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => setActiveProfile(activeProfileId === p.id ? null : p.id)}>
                      {activeProfileId === p.id ? 'Deactivate' : 'Use'}
                    </button>
                    <button style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => setEditingProfile({ ...p })}>Edit</button>
                    <button style={{ fontSize: 12, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => { const j = exportProfile(p.id); navigator.clipboard.writeText(j) }}>Copy JSON</button>
                    <button style={{ fontSize: 12, color: '#c9190b', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={() => deleteProfile(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Inline profile editor */}
        {editingProfile && (
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--gc-line)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 16 }}>
              {(
                [
                  ['Profile name', 'text', editingProfile.name, (v: string) => setEditingProfile(p => p && { ...p, name: v })],
                  ['Server cost per node ($)', 'number', editingProfile.hardware.serverCostPerNode, (v: string) => setEditingProfile(p => p && { ...p, hardware: { ...p.hardware, serverCostPerNode: +v || 0 } })],
                  ['Storage per TB ($)', 'number', editingProfile.hardware.storageCostPerTb, (v: string) => setEditingProfile(p => p && { ...p, hardware: { ...p.hardware, storageCostPerTb: +v || 0 } })],
                  ['Networking total ($)', 'number', editingProfile.hardware.networkingCost, (v: string) => setEditingProfile(p => p && { ...p, hardware: { ...p.hardware, networkingCost: +v || 0 } })],
                  ['Power rate ($/kWh)', 'number', editingProfile.datacenter.powerRatePerKwh, (v: string) => setEditingProfile(p => p && { ...p, datacenter: { ...p.datacenter, powerRatePerKwh: +v || 0 } })],
                  ['PUE', 'number', editingProfile.datacenter.pue, (v: string) => setEditingProfile(p => p && { ...p, datacenter: { ...p.datacenter, pue: +v || 1 } })],
                  ['Rack cost/month ($)', 'number', editingProfile.datacenter.rackCostPerMonth, (v: string) => setEditingProfile(p => p && { ...p, datacenter: { ...p.datacenter, rackCostPerMonth: +v || 0 } })],
                  ['Depreciation (years)', 'number', editingProfile.lifecycle.depreciationYears, (v: string) => setEditingProfile(p => p && { ...p, lifecycle: { ...p.lifecycle, depreciationYears: +v || 5 } })],
                  ['Maintenance (%/yr)', 'number', editingProfile.lifecycle.maintenancePctPerYear, (v: string) => setEditingProfile(p => p && { ...p, lifecycle: { ...p.lifecycle, maintenancePctPerYear: +v || 0 } })],
                  ['Staff FTEs per N nodes', 'number', editingProfile.lifecycle.staffFtesPerNNodes, (v: string) => setEditingProfile(p => p && { ...p, lifecycle: { ...p.lifecycle, staffFtesPerNNodes: +v || 0 } })],
                  ['Staff cost per FTE ($/yr)', 'number', editingProfile.lifecycle.staffCostPerFte, (v: string) => setEditingProfile(p => p && { ...p, lifecycle: { ...p.lifecycle, staffCostPerFte: +v || 0 } })],
                ] as [string, string, string | number, (v: string) => void][]
              ).map(([label, type, value, onChange]) => (
                <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--gc-text-2)' }}>
                  {label}
                  <input
                    type={type}
                    style={{ fontFamily: 'var(--mono)', fontSize: 13, padding: '6px 8px', border: '1px solid var(--gc-line)', borderRadius: 4 }}
                    value={String(value)}
                    onChange={e => onChange(e.target.value)}
                  />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ fontSize: 13, padding: '6px 14px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { saveProfile(editingProfile!); setEditingProfile(null) }}>Save</button>
              <button style={{ fontSize: 13, padding: '6px 14px', background: 'none', border: '1px solid var(--gc-line)', borderRadius: 4, cursor: 'pointer' }}
                onClick={() => setEditingProfile(null)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Import */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gc-line)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12, padding: '6px 8px', border: '1px solid var(--gc-line)', borderRadius: 4 }}
            placeholder="Paste JSON to import a profile…"
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />
          <button
            style={{ fontSize: 13, padding: '6px 14px', background: 'none', border: '1px solid var(--gc-line)', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
            onClick={() => { importProfile(importText); setImportText('') }}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
