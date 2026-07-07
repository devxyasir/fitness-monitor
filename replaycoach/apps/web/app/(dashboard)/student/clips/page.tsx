'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';
import { MeetingGroups } from '../../components/MeetingGroups';
import type { ClipItem } from '../../components/clipsShared';
import { RefreshCw, Clapperboard } from 'lucide-react';

export default function StudentClipsPage() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback Modal state
  const [playingClip, setPlayingClip] = useState<ClipItem | null>(null);
  const [playData, setPlayData] = useState<{ playUrl: string; annotations: any[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  useEffect(() => {
    fetchClips();
  }, []);

  const fetchClips = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<ClipItem[]>('/clips');
      setClips(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch shared clips. Please try again.');
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
      console.error(err);
      alert('Failed to load clip stream.');
      setPlayingClip(null);
    } finally {
      setLoadingPlay(false);
    }
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
                href="/student/sessions"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                My Sessions
              </Link>
              <Link
                href="/student/clips"
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white shadow"
              >
                Shared Clips
              </Link>
            </nav>
          </div>
        </header>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-white">Shared Clips Library</h2>
              <p className="text-xs text-slate-400 mt-1">
                Playback video feedback segments shared directly with you by your coaches.
              </p>
            </div>
            <button
              onClick={fetchClips}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 transition inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
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
              <p className="text-xs text-slate-400">Loading shared clips...</p>
            </div>
          ) : clips.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-16 text-center max-w-xl mx-auto mt-6">
              <Clapperboard className="w-10 h-10 mb-4 mx-auto text-slate-500" />
              <h3 className="text-base font-bold text-white mb-2">No clips shared yet</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Once a coach analyzes and shares a clip with you, it will appear here, grouped by meeting.
              </p>
            </div>
          ) : (
            <MeetingGroups clips={clips} onPlay={handleOpenPlay} />
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
    </div>
  );
}
