'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';
import { MeetingGroups } from '../../components/MeetingGroups';
import type { ClipItem } from '../../components/clipsShared';
import { RefreshCw, Clapperboard, X } from 'lucide-react';

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
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [playingClip, setPlayingClip] = useState<ClipItem | null>(null);
  const [playData, setPlayData] = useState<{ playUrl: string; annotations: any[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  const [sharingClip, setSharingClip] = useState<ClipItem | null>(null);
  const [sessionStudents, setSessionStudents] = useState<User[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingShareOptions, setLoadingShareOptions] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  useEffect(() => { fetchClips(); }, []);

  const fetchClips = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<ClipItem[]>('/clips');
      setClips(data);
      setError(null);
    } catch (err: any) {
      setError('Failed to fetch clips. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlay = async (clip: ClipItem) => {
    try {
      setLoadingPlay(true);
      setPlayingClip(clip);
      const data = await apiClient.get<{ playUrl: string; annotations: any[] }>(`/clips/${clip.id}`);
      setPlayData(data);
    } catch (err: any) {
      alert('Failed to load clip stream.');
      setPlayingClip(null);
    } finally {
      setLoadingPlay(false);
    }
  };

  const handleOpenShare = async (clip: ClipItem) => {
    try {
      setSharingClip(clip);
      setLoadingShareOptions(true);
      const session = await apiClient.get<SessionDetails>(`/sessions/${clip.sessionId}`);
      const students = (session.participants || []).filter((p) => p.roleInSession === 'student' && p.user).map((p) => p.user);
      setSessionStudents(students);
      const clipDetail = await apiClient.get<{ clip: { shares?: { sharedWithUserId: string }[] } }>(`/clips/${clip.id}`);
      setSelectedStudentIds((clipDetail.clip.shares || []).map((s) => s.sharedWithUserId));
    } catch (err: any) {
      alert('Failed to load sharing options.');
      setSharingClip(null);
    } finally {
      setLoadingShareOptions(false);
    }
  };

  const handleToggleStudentShare = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handleSaveShares = async () => {
    if (!sharingClip) return;
    try {
      setSavingShare(true);
      await apiClient.post(`/clips/${sharingClip.id}/share`, { studentIds: selectedStudentIds });
      await fetchClips();
      setSharingClip(null);
    } catch (err: any) {
      alert('Failed to save share permissions.');
    } finally {
      setSavingShare(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-xl">Clips Library</h2>
          <p className="text-xs text-ink-muted mt-1">View, play back, and manage sharing for your replay clips.</p>
        </div>
        <button
          onClick={fetchClips}
          className="px-3.5 py-2 text-xs font-semibold text-ink bg-panel-2 border border-hairline rounded-full hover:bg-panel-2/80 transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-xs font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-brand-indigo border-t-transparent animate-spin" />
          <p className="text-xs text-ink-muted">Loading clips...</p>
        </div>
      ) : clips.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-hairline rounded-lg">
          <Clapperboard className="w-10 h-10 mx-auto text-ink-faint mb-4" />
          <h3 className="text-base font-bold text-ink mb-2">No clips yet</h3>
          <p className="text-sm text-ink-muted max-w-sm mx-auto mb-6">
            Save a replay from a live room to see it here.
          </p>
          <Link
            href="/coach/sessions"
            className="inline-flex px-4 py-2 text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full hover:shadow-glow transition-all"
          >
            Go to Sessions
          </Link>
        </div>
      ) : (
        <MeetingGroups clips={clips} onPlay={handleOpenPlay} onShare={handleOpenShare} />
      )}

      {/* Playback Modal */}
      {playingClip && playData && (
        <ClipPlaybackModal clip={playingClip} playUrl={playData.playUrl} annotations={playData.annotations} onClose={() => { setPlayingClip(null); setPlayData(null); }} />
      )}

      {playingClip && loadingPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
          <div className="bg-panel p-6 rounded-lg border border-hairline flex flex-col items-center gap-3">
            <div className="w-7 h-7 rounded-full border-4 border-brand-indigo border-t-transparent animate-spin" />
            <p className="text-xs text-ink-muted">Fetching signed URL...</p>
          </div>
        </div>
      )}

      {/* Sharing Modal */}
      {sharingClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4">
          <div className="bg-panel border border-hairline rounded-lg w-full max-w-md overflow-hidden flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">Share Clip Permissions</h3>
              <button onClick={() => setSharingClip(null)} className="text-ink-muted hover:text-ink"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6">
              {loadingShareOptions ? (
                <div className="flex justify-center py-6"><div className="w-6 h-6 rounded-full border-3 border-brand-indigo border-t-transparent animate-spin" /></div>
              ) : sessionStudents.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-4">No students in this session yet.</p>
              ) : (
                <div className="space-y-3">
                  {sessionStudents.map((s) => (
                    <label key={s.id} className="flex items-center gap-3 cursor-pointer text-sm text-ink">
                      <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => handleToggleStudentShare(s.id)} className="accent-brand-indigo" />
                      {s.displayName || s.email}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-hairline flex justify-end gap-3">
              <button onClick={() => setSharingClip(null)} className="text-xs font-semibold text-ink-muted hover:text-ink">Cancel</button>
              <button onClick={handleSaveShares} disabled={savingShare} className="px-4 py-2 text-xs font-semibold text-canvas bg-gradient-to-r from-brand-indigo to-brand-violet rounded-full disabled:opacity-50">
                {savingShare ? 'Saving...' : 'Save sharing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
