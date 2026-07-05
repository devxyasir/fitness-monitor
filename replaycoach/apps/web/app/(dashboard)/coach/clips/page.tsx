'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';

interface Clip {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionId: string;
  createdBy: string;
  createdAt: string;
  shares?: { sharedWithUserId: string }[];
}

interface User {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

interface SessionParticipant {
  id: string;
  userId: string;
  roleInSession: 'coach' | 'student';
  user: User;
}

interface SessionDetails {
  id: string;
  participants: SessionParticipant[];
}

export default function CoachClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback Modal state
  const [playingClip, setPlayingClip] = useState<Clip | null>(null);
  const [playData, setPlayData] = useState<{ playUrl: string; annotations: any[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  // Sharing Modal state
  const [sharingClip, setSharingClip] = useState<Clip | null>(null);
  const [sessionStudents, setSessionStudents] = useState<User[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingShareOptions, setLoadingShareOptions] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  useEffect(() => {
    fetchClips();
  }, []);

  const fetchClips = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Clip[]>('/clips');
      setClips(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch clips. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlay = async (clip: Clip) => {
    try {
      setLoadingPlay(true);
      setPlayingClip(clip);
      // Fetch HLS stream and annotations
      const data = await apiClient.get<{ playUrl: string; annotations: any[] }>(`/clips/${clip.id}`);
      setPlayData(data);
    } catch (err: any) {
      console.error(err);
      alert('Failed to load clip stream.');
      setPlayingClip(null);
    } finally {
      setLoadingPlay(false);
    }
  };

  const handleOpenShare = async (clip: Clip) => {
    try {
      setSharingClip(clip);
      setLoadingShareOptions(true);
      
      // Fetch session details to get the list of active students
      const session = await apiClient.get<SessionDetails>(`/sessions/${clip.sessionId}`);
      const students = (session.participants || [])
        .filter((p) => p.roleInSession === 'student' && p.user)
        .map((p) => p.user);
      
      setSessionStudents(students);

      // Pre-populate checked students based on existing clip shares
      // Note: we can also fetch fresh clip detail to double check shares
      const clipDetail = await apiClient.get<{ clip: Clip }>(`/clips/${clip.id}`);
      const sharedWithIds = (clipDetail.clip.shares || []).map((s) => s.sharedWithUserId);
      setSelectedStudentIds(sharedWithIds);
    } catch (err: any) {
      console.error(err);
      alert('Failed to load sharing options.');
      setSharingClip(null);
    } finally {
      setLoadingShareOptions(false);
    }
  };

  const handleToggleStudentShare = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleSaveShares = async () => {
    if (!sharingClip) return;
    try {
      setSavingShare(true);
      await apiClient.post<{ studentIds: string[] }, any>(`/clips/${sharingClip.id}/share`, {
        studentIds: selectedStudentIds,
      });
      // Refresh clips list to update references
      await fetchClips();
      setSharingClip(null);
    } catch (err: any) {
      console.error(err);
      alert('Failed to save share permissions.');
    } finally {
      setSavingShare(false);
    }
  };

  const formatDuration = (startMs: number, endMs: number) => {
    const totalSecs = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 pb-12">
      <div className="max-w-6xl mx-auto">
        {/* Navigation Sidebar/Header */}
        <header className="flex items-center justify-between mb-8 pb-4 border-b border-slate-900">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              Replay<span className="text-indigo-500">Coach</span>
            </h1>
            <nav className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <Link
                href="/coach/sessions"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Sessions
              </Link>
              <Link
                href="/coach/clips"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white shadow"
              >
                Clips Library
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Coach Clips Library</h2>
              <p className="text-xs text-slate-400 mt-1">
                View, play back, and manage sharing permissions for replay clips you created.
              </p>
            </div>
            <button
              onClick={fetchClips}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition"
            >
              🔄 Refresh
            </button>
          </div>

          {error && (
            <div className="bg-red-950/20 border border-red-900 text-red-300 rounded-2xl p-4 text-xs font-medium mb-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-xs text-slate-400">Loading clips...</p>
            </div>
          ) : clips.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-16 text-center max-w-xl mx-auto mt-6">
              <div className="text-4xl mb-4">🎬</div>
              <h3 className="text-base font-bold text-white mb-2">No clips created yet</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                You can save a specific range from a past session as a permanent clip complete with annotations while in the session room DVR replay tab.
              </p>
              <Link
                href="/coach/sessions"
                className="inline-flex px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
              >
                Go to Sessions
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="bg-slate-900/60 border border-slate-900 rounded-3xl p-5 flex flex-col justify-between hover:border-slate-800 transition group shadow-md"
                >
                  <div>
                    {/* Media Mock Card Header */}
                    <div className="aspect-video w-full rounded-2xl mb-4 bg-gradient-to-tr from-slate-950 to-indigo-950/30 flex items-center justify-center relative border border-slate-950 overflow-hidden">
                      <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-[2px]">
                        <button
                          onClick={() => handleOpenPlay(clip)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition duration-300"
                        >
                          ▶️
                        </button>
                      </div>
                      <span className="text-2xl opacity-60">📹</span>
                      <span className="absolute bottom-2 right-2 bg-slate-950/80 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold text-slate-300 tracking-wider">
                        {formatDuration(clip.startMs, clip.endMs)}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition truncate">
                      {clip.title}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      Session: {clip.sessionId.substring(0, 8)}...
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Created: {new Date(clip.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-2.5 mt-5">
                    <button
                      onClick={() => handleOpenPlay(clip)}
                      className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold tracking-wide transition border border-slate-700"
                    >
                      ▶️ Play
                    </button>
                    <button
                      onClick={() => handleOpenShare(clip)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold tracking-wide transition"
                    >
                      📤 Share ({clip.shares?.length || 0})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Playback Modal */}
      {playingClip && playData && (
        <ClipPlaybackModal
          clip={playingClip}
          playUrl={playData.playUrl}
          annotations={playData.annotations}
          onClose={() => {
            setPlayingClip(null);
            setPlayData(null);
          }}
        />
      )}
      
      {playingClip && loadingPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col items-center gap-3">
            <div className="w-7 h-7 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-xs text-slate-300">Fetching signed URL...</p>
          </div>
        </div>
      )}

      {/* Sharing Model */}
      {sharingClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Share Clip Permissions</h3>
              <button
                onClick={() => setSharingClip(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6">
              <h4 className="text-xs font-semibold text-slate-300 mb-2 truncate">
                Clip: {sharingClip.title}
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                Select which students will have authorization to access and view this clip in their clips library.
              </p>

              {loadingShareOptions ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                  <p className="text-[10px] text-slate-400">Loading students...</p>
                </div>
              ) : sessionStudents.length === 0 ? (
                <div className="p-6 bg-slate-950/50 rounded-2xl border border-slate-800 text-center">
                  <p className="text-xs text-slate-400">No students are registered in this session.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {sessionStudents.map((student) => {
                    const isChecked = selectedStudentIds.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        onClick={() => handleToggleStudentShare(student.id)}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer select-none ${
                          isChecked
                            ? 'bg-indigo-950/20 border-indigo-500/50 text-white'
                            : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex flex-col select-none">
                          <span className="text-xs font-bold">{student.displayName}</span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5">{student.email}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by click on wrapper
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-500 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-800 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSharingClip(null)}
                className="px-4 py-2 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingShare || loadingShareOptions}
                onClick={handleSaveShares}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition"
              >
                {savingShare ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
