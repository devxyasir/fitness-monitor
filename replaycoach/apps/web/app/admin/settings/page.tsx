'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, History, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { GeoAllowedRegion, GeoSettingsVersionDto, SystemSettingsDto } from '@replaycoach/types';
import { systemSettingsClient } from '../../../lib/system-settings-client';
import { ISO_COUNTRIES } from '../../../lib/iso-countries';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { SkeletonRows, ErrorBlock } from '../../components/ui/StateBlocks';

type TabKey = 'smtp' | 'theme' | 'templates' | 'platform' | 'geo';

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<TabKey>('smtp');
  const [settings, setSettings] = useState<SystemSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await systemSettingsClient.getAll());
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load platform settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-display-m text-ink mb-1">Settings</h1>
      <p className="text-ink-muted text-sm mb-6">
        Deployment-wide configuration — email delivery, brand colors, invite email copy, and platform toggles.
      </p>

      <Tabs
        items={[
          { key: 'smtp', label: 'Email delivery' },
          { key: 'theme', label: 'Brand colors' },
          { key: 'templates', label: 'Invite email' },
          { key: 'platform', label: 'Platform' },
          { key: 'geo', label: 'Geo access' },
        ]}
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
      />

      <div className="mt-5">
        {loading ? (
          <SkeletonRows count={3} />
        ) : error || !settings ? (
          <ErrorBlock message={error ?? 'Could not load settings.'} onRetry={load} />
        ) : tab === 'smtp' ? (
          <SmtpTab settings={settings.smtp} onSaved={load} />
        ) : tab === 'theme' ? (
          <ThemeTab settings={settings.theme} onSaved={load} />
        ) : tab === 'templates' ? (
          <TemplatesTab settings={settings.emailTemplates} onSaved={load} />
        ) : tab === 'platform' ? (
          <PlatformTab settings={settings.platform} onSaved={load} />
        ) : (
          <GeoAccessTab settings={settings.geoAccess} onSaved={load} />
        )}
      </div>
    </div>
  );
}

function SmtpTab({ settings, onSaved }: { settings: SystemSettingsDto['smtp']; onSaved: () => void }) {
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));
  const [secure, setSecure] = useState(settings.secure);
  const [user, setUser] = useState(settings.user);
  const [from, setFrom] = useState(settings.from);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await systemSettingsClient.updateSmtp({
        host,
        port: Number(port),
        secure,
        user,
        from,
        ...(password ? { password } : {}),
      });
      toast.success('Email delivery settings saved.');
      setPassword('');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save SMTP settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input id="smtp-host" type="text" label="SMTP host" required value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
        <div className="grid grid-cols-2 gap-4">
          <Input id="smtp-port" type="number" label="Port" required value={port} onChange={(e) => setPort(e.target.value)} />
          <div>
            <label className="block text-label text-ink-muted mb-1.5">Encryption</label>
            <button
              type="button"
              onClick={() => setSecure((v) => !v)}
              className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink text-left"
            >
              {secure ? 'SSL (port 465)' : 'STARTTLS (port 587)'}
            </button>
          </div>
        </div>
        <Input id="smtp-user" type="text" label="Username" required value={user} onChange={(e) => setUser(e.target.value)} placeholder="you@gmail.com" />
        <Input
          id="smtp-password"
          type="password"
          label={settings.hasPassword ? 'Password (leave blank to keep current)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={settings.hasPassword ? '••••••••' : 'App password or API key'}
        />
        <Input id="smtp-from" type="text" label="From address" required value={from} onChange={(e) => setFrom(e.target.value)} placeholder="LetsMove <no-reply@example.com>" />
        <Button type="submit" loading={loading} className="self-start">
          {loading ? 'Saving…' : 'Save email settings'}
        </Button>
      </form>
    </Card>
  );
}

function ThemeTab({ settings, onSaved }: { settings: SystemSettingsDto['theme']; onSaved: () => void }) {
  const [light, setLight] = useState(settings.light);
  const [dark, setDark] = useState(settings.dark);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await systemSettingsClient.updateTheme({ light, dark });
      toast.success('Brand colors saved — visitors will see them on next page load.');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save theme.');
    } finally {
      setLoading(false);
    }
  };

  const colorField = (
    themeKey: 'light' | 'dark',
    colorKey: 'brand' | 'session' | 'analytics',
    label: string,
    value: string,
    setter: (v: { brand: string; session: string; analytics: string }) => void,
    current: { brand: string; session: string; analytics: string },
  ) => (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => setter({ ...current, [colorKey]: e.target.value })}
        className="w-9 h-9 rounded-md border border-hairline cursor-pointer bg-transparent"
        aria-label={`${themeKey} ${label}`}
      />
      <span className="text-sm text-ink flex-1">{label}</span>
      <span className="font-mono text-xs text-ink-faint">{value}</span>
    </div>
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-widest text-ink-faint mb-3">Light theme</h4>
          <div className="flex flex-col gap-3">
            {colorField('light', 'brand', 'Brand', light.brand, setLight, light)}
            {colorField('light', 'session', 'Session', light.session, setLight, light)}
            {colorField('light', 'analytics', 'Analytics', light.analytics, setLight, light)}
          </div>
        </div>
        <div>
          <h4 className="font-mono text-xs uppercase tracking-widest text-ink-faint mb-3">Dark theme</h4>
          <div className="flex flex-col gap-3">
            {colorField('dark', 'brand', 'Brand', dark.brand, setDark, dark)}
            {colorField('dark', 'session', 'Session', dark.session, setDark, dark)}
            {colorField('dark', 'analytics', 'Analytics', dark.analytics, setDark, dark)}
          </div>
        </div>
        <Button type="submit" loading={loading} className="self-start">
          {loading ? 'Saving…' : 'Save brand colors'}
        </Button>
      </form>
    </Card>
  );
}

function TemplatesTab({ settings, onSaved }: { settings: SystemSettingsDto['emailTemplates']; onSaved: () => void }) {
  const [subject, setSubject] = useState(settings.invite.subject);
  const [heading, setHeading] = useState(settings.invite.heading);
  const [bodyIntro, setBodyIntro] = useState(settings.invite.bodyIntro);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await systemSettingsClient.updateEmailTemplates({ invite: { subject, heading, bodyIntro } });
      toast.success('Invite email copy saved.');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save email template.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <p className="text-ink-muted text-sm mb-4 leading-relaxed">
        Available placeholders: <code className="font-mono text-xs bg-panel-2 px-1.5 py-0.5 rounded">{'{{orgName}}'}</code>{' '}
        <code className="font-mono text-xs bg-panel-2 px-1.5 py-0.5 rounded">{'{{invitedByName}}'}</code>{' '}
        <code className="font-mono text-xs bg-panel-2 px-1.5 py-0.5 rounded">{'{{role}}'}</code>
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input id="tpl-subject" type="text" label="Subject line" required value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Input id="tpl-heading" type="text" label="Email heading" required value={heading} onChange={(e) => setHeading(e.target.value)} />
        <div>
          <label htmlFor="tpl-body" className="block text-label text-ink-muted mb-1.5">Intro paragraph</label>
          <textarea
            id="tpl-body"
            required
            rows={3}
            value={bodyIntro}
            onChange={(e) => setBodyIntro(e.target.value)}
            className="w-full bg-panel-2 border border-hairline rounded-sm px-3.5 py-2.5 text-sm text-ink transition-all duration-150 focus:outline-none focus-visible:border-brand focus-visible:shadow-focus resize-none"
          />
        </div>
        <Button type="submit" loading={loading} className="self-start">
          {loading ? 'Saving…' : 'Save email copy'}
        </Button>
      </form>
    </Card>
  );
}

function GeoAccessTab({ settings, onSaved }: { settings: SystemSettingsDto['geoAccess']; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [mode, setMode] = useState(settings.mode);
  const [allowedCountries, setAllowedCountries] = useState<string[]>(settings.allowedCountries);
  const [allowedRegions, setAllowedRegions] = useState<GeoAllowedRegion[]>(settings.allowedRegions);
  const [detectionMethod, setDetectionMethod] = useState(settings.detectionMethod);
  const [requireGpsPermission, setRequireGpsPermission] = useState(settings.requireGpsPermission);
  const [fallbackToIp, setFallbackToIp] = useState(settings.fallbackToIp);
  const [strictMode, setStrictMode] = useState(settings.strictMode);
  const [blockUnknownLocations, setBlockUnknownLocations] = useState(settings.blockUnknownLocations);
  const [countrySearch, setCountrySearch] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return ISO_COUNTRIES;
    return ISO_COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [countrySearch]);

  const toggleCountry = (code: string) => {
    setAllowedCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const regionsForCountry = (code: string) => allowedRegions.find((r) => r.countryCode === code)?.regionNames.join(', ') ?? '';

  const setRegionsForCountry = (code: string, raw: string) => {
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    setAllowedRegions((prev) => {
      const without = prev.filter((r) => r.countryCode !== code);
      return names.length > 0 ? [...without, { countryCode: code, regionNames: names }] : without;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await systemSettingsClient.updateGeoAccess({
        enabled,
        mode,
        allowedCountries,
        allowedRegions,
        detectionMethod,
        requireGpsPermission,
        fallbackToIp,
        strictMode,
        blockUnknownLocations,
      });
      toast.success('Geo access settings saved.');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save geo access settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <ToggleRow
          label="Geo access control"
          description="Master switch. Off = everyone, everywhere, can use the platform — nothing else on this tab has any effect."
          checked={enabled}
          onChange={setEnabled}
        />

        {enabled && (
          <>
            <div>
              <label className="block text-label text-ink-muted mb-1.5">Access mode</label>
              <div className="flex gap-2">
                {(['global', 'restricted'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                      mode === m ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                    }`}
                  >
                    {m === 'global' ? 'Global access' : 'Restricted access'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'restricted' && (
              <div>
                <label className="block text-label text-ink-muted mb-1.5">
                  Allowed countries {allowedCountries.length > 0 && `(${allowedCountries.length} selected)`}
                </label>
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    placeholder="Search countries…"
                    className="w-full bg-panel-2 border border-hairline rounded-sm pl-8 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:border-brand"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto border border-hairline rounded-sm divide-y divide-hairline">
                  {filteredCountries.map((c) => {
                    const checked = allowedCountries.includes(c.code);
                    return (
                      <div key={c.code}>
                        <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-panel-2 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => toggleCountry(c.code)} className="accent-brand" />
                          <span className="text-sm text-ink flex-1">{c.name}</span>
                          <span className="font-mono text-xs text-ink-faint">{c.code}</span>
                        </label>
                        {checked && (
                          <div className="px-3 pb-2.5 pl-9">
                            <input
                              type="text"
                              value={regionsForCountry(c.code)}
                              onChange={(e) => setRegionsForCountry(c.code, e.target.value)}
                              placeholder="Limit to specific states/regions (comma-separated) — leave blank for the whole country"
                              className="w-full bg-panel border border-hairline rounded-sm px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus-visible:border-brand"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-label text-ink-muted mb-1.5">Location detection method</label>
              <div className="flex gap-2">
                {(['ip', 'gps'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDetectionMethod(m)}
                    className={`flex-1 px-3.5 py-2.5 rounded-sm text-sm border transition-colors ${
                      detectionMethod === m ? 'bg-brand/10 border-brand text-brand font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                    }`}
                  >
                    {m === 'ip' ? 'Passive (IP address)' : 'Aggressive (GPS permission)'}
                  </button>
                ))}
              </div>
            </div>

            {detectionMethod === 'gps' && (
              <>
                <ToggleRow
                  label="Require GPS permission"
                  description="Visitors must grant location access before they can use the app."
                  checked={requireGpsPermission}
                  onChange={setRequireGpsPermission}
                />
                <ToggleRow
                  label="Fall back to IP"
                  description="If GPS is denied or unavailable, check location by IP address instead of blocking outright."
                  checked={fallbackToIp}
                  onChange={setFallbackToIp}
                />
                <ToggleRow
                  label="Strict mode"
                  description="If GPS is denied, block access immediately — overrides the IP fallback above."
                  checked={strictMode}
                  onChange={setStrictMode}
                />
              </>
            )}

            <ToggleRow
              label="Block unknown locations"
              description="If a visitor's location can't be determined at all (provider outage, unroutable IP), block them instead of letting them through."
              checked={blockUnknownLocations}
              onChange={setBlockUnknownLocations}
            />
          </>
        )}

        <Button type="submit" loading={loading} className="self-start">
          {loading ? 'Saving…' : 'Save geo access settings'}
        </Button>
      </form>

      <GeoSettingsVersionHistory onRestored={onSaved} />
    </Card>
  );
}

/** Collapsed by default, fetched only on expand — every geo-access save
 * already snapshots a version (see updateGeoAccess), so this is pure
 * history, never a second concept to keep in sync. */
function GeoSettingsVersionHistory({ onRestored }: { onRestored: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [versions, setVersions] = useState<GeoSettingsVersionDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await systemSettingsClient.listGeoSettingsVersions();
      setVersions(res.items);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not load settings history.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && versions === null) void load();
  };

  const handleRestore = async (version: GeoSettingsVersionDto) => {
    const when = new Date(version.createdAt).toLocaleString();
    if (!window.confirm(`Restore geo access settings to the version from ${when}? This replaces the current live settings and creates a new version.`)) {
      return;
    }
    setRestoringId(version.id);
    try {
      await systemSettingsClient.restoreGeoSettingsVersion(version.id);
      toast.success('Geo access settings restored.');
      onRestored();
      await load();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not restore this version.');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="border-t border-hairline pt-4 mt-1">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <History className="w-4 h-4" />
        Previous versions
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-3">
          {loading ? (
            <SkeletonRows count={3} />
          ) : !versions || versions.length === 0 ? (
            <p className="text-xs text-ink-faint">No saved versions yet — every save creates one.</p>
          ) : (
            <div className="border border-hairline rounded-sm divide-y divide-hairline">
              {versions.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs text-ink font-mono">{new Date(v.createdAt).toLocaleString()}</div>
                    <div className="text-xs text-ink-faint truncate">
                      {i === 0 ? 'Current' : v.createdByName ?? 'Unknown admin'}
                      {i !== 0 && ` · ${v.settings.enabled ? (v.settings.mode === 'restricted' ? `Restricted, ${v.settings.allowedCountries.length} countries` : 'Global') : 'Disabled'}`}
                    </div>
                  </div>
                  {i !== 0 && (
                    <button
                      type="button"
                      disabled={restoringId !== null}
                      onClick={() => handleRestore(v)}
                      className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors flex-shrink-0 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {restoringId === v.id ? 'Restoring…' : 'Restore'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlatformTab({ settings, onSaved }: { settings: SystemSettingsDto['platform']; onSaved: () => void }) {
  const [maintenanceMode, setMaintenanceMode] = useState(settings.maintenanceMode);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(settings.allowPublicRegistration);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await systemSettingsClient.updatePlatform({ maintenanceMode, allowPublicRegistration });
      toast.success('Platform settings saved.');
      onSaved();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not save platform settings.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <ToggleRow
          label="Maintenance mode"
          description="Non-admin visitors see a maintenance page instead of the app. You stay able to log in and turn it back off."
          checked={maintenanceMode}
          onChange={setMaintenanceMode}
        />
        <ToggleRow
          label="Allow public registration"
          description="When off, only invite-based signup works — the open coach self-signup form is blocked."
          checked={allowPublicRegistration}
          onChange={setAllowPublicRegistration}
        />
        <Button type="submit" loading={loading} className="self-start">
          {loading ? 'Saving…' : 'Save platform settings'}
        </Button>
      </form>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? 'bg-analytics' : 'bg-hairline'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white dark:bg-canvas shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
