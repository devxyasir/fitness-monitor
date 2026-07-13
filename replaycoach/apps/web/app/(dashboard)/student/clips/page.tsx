'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';
import { MeetingGroups } from '../../components/MeetingGroups';
import type { ClipItem } from '../../components/clipsShared';
import { RefreshCw, Clapperboard } from 'lucide-react';

export default function StudentClipsPage() {
  const [clips, setClips] = useState<ClipItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingClip, setPlayingClip] = useState<ClipItem | null>(null);
  const [playData, setPlayData] = useState<{ playUrl: string; annotations: any[] } | null>(null);
  const [loadingPlay, setLoadingPlay] = useState(false);

  useEffect(() => { fetchClips(); }, []);

  const fetchClips = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<ClipItem[]>('/clips');
      setClips(data);
      setError(null);
    } catch (err: any) {
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
      alert('Failed to load clip stream.');
      setPlayingClip(null);
    } finally {
      setLoadingPlay(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-xl">Shared Clips</h2>
          <p className="text-xs text-ink-muted mt-1">Clips your coach has shared with you.</p>
        </div>
        <button onClick={fetchClips} className="px-3.5 py-2 text-xs font-semibold text-ink bg-panel-2 border border-hairline rounded-full hover:bg-panel-2/80 transition-colors inline-flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 text-danger rounded-lg px-4 py-3 text-xs font-medium">{error}</div>
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
          <p className="text-sm text-ink-muted max-w-sm mx-auto">Your coach will share replays here after a session.</p>
        </div>
      ) : (
        <MeetingGroups clips={clips} onPlay={handleOpenPlay} onShare={undefined} />
      )}

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
    </div>
  );
}
