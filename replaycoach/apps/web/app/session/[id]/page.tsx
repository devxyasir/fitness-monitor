'use client';

import { useState, useEffect, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useLocalParticipant, useTracks, TrackReference } from '@livekit/components-react';
import { DisconnectReason, Track } from 'livekit-client';
import { useLiveKitRoom } from './hooks/useLiveKitRoom';
import { VideoGrid, ParticipantVideoTile } from './components/VideoGrid';
import { useAuthStore } from '../../../stores/auth-store';
import { useReplayStore } from '../../../stores/replay-store';
import { usePoseOverlay } from './hooks/usePoseOverlay';
import { ReplayPanel } from './components/ReplayPanel';
import { apiClient } from '../../../lib/api-client';
import { socket, connectSocket } from '../../../lib/socket-client';
import { authClient } from '../../../lib/auth-client';
import Link from 'next/link';
import { useReplaySocket } from './hooks/useReplaySocket';
import { ReplayTargetPicker } from './components/ReplayTargetPicker';
import { RecordingStatusIndicator } from './components/RecordingStatusIndicator';
import { TrackBufferManager } from './components/TrackBufferManager';
import { Roster } from './components/Roster';
import { ReferenceAnalysisModal } from './components/ReferenceAnalysisModal';
import { AnnotationTrackingModal } from './components/AnnotationTrackingModal';
import { useReferenceSocketListeners } from './hooks/useReferenceSocket';
import { useAnnotationTrackingSocket } from './hooks/useAnnotationTrackingSocket';
import { useSessionRoom } from './hooks/useSessionRoom';
import { ReferenceVideoQueue } from './components/ReferenceVideoQueue';
import { ConnectionStatusBanner, LocalConnectionQualityIndicator } from './components/ConnectionStatusBanner';
import { SocketStatusBanner } from './components/SocketStatusBanner';
import { useReferenceStore } from '../../../stores/reference-store';
import { useAnnotationTrackingStore } from '../../../stores/annotation-tracking-store';
import {
  AlertTriangle,
  Flag,
  Circle,
  Pencil,
  Check,
  X,
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  Upload,
  Loader2,
  Maximize,
  Minimize,
  Link as LinkIcon,
} from 'lucide-react';

export default function SessionRoomPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const { user } = useAuthStore();
  const { token, url, isLoading, error } = useLiveKitRoom(sessionId);
  const [pinnedTrackSid, setPinnedTrackSid] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [session, setSession] = useState<{ startedAt: string | null; inviteCode: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);
  const [lobbyRequests, setLobbyRequests] = useState<{ userId: string; user: { email: string } }[]>([]);
  const [showExitModal, setShowExitModal] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [uploadRefreshToken, setUploadRefreshToken] = useState(0);

  const isCoach = user?.role === 'coach';

  // Real-time hooks registration
  useSessionRoom(sessionId);
  usePoseOverlay(sessionId);
  useReplaySocket(sessionId);
  useReferenceSocketListeners(sessionId);
  useAnnotationTrackingSocket(sessionId);
  const isReferenceModalOpen = useReferenceStore((s) => s.isOpen);
  const isAnnotationModalOpen = useAnnotationTrackingStore((s) => s.isOpen);

  // If the socket is dropped for an auth reason, refresh the token and reconnect
  // rather than leaving the session stuck on a dead connection.
  useEffect(() => {
    const onConnectError = async (err: Error) => {
      if (/unauthor/i.test(err.message)) {
        try {
          await authClient.refresh();
          connectSocket(useAuthStore.getState().accessToken);
        } catch {
          // refresh failed → AuthInitializer will route to /login
        }
      }
    };
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const { mode, reset: resetReplay } = useReplayStore();

  // Fetch session metadata to get startedAt timestamp + inviteCode
  useEffect(() => {
    apiClient.get<{ startedAt: string | null; inviteCode: string }>(`/sessions/${sessionId}`)
      .then(setSession)
      .catch((err) => console.error('Failed to retrieve session startedAt time:', err));
  }, [sessionId]);

  // Meeting timer — session.startedAt was already fetched but never
  // rendered anywhere; ticks once a second while a startedAt exists.
  useEffect(() => {
    if (!session?.startedAt) { setElapsedLabel(null); return; }
    const startedAtMs = new Date(session.startedAt).getTime();
    const tick = () => {
      const totalSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      setElapsedLabel(h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt]);

  const handleCopyMeetingLink = async () => {
    if (!session?.inviteCode) return;
    const link = `${window.location.origin}/session/join/${session.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy meeting link:', err);
    }
  };

  // Load initial pending lobby participants
  useEffect(() => {
    if (!isCoach) return;
    apiClient.get<any[]>(`/sessions/${sessionId}/lobby/pending`)
      .then((data) => {
        setLobbyRequests(data);
      })
      .catch((err) => console.error('Failed to load pending lobby requests:', err));
  }, [isCoach, sessionId]);

  // Listen to incoming real-time lobby join requests
  useEffect(() => {
    if (!isCoach) return;

    const handleLobbyRequest = (request: any) => {
      setLobbyRequests((prev) => {
        if (prev.some((r) => r.userId === request.userId)) return prev;
        return [...prev, request];
      });
    };

    socket.on('lobby_request', handleLobbyRequest);

    return () => {
      socket.off('lobby_request', handleLobbyRequest);
    };
  }, [isCoach]);

  // Synced coach pinning layout socket listener
  useEffect(() => {
    const handleCoachPin = (payload: { trackSid: string | null }) => {
      setPinnedTrackSid(payload.trackSid);
    };

    socket.on('session:pin-track', handleCoachPin);
    return () => {
      socket.off('session:pin-track', handleCoachPin);
    };
  }, []);

  // Listen to session termination events (fast path — the guaranteed teardown is
  // LiveKit's deleteRoom on the server, which the onDisconnected handler below
  // catches even if this socket event never arrives).
  useEffect(() => {
    const handleSessionTerminated = () => {
      setSessionEnded(true);
    };

    socket.on('session:terminated', handleSessionTerminated);
    return () => {
      socket.off('session:terminated', handleSessionTerminated);
    };
  }, []);

  const handleApproveLobby = async (userId: string) => {
    try {
      await apiClient.post(`/sessions/${sessionId}/lobby/approve`, { userId });
      setLobbyRequests((prev) => prev.filter((r) => r.userId !== userId));
    } catch (err) {
      console.error('Failed to approve lobby request:', err);
    }
  };

  const handleRejectLobby = async (userId: string) => {
    try {
      await apiClient.post(`/sessions/${sessionId}/lobby/reject`, { userId });
      setLobbyRequests((prev) => prev.filter((r) => r.userId !== userId));
    } catch (err) {
      console.error('Failed to reject lobby request:', err);
    }
  };

  const handlePinTrack = (trackSid: string | null) => {
    if (isCoach) {
      socket.emit('session:pin-track', { sessionId, trackSid });
    } else {
      setPinnedTrackSid(trackSid);
    }
  };

  const handleReturnToLive = async () => {
    try {
      if (isCoach) {
        // Stop current HLS broadcast and return students to live view
        await apiClient.post<{ studentIds: string[] }, { success: boolean }>(
          `/sessions/${sessionId}/replay/end`,
          { studentIds: selectedStudentIds }
        );
      }
    } catch (err) {
      console.error('Failed to end replay targets:', err);
    }
    // Clean up local layout view back to live feed
    resetReplay();
  };

  const handleSyncToStudents = async (timestampMs: number) => {
    if (!isCoach || selectedStudentIds.length === 0) return;
    try {
      // Sync replay timestamp and HLS playlist target
      await apiClient.post<
        { studentIds: string[]; timestampMs: number },
        { success: boolean }
      >(`/sessions/${sessionId}/replay/target`, {
        studentIds: selectedStudentIds,
        timestampMs,
      });
    } catch (err) {
      console.error('Failed to target students for replay sync:', err);
    }
  };

  // Best-effort — the LiveKit participant_left webhook is the authoritative
  // signal (see FIX_09); this just makes the roster/leftAt update feel instant
  // instead of waiting on the webhook round-trip.
  const leaveAndExit = async () => {
    try {
      await apiClient.post(`/sessions/${sessionId}/leave`, {});
    } catch {
      // ignore — webhook backstop will still record the leave
    }
    window.location.href = '/dashboard';
  };

  // Tab close / navigation away: navigator.sendBeacon can't carry an
  // Authorization header, so use a keepalive fetch instead. Still just an
  // optimization — the webhook remains the source of truth.
  useEffect(() => {
    const onHide = () => {
      const token = useAuthStore.getState().accessToken;
      if (!token) return;
      const base = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';
      fetch(`${base}/api/v1/sessions/${sessionId}/leave`, {
        method: 'POST',
        keepalive: true,
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [sessionId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand/25 border-t-brand rounded-full animate-spin"></div>
          <p className="text-lg font-medium animate-pulse text-ink-muted">Entering session room...</p>
        </div>
      </div>
    );
  }

  if (error || !token || !url) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink p-6">
        <div className="max-w-md w-full bg-panel border border-hairline p-8 rounded-lg shadow-xl text-center">
          <div className="w-16 h-16 bg-danger/10 border border-danger/30 rounded-full flex items-center justify-center mx-auto mb-6 text-danger">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-display font-semibold text-ink mb-2">Connection Failed</h2>
          <p className="text-ink-muted mb-6 text-sm">
            {error || 'Unable to retrieve LiveKit connection details.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-2.5 rounded-full bg-panel-2 hover:bg-panel-2/70 border border-hairline text-ink font-semibold transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas text-ink p-6">
        <div className="max-w-md w-full bg-panel border border-hairline p-8 rounded-lg shadow-xl text-center">
          <div className="w-16 h-16 bg-panel-2 border border-hairline rounded-full flex items-center justify-center mx-auto mb-6 text-ink-muted">
            <Flag className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-display font-semibold text-ink mb-2">This session has ended</h2>
          <p className="text-ink-muted mb-6 text-sm">
            The coach has ended this coaching session for everyone.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-2.5 rounded-full bg-panel-2 hover:bg-panel-2/70 border border-hairline text-ink font-semibold transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen bg-canvas text-ink overflow-hidden font-sans">
      {/* Session Title Header */}
      <header className="flex items-center justify-between flex-wrap gap-2 px-3 sm:px-6 py-3 bg-panel/60 backdrop-blur-glass border-b border-hairline z-10">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${mode === 'playing' ? 'bg-replay animate-pulse' : 'bg-success animate-pulse'}`} />
          <h1 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-2 flex-wrap">
            <span>Session: {sessionId.substring(0, 8)}</span>
            {elapsedLabel && (
              <span className="text-[10px] font-mono font-semibold text-ink-faint bg-panel-2 border border-hairline px-2 py-0.5 rounded tabular-nums">
                {elapsedLabel}
              </span>
            )}
            {isCoach && <RecordingStatusIndicator />}
            {mode === 'playing' && (
              <span className="text-[10px] font-mono font-semibold text-replay border border-replay/30 bg-replay/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                ◍ DVR replay active
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          {isCoach && session?.inviteCode && (
            <button
              onClick={handleCopyMeetingLink}
              className="bg-panel-2 hover:bg-panel-2/70 border border-hairline text-ink text-xs px-3 py-1.5 rounded-full font-semibold tracking-wide transition-colors inline-flex items-center gap-1.5"
              title="Copy meeting link"
            >
              {linkCopied ? (
                <><Check className="w-3.5 h-3.5 text-success" /> Copied</>
              ) : (
                <><LinkIcon className="w-3.5 h-3.5" /> Copy Link</>
              )}
            </button>
          )}
          <span className="bg-session/10 border border-session/30 text-session text-xs px-3 py-1.5 rounded-full font-mono font-medium tracking-wide inline-flex items-center gap-1.5">
            {isCoach ? (
              <>
                <Circle className="w-2 h-2 fill-success text-success" /> COACH
              </>
            ) : (
              <>
                <Pencil className="w-3 h-3" /> STUDENT
              </>
            )}
          </span>
          <button
            onClick={() => {
              if (isCoach) {
                setShowExitModal(true);
              } else {
                leaveAndExit();
              }
            }}
            className="px-4 py-1.5 rounded-full bg-danger/10 border border-danger/35 hover:bg-danger/20 text-danger text-xs font-semibold tracking-wide transition-colors"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* LiveKit Video/Audio Session Room Wrapper */}
      <LiveKitRoom
        token={token ?? undefined}
        serverUrl={url ?? undefined}
        connect={true}
        audio={true}
        video={true}
        options={{
          // adaptiveStream: LiveKit only asks the server for the video
          // resolution each subscribed track is actually rendered at
          // (a small sidebar tile doesn't need a full 1080p stream).
          // dynacast: server-side simulcast layer pausing for tracks
          // nobody currently has visible, both purely bandwidth/CPU
          // savings — no change to how the room/tracks are used.
          adaptiveStream: true,
          dynacast: true,
        }}
        className="flex-1 flex flex-col min-h-0 relative"
        onDisconnected={(reason) => {
          // Only the reasons that mean "the meeting is actually over" should show
          // the ended screen. Other reasons (client-initiated, transient
          // join/state issues, etc.) are normal connect/reconnect churn and must
          // not be treated as the coach ending the session.
          if (
            reason === DisconnectReason.ROOM_DELETED ||
            reason === DisconnectReason.PARTICIPANT_REMOVED
          ) {
            setSessionEnded(true);
          }
        }}
      >
        {mode === 'playing' ? (
          /* ACTIVE REPLAY LAYOUT VIEWFLOW */
          isCoach ? (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              {/* Main Replay screen panel */}
              <div className="flex-[3] flex flex-col min-h-0 relative bg-canvas">
                <ReplayPanel
                  sessionId={sessionId}
                  isCoach={true}
                  selectedStudentIds={selectedStudentIds}
                  onReturnToLive={handleReturnToLive}
                  onSyncToStudents={handleSyncToStudents}
                />
              </div>

              {/* Coach Replay controls sidebar */}
              <div className="flex-1 lg:max-w-xs border-t lg:border-t-0 lg:border-l border-hairline bg-panel/60 backdrop-blur-glass p-4 flex flex-col gap-4 overflow-y-auto min-h-0">
                <ReplayTargetPicker
                  selectedStudentIds={selectedStudentIds}
                  onChange={setSelectedStudentIds}
                />

                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  <h4 className="text-[10px] font-mono font-semibold text-ink-faint uppercase tracking-widest px-1">
                    Live Student Feeds
                  </h4>
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <LiveMiniGrid
                      sessionId={sessionId}
                      startedAt={session?.startedAt ?? null}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Student view is focused only on replay output */
            <div className="flex-1 flex flex-col min-h-0 relative">
              <ReplayPanel
                sessionId={sessionId}
                isCoach={false}
                onReturnToLive={handleReturnToLive}
              />
            </div>
          )
        ) : (
          /* STANDARD LIVE VIDEO TILES VIEWPORT */
          <>
            <VideoGrid
              sessionId={sessionId}
              startedAt={session?.startedAt ?? null}
              pinnedTrackSid={pinnedTrackSid}
              onPinTrack={handlePinTrack}
              isCoach={isCoach}
            />

            {/* Control Toolbar */}
            <div className="bg-panel/60 backdrop-blur-glass border-t border-hairline px-3 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-3 z-10">
              <ControlsArea
                isCoach={isCoach}
                sessionId={sessionId}
                onUploaded={() => setUploadRefreshToken((n) => n + 1)}
              />
            </div>
          </>
        )}

        <RoomAudioRenderer />
        <TrackBufferManager />
        <Roster sessionId={sessionId} isCoach={isCoach} />
        <ConnectionStatusBanner />
        <SocketStatusBanner />
        {isReferenceModalOpen && (
          <ReferenceAnalysisModal sessionId={sessionId} isCoach={isCoach} />
        )}
        {isAnnotationModalOpen && (
          <AnnotationTrackingModal sessionId={sessionId} isCoach={isCoach} />
        )}
        {isCoach && <ReferenceVideoQueue sessionId={sessionId} refreshToken={uploadRefreshToken} />}
      </LiveKitRoom>

      {isCoach && lobbyRequests.length > 0 && (
        <div className="absolute right-3 sm:right-6 top-20 z-50 w-80 max-w-[calc(100vw-1.5rem)] bg-panel/90 border border-hairline rounded-lg shadow-2xl p-4 backdrop-blur-glass max-h-[400px] flex flex-col gap-3 animate-rise">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-semibold text-ink uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-replay animate-pulse" />
              Lobby: Join Requests ({lobbyRequests.length})
            </h3>
          </div>
          <div className="h-px bg-hairline" />
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 max-h-[300px] pr-1">
            {lobbyRequests.map((req) => (
              <div key={req.userId} className="bg-panel-2 border border-hairline p-2.5 rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink truncate">
                    {req.user?.email || req.userId.substring(0, 8)}
                  </p>
                  <p className="text-[10px] text-ink-faint font-semibold uppercase tracking-wider">
                    Student
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleApproveLobby(req.userId)}
                    className="w-7 h-7 bg-success/10 border border-success/30 hover:bg-success/20 text-success rounded-full flex items-center justify-center text-xs transition-colors font-bold"
                    title="Approve student"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRejectLobby(req.userId)}
                    className="w-7 h-7 bg-danger/10 border border-danger/30 hover:bg-danger/20 text-danger rounded-full flex items-center justify-center text-xs transition-colors font-bold"
                    title="Decline student"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showExitModal && (
        <div role="dialog" aria-modal="true" aria-label="Exit options" className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-md">
          <div className="bg-panel border border-hairline p-6 rounded-lg max-w-sm w-full shadow-2xl flex flex-col gap-4 animate-settle">
            <div>
              <h3 className="text-sm font-display font-semibold text-ink uppercase tracking-wider">
                Exit Options
              </h3>
              <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
                Would you like to leave the session or end this meeting permanently for everyone?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  try {
                    await apiClient.patch(`/sessions/${sessionId}/status`, { status: 'ended' });
                    window.location.href = '/dashboard';
                  } catch (err) {
                    console.error('Failed to end meeting:', err);
                  }
                }}
                className="w-full py-2.5 bg-danger/10 border border-danger/35 hover:bg-danger/20 text-danger text-xs font-semibold rounded-full transition-colors"
              >
                End Meeting for Everyone
              </button>
              <button
                onClick={leaveAndExit}
                className="w-full py-2.5 bg-panel-2 hover:bg-panel-2/70 border border-hairline text-ink text-xs font-semibold rounded-full transition-colors"
              >
                Just Leave Meeting
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full py-2.5 bg-transparent text-ink-faint hover:text-ink-muted text-xs font-semibold rounded-full transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LiveMiniGrid({
  sessionId,
  startedAt,
}: {
  sessionId: string;
  startedAt: string | null;
}) {
  const trackRefs = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );

  // filter out local participant (the coach) so we only show the live student cameras
  const studentTracks = trackRefs.filter((ref) => !ref.participant.isLocal);

  if (studentTracks.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed border-hairline rounded-lg text-ink-faint text-xs italic">
        No students connected.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 font-sans">
      {studentTracks.map((ref) => {
        const trackSid = ref.publication?.trackSid ?? ref.participant.sid;
        return (
          <div
            key={trackSid}
            className="relative aspect-video rounded-lg bg-panel-2 border border-hairline overflow-hidden flex items-center justify-center group"
          >
            <ParticipantVideoTile
              sessionId={sessionId}
              startedAt={startedAt}
              trackRef={ref as TrackReference}
              isCoach={false}
              onPinTrack={() => {}}
              isPinned={false}
            />
          </div>
        );
      })}
    </div>
  );
}

// Inner controls component to resolve LocalParticipant state correctly
function ControlsArea({
  isCoach,
  sessionId,
  onUploaded,
}: {
  isCoach: boolean;
  sessionId: string;
  onUploaded: () => void;
}) {
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, localParticipant } =
    useLocalParticipant();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadModeRef = useRef<'annotation_tracking' | 'full_body'>('annotation_tracking');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number;
    total: number;
    speedBps: number;
  } | null>(null);
  const uploadStartRef = useRef<number>(0);

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const toggleScreen = async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  };

  // Fullscreens the whole page rather than a single container — simplest
  // reliable behavior across the live grid and replay layouts alike, and
  // matches what most participants expect from a meeting app's fullscreen
  // button (browser chrome hidden, everything else stays as laid out).
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const handleVideoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || uploadingVideo) return;

    setUploadingVideo(true);
    setUploadError(null);
    uploadStartRef.current = Date.now();
    setUploadProgress({ loaded: 0, total: file.size, speedBps: 0 });
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', uploadModeRef.current);

      const uploaded = await apiClient.postFormWithProgress<{ id: string }>(
        `/sessions/${sessionId}/reference/upload`,
        formData,
        (loaded, total) => {
          const elapsedSec = (Date.now() - uploadStartRef.current) / 1000;
          const speedBps = elapsedSec > 0 ? loaded / elapsedSec : 0;
          setUploadProgress({ loaded, total, speedBps });
        },
      );

      // Broadcasts reference:open to the whole room (including this client) —
      // same pipeline as the per-participant "Analyze Last 10s" flow, just
      // sourced from a coach-picked file instead of the live camera buffer.
      await apiClient.post(`/sessions/${sessionId}/reference/${uploaded.id}/present`, {});
      onUploaded();
    } catch (err) {
      console.error('Failed to upload external video for analysis:', err);
      setUploadError('Upload failed. Please try a different file.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setUploadingVideo(false);
      setUploadProgress(null);
    }
  };

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggleMic}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors border ${
            isMicrophoneEnabled
              ? 'bg-panel-2 border-hairline hover:bg-panel-2/60 text-ink'
              : 'bg-danger/10 border-danger/30 text-danger hover:bg-danger/20'
          }`}
          title={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicrophoneEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={toggleCam}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-colors border ${
            isCameraEnabled
              ? 'bg-panel-2 border-hairline hover:bg-panel-2/60 text-ink'
              : 'bg-danger/10 border-danger/30 text-danger hover:bg-danger/20'
          }`}
          title={isCameraEnabled ? 'Disable Camera' : 'Enable Camera'}
        >
          {isCameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex items-center justify-center w-11 h-11 rounded-full transition-colors border bg-panel-2 border-hairline hover:bg-panel-2/60 text-ink"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>

        <span className="flex items-center justify-center w-8 h-11">
          <LocalConnectionQualityIndicator />
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Toggle Screen Share: Coach Only */}
        {isCoach && (
          <button
            type="button"
            onClick={toggleScreen}
            className={`flex items-center px-4 py-2 text-xs font-semibold rounded-full transition-colors border ${
              isScreenShareEnabled
                ? 'bg-session text-white dark:text-canvas border-transparent'
                : 'bg-panel-2 border-hairline hover:bg-panel-2/60 text-ink-muted'
            }`}
          >
            <ScreenShare className="w-3.5 h-3.5 mr-1.5" /> {isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}
          </button>
        )}

        {/* Upload an external video for pose analysis: Coach Only. Runs
            through the same pose-detection + draw-tools pipeline as the
            per-participant "Analyze Last 10s" buffer flow. */}
        {isCoach && (
          <div className="relative">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleVideoFileSelected}
            />
            {uploadingVideo ? (
              <button
                type="button"
                disabled
                className="flex items-center px-4 py-2 text-xs font-semibold rounded-full bg-panel-2 border border-hairline text-ink-muted opacity-70 cursor-not-allowed"
              >
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Uploading...
                {uploadProgress && uploadProgress.total > 0 && (
                  <span className="ml-1.5 tabular-nums">
                    {Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%
                  </span>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {/* New primary feature: joint-attached annotations that track the body. */}
                <button
                  type="button"
                  onClick={() => { uploadModeRef.current = 'annotation_tracking'; fileInputRef.current?.click(); }}
                  className="flex items-center px-4 py-2 text-xs font-semibold rounded-full bg-session/15 border border-session/40 hover:bg-session/25 text-session transition-colors"
                  title="Upload a video and draw coaching annotations between joints that follow the body"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Annotate Video
                </button>
                {/* Legacy full-video skeleton analysis, kept as an optional tool. */}
                <button
                  type="button"
                  onClick={() => { uploadModeRef.current = 'full_body'; fileInputRef.current?.click(); }}
                  className="flex items-center px-3 py-2 text-xs font-semibold rounded-full bg-panel-2 border border-hairline hover:bg-panel-2/60 text-ink-muted transition-colors"
                  title="Full Body Analysis — process the whole video and replay it with the skeleton drawn in"
                >
                  Full Body
                </button>
              </div>
            )}
            {uploadingVideo && uploadProgress && uploadProgress.total > 0 && (
              <div className="absolute bottom-full mb-2 left-0 z-20 w-56 max-w-[calc(100vw-2rem)] bg-panel/95 backdrop-blur-glass border border-hairline text-ink text-xs font-medium px-3 py-2 rounded-lg shadow-xl">
                <div className="flex justify-between mb-1">
                  <span>
                    {formatMB(uploadProgress.loaded)} / {formatMB(uploadProgress.total)} MB
                  </span>
                  <span>
                    {Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-panel-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-session transition-all"
                    style={{
                      width: `${Math.min(100, (uploadProgress.loaded / uploadProgress.total) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-ink-faint">
                  {formatMB(uploadProgress.speedBps)} MB/s
                </div>
              </div>
            )}
            {uploadError && (
              <div className="absolute bottom-full mb-2 left-0 z-20 whitespace-nowrap bg-danger/10 backdrop-blur-glass border border-danger/30 text-danger text-xs font-medium px-3 py-2 rounded-lg shadow-xl">
                {uploadError}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
