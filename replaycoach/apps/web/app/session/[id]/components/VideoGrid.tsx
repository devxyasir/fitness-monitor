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
  pinnedTrackSid: string | null;
  onPinTrack: (trackSid: string | null) => void;
  isCoach: boolean;
}

/** Pose-service subscriber bots never publish camera/mic — never show them as a tile. */
function isPoseWorkerIdentity(identity: string): boolean {
  return identity.startsWith('pose_worker_');
}

export function VideoGrid({
  sessionId,
  startedAt,
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
  ).filter((ref) => !isPoseWorkerIdentity(ref.participant.identity));

  // Play audio tracks invisibly for all microphones
  const audioTracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }])
    .filter((ref) => ref.publication !== undefined && !isPoseWorkerIdentity(ref.participant.identity)) as TrackReference[];

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
    <div className="flex-1 flex flex-col h-full bg-canvas p-4 overflow-hidden relative">
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
          <div className="flex-[3] relative rounded-lg overflow-hidden bg-panel-2 border border-hairline shadow-2xl flex items-center justify-center group h-full">
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
                  className="relative aspect-video rounded-lg overflow-hidden bg-panel-2 border border-hairline flex-shrink-0 w-[180px] md:w-full group"
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
                className="rc-tile relative aspect-video rounded-lg overflow-hidden bg-panel-2 border border-hairline shadow-lg flex items-center justify-center group transition-colors"
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
  const [isStartingInstantReplay, setIsStartingInstantReplay] = useState(false);
  const [insufficientFootage, setInsufficientFootage] = useState(false);
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

  // How much clip we ask for, and the minimum we'll accept before showing
  // "not enough footage yet" instead of sending a too-short/empty clip to
  // pose detection (e.g. clicking Analyze 10s into a fresh meeting).
  const ANALYZE_WINDOW_MS = 10_000;
  const MIN_REQUIRED_MS = 9_000;

  const showInsufficientFootage = () => {
    setInsufficientFootage(true);
    setTimeout(() => setInsufficientFootage(false), 3000);
  };

  const handleAnalyzeClip = async () => {
    if (!isCoach || isReplaying) return;

    const getBufferedDurationMs = useReplayStore.getState().getBufferedDurationMs;
    const bufferedMs = getBufferedDurationMs?.(participantId) ?? 0;
    if (bufferedMs < MIN_REQUIRED_MS) {
      showInsufficientFootage();
      return;
    }

    setIsReplaying(true);
    try {
      // Slice the last ~10s straight from the client-side rolling buffer
      // (TrackBufferManager) — no server round-trip to fetch source video.
      const getReplayBlob = useReplayStore.getState().getReplayBlob;
      const windowMs = Math.min(bufferedMs, ANALYZE_WINDOW_MS);
      const blob = getReplayBlob?.(participantId, -windowMs, 0);
      if (!blob) {
        showInsufficientFootage();
        return;
      }

      const file = new File([blob], `replay-${participantId}-${Date.now()}.webm`, {
        type: blob.type || 'video/webm',
      });
      const formData = new FormData();
      formData.append('file', file);

      const uploaded = await apiClient.postForm<{ id: string }>(
        `/sessions/${sessionId}/reference/upload`,
        formData,
      );

      // Broadcasts reference:open to the whole room (including this client).
      await apiClient.post(`/sessions/${sessionId}/reference/${uploaded.id}/present`, {});
    } catch (err) {
      console.error('Failed to analyze replay clip:', err);
    } finally {
      setIsReplaying(false);
    }
  };

  /**
   * Instant DVR replay: opens the live in-meeting replay popup (ReplayPanel)
   * straight from the client-side rolling buffer — no upload, no server-side
   * processing, no wait. This is the quick "let's look at that again right
   * now" telestrator tool; "Analyze Last 10s" (above) is the heavier,
   * permanent-clip-with-pose-tracking flow and stays separate.
   */
  const handleInstantReplay = async () => {
    if (!isCoach || isStartingInstantReplay) return;

    const getBufferedDurationMs = useReplayStore.getState().getBufferedDurationMs;
    const bufferedMs = getBufferedDurationMs?.(participantId) ?? 0;
    if (bufferedMs < MIN_REQUIRED_MS) {
      showInsufficientFootage();
      return;
    }

    setIsStartingInstantReplay(true);
    try {
      const windowMs = Math.min(bufferedMs, ANALYZE_WINDOW_MS);
      // Broadcasts session:replay:start to the whole room (this client
      // included) — every participant's ReplayPanel opens from this same
      // call, sliced from their own local copy of the buffer.
      await apiClient.post(`/sessions/${sessionId}/replay/seek`, {
        participantId,
        fromOffsetMs: -windowMs,
        toOffsetMs: 0,
      });
    } catch (err) {
      console.error('Failed to start instant replay:', err);
    } finally {
      setIsStartingInstantReplay(false);
    }
  };

  // Only the local camera should ever be un-mirror-forced — remote tracks
  // already arrive in true orientation, and screen-share must never be
  // flipped. `local-camera-unmirror` (globals.css) forces true orientation
  // with !important so it wins even if a runtime/library mirror is applied,
  // matching Zoom/Meet's "what others see" self-view. Keeping it true also
  // keeps the pose skeleton (drawn from true-orientation keypoints) aligned.
  const isLocalCamera = trackRef.participant.isLocal && trackRef.source === Track.Source.Camera;

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      {/* Video stream rendering */}
      <VideoTrack
        trackRef={trackRef}
        className={`w-full h-full object-cover${isLocalCamera ? ' local-camera-unmirror' : ''}`}
      />

      {/* Real-time skeleton overlay layer */}
      <SkeletonOverlay
        sessionId={sessionId}
        participantId={participantId}
        width={dimensions.width}
        height={dimensions.height}
      />

      {/* Display user label */}
      <div className="absolute bottom-3 left-3 bg-panel/70 backdrop-blur-glass px-2.5 py-1 rounded-full border border-hairline text-ink text-xs font-medium flex items-center gap-1.5 z-10">
        <span className="w-1.5 h-1.5 rounded-full bg-live"></span>
        {trackRef.participant.name || trackRef.participant.identity}
        {trackRef.participant.isLocal && ' (You)'}
      </div>

      {/* Coach-only shortcuts (don't overlay on oneself to prevent loops).
          Always visible rather than hover-only — hover doesn't exist on
          touch devices, which made these completely unreachable on mobile. */}
      {isCoach && !trackRef.participant.isLocal && (
        <div className="rc-tile-actions absolute top-3 right-3 flex items-center gap-1.5 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleInstantReplay}
            disabled={isStartingInstantReplay}
            className="bg-panel/80 backdrop-blur-glass hover:bg-panel-2 disabled:opacity-50 border border-hairline text-ink text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors"
            title="Instant replay — opens for everyone right now, meeting keeps running"
          >
            {isStartingInstantReplay ? 'Opening…' : '⟳ Replay'}
          </button>

          <button
            type="button"
            onClick={handleAnalyzeClip}
            disabled={isReplaying}
            className="bg-replay/15 hover:bg-replay/25 disabled:opacity-50 border border-replay/35 text-replay text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors"
            title="Save as a permanent, joint-tracked clip"
          >
            {isReplaying ? 'Analyzing…' : 'Analyze 10s'}
          </button>

          <button
            type="button"
            onClick={() => onPinTrack(isPinned ? null : trackSid)}
            className="bg-brand-indigo/15 hover:bg-brand-indigo/25 border border-brand-indigo/35 text-[#A5A9F5] text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors"
          >
            {isPinned ? 'Unpin' : 'Spotlight'}
          </button>
        </div>
      )}

      {/* Graceful message when the buffer doesn't have enough footage yet
          (e.g. Analyze clicked moments after the meeting started) — not
          gated by group-hover so it stays visible after the pointer moves. */}
      {insufficientFootage && (
        <div className="absolute top-3 right-3 z-20 max-w-[220px] bg-panel/95 backdrop-blur-glass border border-replay/30 text-replay text-xs font-medium px-3 py-2 rounded-lg shadow-xl animate-rise">
          Not enough recorded video yet — wait a few more seconds and try again.
        </div>
      )}
    </div>
  );
}

