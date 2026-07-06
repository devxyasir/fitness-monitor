'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '../../../../lib/api-client';
import { Clapperboard, Loader2, CircleAlert, Play, ChevronDown, ChevronUp } from 'lucide-react';

interface ReferenceVideoSummary {
  id: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  createdAt?: string;
}

interface ReferenceVideoQueueProps {
  sessionId: string;
  /** Bumped by the parent after a new upload so the list refetches. */
  refreshToken: number;
}

/**
 * Bottom-right floating panel listing every video the coach has uploaded/
 * analyzed in this session, oldest first ("Video 1", "Video 2", ...) so the
 * coach can open them back up one at a time — present() re-broadcasts
 * reference:open for that specific video, which reopens the same modal/
 * draw-tools flow the initial upload used.
 */
export function ReferenceVideoQueue({ sessionId, refreshToken }: ReferenceVideoQueueProps) {
  const [videos, setVideos] = useState<ReferenceVideoSummary[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [presentingId, setPresentingId] = useState<string | null>(null);

  const fetchList = () => {
    apiClient
      .get<ReferenceVideoSummary[]>(`/sessions/${sessionId}/reference`)
      .then((list) => setVideos([...list].reverse())) // API returns newest-first; queue reads oldest-first
      .catch((err) => console.error('Failed to load reference video queue:', err));
  };

  useEffect(() => {
    fetchList();
    // Processing videos can flip to ready/failed in the background — poll
    // gently so the status badge stays current without the coach refreshing.
    const interval = setInterval(fetchList, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, refreshToken]);

  const handlePresent = async (refId: string) => {
    if (presentingId) return;
    setPresentingId(refId);
    try {
      await apiClient.post(`/sessions/${sessionId}/reference/${refId}/present`, {});
    } catch (err) {
      console.error('Failed to present reference video:', err);
    } finally {
      setPresentingId(null);
    }
  };

  if (videos.length === 0) return null;

  return (
    <div className="fixed bottom-28 right-3 sm:right-6 z-40 w-72 max-w-[calc(100vw-1.5rem)] bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-200 uppercase tracking-wider hover:bg-slate-800/60 transition"
      >
        <span className="flex items-center gap-2">
          <Clapperboard className="w-3.5 h-3.5" /> Uploaded Videos ({videos.length})
        </span>
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {!collapsed && (
        <div className="max-h-64 overflow-y-auto border-t border-slate-800 flex flex-col divide-y divide-slate-800">
          {videos.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handlePresent(v.id)}
              disabled={presentingId === v.id || v.status === 'failed'}
              className="flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-800/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                {presentingId === v.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : v.status === 'failed' ? (
                  <CircleAlert className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-indigo-400 fill-current" />
                )}
                Video {i + 1}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  v.status === 'ready'
                    ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800'
                    : v.status === 'failed'
                      ? 'bg-red-950/50 text-red-400 border border-red-800'
                      : 'bg-amber-950/50 text-amber-400 border border-amber-800 animate-pulse'
                }`}
              >
                {v.status === 'processing' ? 'Analyzing' : v.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
