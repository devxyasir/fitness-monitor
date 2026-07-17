'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, LogOut as LogOutIcon, Monitor, X as XIcon } from 'lucide-react';
import type { AuditLogDto, UserDto, UserRole, UserSessionDto, UserStatus } from '@replaycoach/types';
import { userClient } from '../../../../lib/user-client';
import { adminClient } from '../../../../lib/admin-client';
import { withAdminElevation } from '../../../../stores/admin-elevate-store';
import { toast } from '../../../../stores/toast-store';
import { useAuthStore } from '../../../../stores/auth-store';
import { Avatar } from '../../../components/Avatar';
import { Card } from '../../../components/ui/Card';
import { Pill } from '../../../components/ui/Pill';
import { Button } from '../../../components/ui/Button';
import { SkeletonRows, ErrorBlock } from '../../../components/ui/StateBlocks';

const ROLES: UserRole[] = ['platform_admin', 'studio_admin', 'coach', 'student'];
const STATUSES: UserStatus[] = ['active', 'pending', 'suspended', 'disabled'];

function statusVariant(status: UserStatus): 'success' | 'scheduled' | 'danger' | 'ended' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'scheduled';
  if (status === 'suspended' || status === 'disabled') return 'danger';
  return 'ended';
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: self } = useAuthStore();
  const [user, setUser] = useState<UserDto | null>(null);
  const [sessions, setSessions] = useState<UserSessionDto[]>([]);
  const [activity, setActivity] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [u, s, a] = await Promise.all([
        userClient.getUser(params.id),
        userClient.listUserSessions(params.id).catch(() => []),
        adminClient.listAuditLogs({ resourceId: params.id, pageSize: 10 }).catch(() => ({ items: [] as AuditLogDto[], total: 0, page: 1, pageSize: 10 })),
      ]);
      setUser(u);
      setSessions(s);
      setActivity(a.items);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load this user.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (status: UserStatus) => {
    if (!user) return;
    setSaving(true);
    try {
      const updated = await userClient.setUserStatus(user.id, { status });
      setUser(updated);
      toast.success(`Status set to ${status}.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (role: UserRole) => {
    if (!user) return;
    if (!window.confirm(`Change ${user.displayName}'s role to ${role.replace('_', ' ')}?`)) return;
    setSaving(true);
    try {
      const updated = await withAdminElevation(() => userClient.setUserRole(user.id, { role }));
      setUser(updated);
      toast.success(`Role changed to ${role.replace('_', ' ')}.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not update role.');
    } finally {
      setSaving(false);
    }
  };

  const handleForceLogout = async () => {
    if (!user) return;
    if (!window.confirm(`Log ${user.displayName} out of every device?`)) return;
    try {
      await withAdminElevation(() => userClient.forceLogout(user.id));
      setSessions([]);
      toast.success('Logged out everywhere.');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not force logout.');
    }
  };

  const handleRevokeSession = async (tokenId: string) => {
    if (!user) return;
    try {
      await withAdminElevation(() => userClient.revokeUserSession(user.id, tokenId));
      setSessions((prev) => prev.filter((s) => s.id !== tokenId));
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not revoke session.');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <button
        type="button"
        onClick={() => router.push('/admin/users')}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to users
      </button>

      {error && <ErrorBlock message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={4} />
      ) : user && (
        <>
          <Card accent="analytics" className="flex items-center gap-4">
            <Avatar user={user} size={56} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-display-m text-ink truncate">{user.displayName}</h1>
              <p className="text-sm text-ink-muted truncate">{user.email}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Pill variant={user.role === 'student' ? 'scheduled' : 'success'}>{user.role.replace('_', ' ')}</Pill>
              <Pill variant={statusVariant(user.status)}>{user.status}</Pill>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Moderation</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-label text-ink-muted mb-1.5">Status</label>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={saving || s === user.status}
                      onClick={() => handleStatusChange(s)}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        s === user.status ? 'bg-analytics/10 border-analytics text-analytics font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {self?.role === 'platform_admin' && (
                <div>
                  <label className="block text-label text-ink-muted mb-1.5">Role</label>
                  <div className="flex flex-wrap gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={saving || r === user.role}
                        onClick={() => handleRoleChange(r)}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          r === user.role ? 'bg-analytics/10 border-analytics text-analytics font-medium' : 'bg-panel-2 border-hairline text-ink-muted hover:text-ink'
                        }`}
                      >
                        {r.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 pt-5 border-t border-hairline">
              <Button variant="danger" size="sm" onClick={handleForceLogout}>
                <LogOutIcon className="w-3.5 h-3.5" /> Force logout everywhere
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Active sessions</h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-ink-faint">No active sessions.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-sm bg-panel-2 border border-hairline">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Monitor className="w-4 h-4 text-ink-faint flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-ink">{s.rememberMe ? 'Remembered session' : 'Session'}</div>
                        <div className="text-xs text-ink-faint font-mono">
                          Signed in {new Date(s.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      aria-label="Revoke session"
                      className="text-ink-faint hover:text-danger transition-colors flex-shrink-0"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-display-s text-ink mb-4">Recent activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-faint">No recorded activity for this account.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">{a.action.replace(/[._]/g, ' ')}</span>
                    <span className="text-xs text-ink-faint font-mono">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
