'use client';

import { useState, useEffect } from 'react';
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

export default function SessionRoomPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const { user } = useAuthStore();
  const { token, url, isLoading, error } = useLiveKitRoom(sessionId);
  const [layout, setLayout] = useState<'gallery' | 'spotlight'>('gallery');
  const [pinnedTrackSid, setPinnedTrackSid] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [session, setSession] = useState<{ startedAt: string | null } | null>(null);
  const [lobbyRequests, setLobbyRequests] = useState<{ userId: string; user: { email: string } }[]>([]);
  const [showExitModal, setShowExitModal] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);

  const isCoach = user?.role === 'coach';

  // Real-time hooks registration
  usePoseOverlay(sessionId);
  useReplaySocket(sessionId);

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

  // Fetch session metadata to get startedAt timestamp
  useEffect(() => {
    apiClient.get<{ startedAt: string | null }>(`/sessions/${sessionId}`)
      .then(setSession)
      .catch((err) => console.error('Failed to retrieve session startedAt time:', err));
  }, [sessionId]);

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
      if (payload.trackSid) {
        setLayout('spotlight');
      } else {
        setLayout('gallery');
      }
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
      if (trackSid) {
        setLayout('spotlight');
      } else {
        setLayout('gallery');
      }
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-indigo-400 rounded-full animate-spin"></div>
          <p className="text-lg font-medium animate-pulse">Entering session room...</p>
        </div>
      </div>
    );
  }

  if (error || !token || !url) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-red-950 border border-red-800 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500 text-3xl">
            ⚠️
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Connection Failed</h2>
          <p className="text-slate-400 mb-6 text-sm">
            {error || 'Unable to retrieve LiveKit connection details.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-2.5 rounded-xl bg-slate-805 hover:bg-slate-800 border border-slate-700 text-white font-medium transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl text-center">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400 text-3xl">
            🏁
          </div>
          <h2 className="text-xl font-bold text-white mb-2">This session has ended</h2>
          <p className="text-slate-400 mb-6 text-sm">
            The coach has ended this coaching session for everyone.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex justify-center items-center w-full px-5 py-2.5 rounded-xl bg-slate-805 hover:bg-slate-800 border border-slate-700 text-white font-medium transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Session Title Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-850 z-10 shadow-md">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${mode === 'playing' ? 'bg-amber-500 animate-pulse' : 'bg-red-550 animate-ping'}`} />
          <h1 className="text-sm font-semibold tracking-tight text-white flex items-center gap-2">
            <span>Session: {sessionId.substring(0, 8)}</span>
            {isCoach && <RecordingStatusIndicator />}
            {mode === 'playing' && (
              <span className="text-[10px] font-bold text-amber-500 border border-amber-950 bg-amber-950/20 px-2 py-0.5 rounded uppercase">
                DVR REPLAY ACTIVE
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2.5 py-1 rounded-md font-medium tracking-wide">
            {isCoach ? '🟢 COACH ROLE' : '✏️ STUDENT ROLE'}
          </span>
          <button
            onClick={() => {
              if (isCoach) {
                setShowExitModal(true);
              } else {
                leaveAndExit();
              }
            }}
            className="px-4 py-1.5 rounded-lg bg-red-650 hover:bg-red-700 text-white text-xs font-semibold tracking-wide transition shadow-sm"
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
              <div className="flex-[3] flex flex-col min-h-0 relative bg-slate-950">
                <ReplayPanel
                  sessionId={sessionId}
                  isCoach={true}
                  selectedStudentIds={selectedStudentIds}
                  onReturnToLive={handleReturnToLive}
                  onSyncToStudents={handleSyncToStudents}
                />
              </div>

              {/* Coach Replay controls sidebar */}
              <div className="flex-1 lg:max-w-xs border-t lg:border-t-0 lg:border-l border-slate-850 bg-slate-900/60 p-4 flex flex-col gap-4 overflow-y-auto min-h-0 shadow-lg">
                <ReplayTargetPicker
                  selectedStudentIds={selectedStudentIds}
                  onChange={setSelectedStudentIds}
                />

                <div className="flex-1 flex flex-col gap-3 min-h-0">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
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
              layout={layout}
              pinnedTrackSid={pinnedTrackSid}
              onPinTrack={handlePinTrack}
              isCoach={isCoach}
            />

            {/* Control Toolbar */}
            <div className="bg-slate-900 border-t border-slate-850 px-6 py-4 flex items-center justify-between z-10 shadow-inner">
              <ControlsArea isCoach={isCoach} layout={layout} setLayout={setLayout} />
            </div>
          </>
        )}

        <RoomAudioRenderer />
        <TrackBufferManager />
        <Roster />
      </LiveKitRoom>

      {isCoach && lobbyRequests.length > 0 && (
        <div className="absolute right-6 top-20 z-50 w-80 bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl p-4 backdrop-blur max-h-[400px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Lobby: Join Requests ({lobbyRequests.length})
            </h3>
          </div>
          <div className="h-px bg-slate-800" />
          <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 max-h-[300px] pr-1">
            {lobbyRequests.map((req) => (
              <div key={req.userId} className="bg-slate-950 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200 truncate">
                    {req.user?.email || req.userId.substring(0, 8)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                    Student
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleApproveLobby(req.userId)}
                    className="w-7 h-7 bg-emerald-950 border border-emerald-900/50 hover:bg-emerald-900 text-emerald-400 rounded-md flex items-center justify-center text-xs transition font-bold"
                    title="Approve student"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => handleRejectLobby(req.userId)}
                    className="w-7 h-7 bg-red-950 border border-red-900/50 hover:bg-red-900 text-red-400 rounded-md flex items-center justify-center text-xs transition font-bold"
                    title="Decline student"
                  >
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Exit Options
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
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
                className="w-full py-2 bg-red-650 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow transition"
              >
                End Meeting for Everyone
              </button>
              <button
                onClick={leaveAndExit}
                className="w-full py-2 bg-slate-850 hover:bg-slate-800 border border-slate-750 text-slate-200 text-xs font-semibold rounded-lg shadow transition"
              >
                Just Leave Meeting
              </button>
              <button
                onClick={() => setShowExitModal(false)}
                className="w-full py-2 bg-transparent text-slate-400 hover:text-slate-300 text-xs font-semibold rounded-lg transition"
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
      <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs italic">
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
            className="relative aspect-video rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center group"
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
  layout,
  setLayout,
}: {
  isCoach: boolean;
  layout: 'gallery' | 'spotlight';
  setLayout: (l: 'gallery' | 'spotlight') => void;
}) {
  const { isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, localParticipant } =
    useLocalParticipant();

  const toggleMic = async () => {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  };

  const toggleCam = async () => {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  };

  const toggleScreen = async () => {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleMic}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition border shadow-sm ${
            isMicrophoneEnabled
              ? 'bg-slate-800 border-slate-750 hover:bg-slate-700 text-white'
              : 'bg-red-950 border-red-900 text-red-500 hover:bg-red-900'
          }`}
          title={isMicrophoneEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicrophoneEnabled ? '🎙️' : '🔇'}
        </button>

        <button
          type="button"
          onClick={toggleCam}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition border shadow-sm ${
            isCameraEnabled
              ? 'bg-slate-800 border-slate-750 hover:bg-slate-700 text-white'
              : 'bg-red-950 border-red-900 text-red-500 hover:bg-red-900'
          }`}
          title={isCameraEnabled ? 'Disable Camera' : 'Enable Camera'}
        >
          {isCameraEnabled ? '📹' : '❌'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        {/* Toggle Screen Share: Coach Only */}
        {isCoach && (
          <button
            type="button"
            onClick={toggleScreen}
            className={`flex items-center px-4 py-2 text-xs font-semibold rounded-lg transition border shadow-sm ${
              isScreenShareEnabled
                ? 'bg-indigo-605 hover:bg-indigo-700 text-white border-indigo-500 shadow'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            🖥️ {isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}
          </button>
        )}

        {/* Gallery / Spotlight toggles */}
        <button
          type="button"
          onClick={() => setLayout(layout === 'gallery' ? 'spotlight' : 'gallery')}
          className="flex items-center px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-350 transition shadow-sm"
        >
          🖼️ Layout: {layout === 'gallery' ? 'Gallery' : 'Spotlight'}
        </button>
      </div>
    </>
  );
}
