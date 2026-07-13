'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { Users, Mail, Calendar, RefreshCw, UserPlus, Loader2 } from 'lucide-react';

interface Student {
  id: string;
  email: string;
  displayName: string;
  role: 'student' | 'coach';
  status: 'active' | 'pending' | 'suspended' | 'disabled';
  createdAt: string;
  lastLoginAt: string | null;
}

export default function CoachStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Student[]>('/users?role=student');
      setStudents(data);
      setError(null);
    } catch (err: any) {
      setError('Failed to load students. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        <span className="ml-2 text-slate-400">Loading students...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Students</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your students and their progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStudents}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Link
            href="/invite"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
          >
            <UserPlus className="w-4 h-4" />
            Invite Student
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-950/30 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && students.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Users className="w-12 h-12 text-slate-600 mb-4" />
          <h2 className="text-lg font-semibold text-slate-300">No students yet</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">
            Invite students to join your coaching sessions. They'll appear here once they accept.
          </p>
          <Link
            href="/invite"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition"
          >
            <UserPlus className="w-4 h-4" />
            Invite Your First Student
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Student</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Joined</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-300">
                          {student.displayName?.charAt(0)?.toUpperCase() || student.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-medium">{student.displayName || 'Unnamed'}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {student.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      student.status === 'active'
                        ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800'
                        : student.status === 'pending'
                        ? 'bg-amber-950/40 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(student.createdAt).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {student.lastLoginAt
                      ? new Date(student.lastLoginAt).toLocaleDateString()
                      : 'Never'}
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
