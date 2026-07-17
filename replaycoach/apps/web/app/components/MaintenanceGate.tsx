'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { systemSettingsClient } from '../../lib/system-settings-client';
import { useAuthStore } from '../../stores/auth-store';
import { Logomark } from './Logomark';

/**
 * Checked once per load via the public GET /system-settings/status — shows
 * a full-page notice to non-admin visitors when maintenanceMode is on.
 * /admin/* is always exempt (a platform_admin must be able to reach
 * /admin/login and turn the toggle back off even while it's active).
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    systemSettingsClient
      .getPublicStatus()
      .then((status) => setMaintenanceMode(status.maintenanceMode))
      .catch(() => setMaintenanceMode(false))
      .finally(() => setChecked(true));
  }, []);

  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const bypasses = isAdminRoute || user?.role === 'platform_admin';

  if (checked && maintenanceMode && !bypasses) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <Logomark className="w-8 h-8 text-brand mx-auto mb-5" />
          <h1 className="font-display text-display-m text-ink mb-2">Down for maintenance</h1>
          <p className="text-sm text-ink-muted leading-relaxed">
            LetsMove is temporarily unavailable while we make some updates. Please check back shortly.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
