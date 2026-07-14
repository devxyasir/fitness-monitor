'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { ClipPlaybackModal } from '../../components/ClipPlaybackModal';
import { MeetingGroups } from '../../components/MeetingGroups';
import type { ClipItem } from '../../components/clipsShared';
import { RefreshCw, Clapperboard } from 'lucide-react';
import { toast } from '../../../../stores/toast-store';
import { Button } from '../../../components/ui/Button';
import { StateBlock, SkeletonCards, ErrorBlock } from '../../../components/ui/StateBlocks';

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
      toast.error('Failed to load clip stream.');
      setPlayingClip(null);
    } finally {
      setLoadingPlay(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-display-m">Shared clips</h2>
          <p className="text-xs text-ink-muted mt-1">Clips your coach has shared with you.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchClips}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {error && <ErrorBlock message={error} onRetry={fetchClips} />}

      {loading ? (
        <SkeletonCards count={4} />
      ) : clips.length === 0 ? (
        <StateBlock
          icon={<Clapperboard className="w-full h-full" />}
          title="No clips yet"
          body="Your coach will share replays here after a session."
        />
      ) : (
        <MeetingGroups clips={clips} onPlay={handleOpenPlay} onShare={undefined} />
      )}

      {playingClip && playData && (
        <ClipPlaybackModal clip={playingClip} playUrl={playData.playUrl} annotations={playData.annotations} onClose={() => { setPlayingClip(null); setPlayData(null); }} />
      )}

      {playingClip && loadingPlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/70 backdrop-blur-sm">
          <div className="bg-panel p-6 rounded-md border border-hairline flex flex-col items-center gap-3">
            <div className="w-7 h-7 rounded-full border-4 border-brand/25 border-t-brand animate-spin" />
            <p className="text-xs text-ink-muted">Fetching signed URL...</p>
          </div>
        </div>
      )}
    </div>
  );
}
