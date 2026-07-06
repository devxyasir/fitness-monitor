'use client';
import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useReplayStore } from '../../../../stores/replay-store';

type Chunk = { ts: number; blob: Blob };
const WINDOW_MS = 70_000;

/**
 * Records each remote participant's camera track into a rolling in-memory
 * buffer and registers `getReplayBlob` so ReplayPanel can slice a per-student
 * clip instantly (no server round-trip). Must render inside <LiveKitRoom> so
 * it can see subscribed tracks; runs for the whole session, not just replay.
 */
export function TrackBufferManager() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: true });
  const buffers = useRef<Map<string, Chunk[]>>(new Map());
  // The very first chunk a MediaRecorder instance emits carries the WebM
  // container header (EBML/Segment/Tracks info) — every later chunk is just
  // a continuation cluster that depends on it. A blob built purely from a
  // time-window slice (e.g. "last 10s") almost always excludes that first
  // chunk, producing bytes no decoder can open ("Could not open downloaded
  // video"). Pinned here, per participant, exempt from the rolling eviction
  // below, and always prepended when a clip is sliced.
  const headers = useRef<Map<string, Blob>>(new Map());
  const recorders = useRef<Map<string, MediaRecorder>>(new Map());
  const mime = useRef<string>('video/webm');

  useEffect(() => {
    for (const t of tracks) {
      const pid = t.participant.identity;
      const mst = t.publication?.track?.mediaStreamTrack;
      if (!mst || recorders.current.has(pid)) continue;

      // A fresh MediaRecorder instance means a fresh container stream — any
      // header/chunks buffered from a previous instance for this participant
      // are no longer compatible and must not get mixed in.
      headers.current.delete(pid);
      buffers.current.delete(pid);

      const stream = new MediaStream([mst]);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8' : 'video/webm';
      mime.current = type;
      const rec = new MediaRecorder(stream, { mimeType: type });
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        if (!headers.current.has(pid)) {
          headers.current.set(pid, e.data);
        }
        const arr = buffers.current.get(pid) ?? [];
        arr.push({ ts: Date.now(), blob: e.data });
        const cutoff = Date.now() - WINDOW_MS;
        while (arr.length && arr[0]!.ts < cutoff) arr.shift();
        buffers.current.set(pid, arr);
      };
      rec.start(1000); // 1s chunks
      recorders.current.set(pid, rec);
    }
    // stop recorders for tracks that went away
    for (const [pid, rec] of recorders.current) {
      if (!tracks.some((t) => t.participant.identity === pid)) {
        rec.stop(); recorders.current.delete(pid);
      }
    }
  }, [tracks]);

  useEffect(() => {
    const getReplayBlob = (participantId: string, fromOffsetMs: number, toOffsetMs = 0): Blob | null => {
      const arr = buffers.current.get(participantId);
      if (!arr || arr.length === 0) return null;
      const start = Date.now() + fromOffsetMs;
      const end = Date.now() + toOffsetMs;
      const windowParts = arr.filter((c) => c.ts >= start && c.ts <= end).map((c) => c.blob);
      if (windowParts.length === 0) return null;

      const header = headers.current.get(participantId);
      const parts = header && windowParts[0] !== header ? [header, ...windowParts] : windowParts;
      return new Blob(parts, { type: mime.current });
    };

    // How far back the buffer actually reaches for this participant right
    // now — e.g. a meeting that started 10s ago can't have 30s of footage
    // yet, even though the rolling window holds up to WINDOW_MS.
    const getBufferedDurationMs = (participantId: string): number => {
      const arr = buffers.current.get(participantId);
      if (!arr || arr.length === 0) return 0;
      return Date.now() - arr[0]!.ts;
    };

    useReplayStore.getState().setGetReplayBlob(getReplayBlob);
    useReplayStore.getState().setGetBufferedDurationMs(getBufferedDurationMs);
    return () => {
      useReplayStore.getState().setGetReplayBlob(null);
      useReplayStore.getState().setGetBufferedDurationMs(null);
    };
  }, []);

  return null;
}
