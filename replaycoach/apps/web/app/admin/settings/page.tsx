'use client';

import { useEffect, useState } from 'react';
import type { SystemSettingsDto } from '@replaycoach/types';
import { systemSettingsClient } from '../../../lib/system-settings-client';
import { toast } from '../../../stores/toast-store';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { SkeletonRows, ErrorBlock } from '../../components/ui/StateBlocks';

type TabKey = 'smtp' | 'theme' | 'templates' | 'platform';

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
        ) : (
          <PlatformTab settings={settings.platform} onSaved={load} />
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
