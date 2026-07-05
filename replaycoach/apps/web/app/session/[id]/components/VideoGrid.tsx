'use client';

import { useTracks, VideoTrack, AudioTrack, TrackReference } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useState, useEffect, useRef } from 'react';
import { SkeletonOverlay } from './SkeletonOverlay';
import { apiClient } from '../../../../lib/api-client';
import { useReplayStore } from '../../../../stores/replay-store';

interface VideoGridProps {
  sessionId: string;
  startedAt: string | null;
  layout: 'gallery' | 'spotlight';
  pinnedTrackSid: string | null;
  onPinTrack: (trackSid: string | null) => void;
  isCoach: boolean;
}

export function VideoGrid({
  sessionId,
  startedAt,
  layout,
  pinnedTrackSid,
  onPinTrack,
  isCoach,
}: VideoGridProps) {
  // Get all camera and screen share video tracks
  const trackRefs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  // Play audio tracks invisibly for all microphones
  const audioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }])
    .filter((ref) => ref.publication !== undefined) as TrackReference[];

  // Resolve manually pinned track either by its track SID or participant SID
  const pinnedTrack = trackRefs.find(
    (t) => t.publication?.trackSid === pinnedTrackSid || t.participant.sid === pinnedTrackSid
  );

  // Find screen share track to auto-focus
  const screenShareTrack = trackRefs.find((t) => t.source === Track.Source.ScreenShare);

  // Focus track priority: ScreenShare takes precedent over pinned coach tracks
  const activeFocusTrack = screenShareTrack || pinnedTrack;

  // Group other tracks differently when spotlit
  const otherTracks = activeFocusTrack
    ? trackRefs.filter(
        (t) => (t.publication?.trackSid ?? t.participant.sid) !== (activeFocusTrack.publication?.trackSid ?? activeFocusTrack.participant.sid)
      )
    : trackRefs;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 p-4 overflow-hidden relative">
      {/* Invisible Audio Elements */}
      {audioTracks.map((trackRef) => (
        <AudioTrack
          key={trackRef.publication?.trackSid ?? trackRef.participant.sid}
          trackRef={trackRef}
        />
      ))}

      {activeFocusTrack ? (
        <div className="flex-1 flex flex-col md:flex-row gap-4 h-full min-h-0">
          {/* Spotlight Active Panel */}
          <div className="flex-[3] relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center group h-full">
            <ParticipantVideoTile
              sessionId={sessionId}
              startedAt={startedAt}
              trackRef={activeFocusTrack as TrackReference}
              isCoach={isCoach}
              onPinTrack={onPinTrack}
              isPinned={activeFocusTrack === pinnedTrack}
            />
          </div>

          {/* Sidebar Panel for other streams */}
          <div className="flex-1 flex flex-row md:flex-col gap-3 overflow-x-auto md:overflow-y-auto min-w-0 md:min-w-[240px] max-h-[160px] md:max-h-full">
            {otherTracks.map((ref) => {
              const trackSid = ref.publication?.trackSid ?? ref.participant.sid;
              return (
                <div
                  key={trackSid}
                  className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex-shrink-0 w-[180px] md:w-full group"
                >
                  <ParticipantVideoTile
                    sessionId={sessionId}
                    startedAt={startedAt}
                    trackRef={ref as TrackReference}
                    isCoach={isCoach}
                    onPinTrack={onPinTrack}
                    isPinned={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Standard Gallery Grid Layout */
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 h-full min-h-0 overflow-y-auto">
          {trackRefs.map((ref) => {
            const trackSid = ref.publication?.trackSid ?? ref.participant.sid;
            return (
              <div
                key={trackSid}
                className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-center group"
              >
                <ParticipantVideoTile
                  sessionId={sessionId}
                  startedAt={startedAt}
                  trackRef={ref as TrackReference}
                  isCoach={isCoach}
                  onPinTrack={onPinTrack}
                  isPinned={false}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ParticipantVideoTileProps {
  sessionId: string;
  startedAt: string | null;
  trackRef: TrackReference;
  isCoach: boolean;
  onPinTrack: (trackSid: string | null) => void;
  isPinned: boolean;
}

export function ParticipantVideoTile({
  sessionId,
  startedAt,
  trackRef,
  isCoach,
  onPinTrack,
  isPinned,
}: ParticipantVideoTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 640, height: 360 });
  const [isReplaying, setIsReplaying] = useState(false);
  const setReplayMode = useReplayStore((s) => s.setMode);
  const setReplayManifest = useReplayStore((s) => s.setManifestUrl);
  const setReplayTimestamp = useReplayStore((s) => s.setTimestamp);

  const trackSid = trackRef.publication?.trackSid ?? trackRef.participant.sid;
  const participantId = trackRef.participant.identity;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  const handleReplayLast30s = async () => {
    if (!isCoach || isReplaying) return;
    setIsReplaying(true);
    try {
      await apiClient.post(
        `/sessions/${sessionId}/replay/seek`,
        {
          participantId,
          fromOffsetMs: -30000,
          toOffsetMs: 0,
        }
      );
    } catch (err) {
      console.error('Failed to seek replay:', err);
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      {/* Video stream rendering */}
      <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />

      {/* Real-time skeleton overlay layer */}
      <SkeletonOverlay
        sessionId={sessionId}
        participantId={participantId}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* Display user label */}
      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800 text-white text-xs font-medium flex items-center gap-1.5 z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
        {trackRef.participant.name || trackRef.participant.identity}
        {trackRef.participant.isLocal && ' (You)'}
      </div>

      {/* Hover overlay shortcuts: Coach only (don't overlay on oneself to prevent loops) */}
      {isCoach && !trackRef.participant.isLocal && (
        <div className="absolute top-3 right-3 hidden group-hover:flex items-center gap-2 z-10">
          <button
            type="button"
            onClick={handleReplayLast30s}
            disabled={isReplaying}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md transition shadow"
          >
            {isReplaying ? 'Fetching...' : 'Replay Last 30s'}
          </button>
          
          <button
            type="button"
            onClick={() => onPinTrack(isPinned ? null : trackSid)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md transition shadow"
          >
            {isPinned ? 'Unpin' : 'Spotlight Pin'}
          </button>
        </div>
      )}
    </div>
  );
}

