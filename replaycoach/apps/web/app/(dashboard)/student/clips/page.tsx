'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';
import { RefreshCw, Clapperboard, Play, Video } from 'lucide-react';

interface Clip {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionId: string;
  createdBy: string;
  createdAt: string;
  clipType?: 'recording' | 'reference';
}

export default function StudentClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback Modal state
  const [playingClip, setPlayingClip] = useState<Clip | null>(null);
  const [playData, setPlayData] = useState<{ playUrl: string; annotations: any[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

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
      setError('Failed to fetch shared clips. Please try again.');
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
                Once a coach extracts and shares a particular highlight range with you, it will appear here for toggleable playback review.
              </p>
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
                    <div className="aspect-video w-full rounded-2xl mb-4 bg-gradient-to-tr from-slate-950 to-indigo-950/20 flex items-center justify-center relative border border-slate-800 overflow-hidden">
                      <div className="absolute inset-0 bg-slate-900/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center backdrop-blur-[2px]">
                        <button
                          onClick={() => handleOpenPlay(clip)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition duration-300"
                        >
                          <Play className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                      <Video className="w-6 h-6 opacity-60" />
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
                      Shared: {new Date(clip.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="mt-5">
                    <button
                      onClick={() => handleOpenPlay(clip)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-705 text-white rounded-xl text-xs font-semibold tracking-wide transition shadow inline-flex items-center justify-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Play Clip
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
    </div>
  );
}
