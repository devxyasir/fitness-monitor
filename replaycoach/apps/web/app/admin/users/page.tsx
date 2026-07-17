'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import type { UserDto, UserRole, UserStatus } from '@replaycoach/types';
import { userClient } from '../../../lib/user-client';
import { withAdminElevation } from '../../../stores/admin-elevate-store';
import { toast } from '../../../stores/toast-store';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Input } from '../../components/ui/Input';
import { SkeletonRows, ErrorBlock, StateBlock } from '../../components/ui/StateBlocks';

const PAGE_SIZE = 20;
const ROLES: UserRole[] = ['platform_admin', 'studio_admin', 'coach', 'student'];
const STATUSES: UserStatus[] = ['active', 'pending', 'suspended', 'disabled'];

function statusVariant(status: UserStatus): 'success' | 'scheduled' | 'danger' | 'ended' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'scheduled';
  if (status === 'suspended' || status === 'disabled') return 'danger';
  return 'ended';
}

export default function AdminUsersPage() {
  const [items, setItems] = useState<UserDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await userClient.listUsers({
        page,
        pageSize: PAGE_SIZE,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search, role, status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleForceLogout = async (id: string, name: string) => {
    if (!window.confirm(`Log ${name} out of every device?`)) return;
    try {
      await withAdminElevation(() => userClient.forceLogout(id));
      toast.success(`${name} has been logged out everywhere.`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not force logout.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-display-m text-ink">Users</h1>
        <p className="text-sm text-ink-muted mt-1">{total} total across the platform.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-64">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              id="user-search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              className="pl-9"
            />
          </div>
        </div>
        <select
          value={role}
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value as UserRole | '');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as UserStatus | '');
          }}
          className="bg-panel-2 border border-hairline rounded-sm px-3 py-2.5 text-sm text-ink"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading ? (
        <SkeletonRows count={8} />
      ) : items.length === 0 ? (
        <StateBlock icon={<UsersIcon />} title="No users found" body="Try a different search or filter." />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`}>
                <Card className="flex items-center gap-4 py-3.5 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <Avatar user={u} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink truncate">{u.displayName}</div>
                    <div className="text-xs text-ink-faint truncate">{u.email}</div>
                  </div>
                  <Pill variant={u.role === 'student' ? 'scheduled' : 'success'} className="hidden sm:inline-flex">
                    {u.role.replace('_', ' ')}
                  </Pill>
                  <Pill variant={statusVariant(u.status)}>{u.status}</Pill>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      void handleForceLogout(u.id, u.displayName);
                    }}
                    className="hidden sm:block text-xs text-ink-faint hover:text-danger transition-colors flex-shrink-0"
                  >
                    Force logout
                  </button>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-xs text-ink-faint font-mono">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
