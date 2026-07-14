'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { Users, Mail, Calendar, RefreshCw, UserPlus, Loader2 } from 'lucide-react';

interface CoachStudent {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  sessionsCount: number;
  lastSessionAt: string | null;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-brand-violet animate-spin" />
        <span className="ml-2 text-ink-muted">Loading students...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-ink">Students</h1>
          <p className="text-sm text-ink-muted mt-1">Everyone you've run a coaching session with.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStudents}
            className="p-2 rounded-full bg-panel-2 hover:bg-panel-2/60 border border-hairline text-ink-muted hover:text-ink transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/invite"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow text-canvas text-sm font-semibold transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Invite Student
          </Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm animate-rise">
          {error}
        </div>
      )}

      {!loading && students.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Users className="w-12 h-12 text-ink-faint mb-4" />
          <h2 className="text-lg font-display font-semibold text-ink">No students yet</h2>
          <p className="text-sm text-ink-muted mt-1 max-w-sm">
            Invite students to join your coaching sessions. They'll appear here once they've been in a session with you.
          </p>
          <Link
            href="/invite"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet hover:shadow-glow text-canvas text-sm font-semibold transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Invite Your First Student
          </Link>
        </div>
      ) : (
        <div className="bg-panel border border-hairline rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-panel-2/50">
                <th className="text-left px-4 py-3 text-ink-muted font-medium">Student</th>
                <th className="text-left px-4 py-3 text-ink-muted font-medium">Status</th>
                <th className="text-left px-4 py-3 text-ink-muted font-medium">Sessions</th>
                <th className="text-left px-4 py-3 text-ink-muted font-medium">Last Session</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-hairline last:border-0 hover:bg-panel-2/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-violet flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-canvas">
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
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium border ${
                        student.status === 'active'
                          ? 'bg-live/10 text-live border-live/30'
                          : student.status === 'pending'
                            ? 'bg-replay/10 text-replay border-replay/30'
                            : 'bg-panel-2 text-ink-faint border-hairline'
                      }`}
                    >
                      {student.status}
                    </span>
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
