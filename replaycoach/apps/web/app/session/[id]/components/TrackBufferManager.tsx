'use client';
import { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useReplayStore } from '../../../../stores/replay-store';

type Chunk = { ts: number; blob: Blob; gen: number };
const WINDOW_MS = 70_000;
// A MediaRecorder instance's very first ondataavailable chunk carries the
// WebM container header; every later chunk is a continuation cluster that
// only decodes correctly chained after chunks from the SAME instance
// ("generation" below). The old design pinned only the very first chunk of
// the whole session and prepended it in front of whatever recent window was
// sliced — fine for the first ~70s, but once the header chunk aged out of
// the rolling window it became a temporally-disjoint splice: the decoder
// could open the header's own ~1s of frames, then hit a broken delta-frame
// chain and stop. That produced two symptoms that looked unrelated but
// shared this one cause: "Analyze 10s" clips truncating to ~1s of usable
// frames, and instant-replay video rendering as heavily corrupted/blocky
// (classic decode-error macroblocks, not just a resolution mismatch).
// Restarting the recorder periodically keeps a fresh header always
// available, and slicing never mixes chunks across a restart boundary (see
// getReplayBlob below) — every generation carries its own header, so
// there's no benefit to restarting *often*, only a cost (a slice whose
// window happens to straddle a restart boundary loses whichever side has
// less coverage). A longer interval just makes that collision rarer: at
// 60s, a 10s "last N seconds" request has roughly a 1-in-6 chance of
// touching a boundary, versus the old design's single session-lifetime
// header, which was *guaranteed* stale (and therefore undecodable when
// spliced) for any meeting running past ~70s.
const RESTART_INTERVAL_MS = 60_000;

/**
 * Records every participant's camera track — including the LOCAL one — into
 * a rolling in-memory buffer and registers `getReplayBlob` so ReplayPanel
 * can slice a clip instantly (no server round-trip). Must render inside
 * <LiveKitRoom> so it can see subscribed tracks; runs for the whole
 * session, not just replay.
 *
 * Local track is included (not just remote) because a replay can be
 * broadcast to the WHOLE room targeting a specific participant — if that
 * participant is a student and only remote tracks were buffered, the
 * student being replayed would have no footage of themselves to show,
 * even though every other participant (who has them as a remote track)
 * would render fine.
 */
export function TrackBufferManager() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const buffers = useRef<Map<string, Chunk[]>>(new Map());
  const headers = useRef<Map<string, { blob: Blob; gen: number }>>(new Map());
  const recorders = useRef<Map<string, MediaRecorder>>(new Map());
  const generation = useRef<Map<string, number>>(new Map());
  const restartTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const tracksByParticipant = useRef<Map<string, MediaStreamTrack>>(new Map());
  const mime = useRef<string>('video/webm');

  useEffect(() => {
    const startRecorder = (pid: string, mst: MediaStreamTrack) => {
      const stream = new MediaStream([mst]);
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8' : 'video/webm';
      mime.current = type;
      const gen = (generation.current.get(pid) ?? 0) + 1;
      generation.current.set(pid, gen);

      const rec = new MediaRecorder(stream, { mimeType: type });
      let firstChunk = true;
      rec.ondataavailable = (e) => {
        if (!e.data.size) return;
        if (firstChunk) {
          headers.current.set(pid, { blob: e.data, gen });
          firstChunk = false;
        }
        const arr = buffers.current.get(pid) ?? [];
        arr.push({ ts: Date.now(), blob: e.data, gen });
        const cutoff = Date.now() - WINDOW_MS;
        while (arr.length && arr[0]!.ts < cutoff) arr.shift();
        buffers.current.set(pid, arr);
      };
      rec.start(1000); // 1s chunks
      recorders.current.set(pid, rec);
    };

    for (const t of tracks) {
      const pid = t.participant.identity;
      const mst = t.publication?.track?.mediaStreamTrack;
      if (!mst) continue;
      tracksByParticipant.current.set(pid, mst);
      if (recorders.current.has(pid)) continue;

      // A fresh MediaRecorder instance means a fresh container stream — any
      // header/chunks buffered from a previous instance for this participant
      // are no longer compatible and must not get mixed in.
      headers.current.delete(pid);
      buffers.current.delete(pid);
      generation.current.delete(pid);
      startRecorder(pid, mst);

      const timer = setInterval(() => {
        const rec = recorders.current.get(pid);
        const track = tracksByParticipant.current.get(pid);
        if (!rec || !track || rec.state === 'inactive') return;
        rec.stop();
        recorders.current.delete(pid);
        // MediaRecorder flushes its final chunk synchronously-before-return
        // from stop() isn't guaranteed, but starting the next instance
        // immediately is safe — recorders don't exclusively lock the
        // underlying track, and any brief gap is at most one ~1s timeslice.
        startRecorder(pid, track);
      }, RESTART_INTERVAL_MS);
      restartTimers.current.set(pid, timer);
    }
    // stop recorders (and restart timers) for tracks that went away
    for (const [pid, rec] of recorders.current) {
      if (!tracks.some((t) => t.participant.identity === pid)) {
        rec.stop();
        recorders.current.delete(pid);
        const timer = restartTimers.current.get(pid);
        if (timer) clearInterval(timer);
        restartTimers.current.delete(pid);
        tracksByParticipant.current.delete(pid);
      }
    }
  }, [tracks]);

  useEffect(() => {
    const getReplayBlob = (participantId: string, fromOffsetMs: number, toOffsetMs = 0): Blob | null => {
      const arr = buffers.current.get(participantId);
      if (!arr || arr.length === 0) return null;
      const start = Date.now() + fromOffsetMs;
      const end = Date.now() + toOffsetMs;
      const windowChunks = arr.filter((c) => c.ts >= start && c.ts <= end);
      if (windowChunks.length === 0) return null;

      // Chunks from different recorder generations don't decode when
      // concatenated (see the RESTART_INTERVAL_MS comment above). If the
      // requested window happens to straddle a restart boundary, keep only
      // whichever generation has the most coverage rather than splicing
      // across it — a clean, shorter clip beats a longer corrupted one.
      const countByGen = new Map<number, number>();
      for (const c of windowChunks) countByGen.set(c.gen, (countByGen.get(c.gen) ?? 0) + 1);
      let bestGen = windowChunks[0]!.gen;
      let bestCount = 0;
      for (const [gen, count] of countByGen) {
        if (count > bestCount) { bestGen = gen; bestCount = count; }
      }
      const genParts = windowChunks.filter((c) => c.gen === bestGen).map((c) => c.blob);

      const header = headers.current.get(participantId);
      const parts = header && header.gen === bestGen && genParts[0] !== header.blob
        ? [header.blob, ...genParts]
        : genParts;
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
