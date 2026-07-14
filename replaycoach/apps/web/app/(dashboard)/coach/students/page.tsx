'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { Users, Mail, Calendar, RefreshCw, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Pill } from '../../../components/ui/Pill';
import { StateBlock, SkeletonRows, ErrorBlock } from '../../../components/ui/StateBlocks';

interface CoachStudent {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  sessionsCount: number;
  lastSessionAt: string | null;
}

function statusPillVariant(status: string): 'success' | 'replay' | 'ended' {
  if (status === 'active') return 'success';
  if (status === 'pending') return 'replay';
  return 'ended';
}

export default function CoachStudentsPage() {
  const [students, setStudents] = useState<CoachStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<CoachStudent[]>('/dashboard/coach/students');
      setStudents(data);
      setError(null);
    } catch (err) {
      console.error('[CoachStudents] failed to load', err);
      setError('Failed to load students. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold text-ink">Students</h1>
          <p className="text-sm text-ink-muted mt-1">Everyone you&apos;ve run a coaching session with.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStudents}
            className="p-2 rounded-full bg-panel-2 hover:bg-panel-2/60 border border-hairline text-ink-muted hover:text-ink transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button href="/invite" size="sm">
            <UserPlus className="w-4 h-4" /> Invite student
          </Button>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={fetchStudents} />}

      {loading ? (
        <SkeletonRows count={5} />
      ) : students.length === 0 ? (
        <StateBlock
          icon={<Users className="w-full h-full" />}
          title="No students yet"
          body="Invite students to join your coaching sessions. They'll appear here once they've been in a session with you."
          action={<Button href="/invite"><UserPlus className="w-4 h-4" /> Invite your first student</Button>}
        />
      ) : (
        <div className="bg-panel border border-hairline rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-panel-2 text-label text-ink-faint uppercase">
                <th className="text-left px-4 py-3">Student</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Sessions</th>
                <th className="text-left px-4 py-3">Last session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {students.map((student) => (
                <tr key={student.id} className="hover:bg-panel-2/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-analytics flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white dark:text-canvas">
                          {student.displayName?.charAt(0)?.toUpperCase() || student.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-ink font-medium truncate">{student.displayName || 'Unnamed'}</div>
                        <div className="text-xs text-ink-faint flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 flex-shrink-0" />
                          {student.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Pill variant={statusPillVariant(student.status)}>{student.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-ink-muted font-mono">{student.sessionsCount}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {student.lastSessionAt ? new Date(student.lastSessionAt).toLocaleDateString() : 'Never'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
