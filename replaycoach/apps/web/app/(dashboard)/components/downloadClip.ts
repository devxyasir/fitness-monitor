import { apiClient } from '../../../lib/api-client';

/**
 * Builds a human-meaningful download filename from the meeting's start time,
 * e.g. meeting-2026-07-07-7-00pm-replay.mp4
 */
export function buildClipFilename(startedAtISO?: string): string {
  const d = startedAtISO ? new Date(startedAtISO) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `meeting-${y}-${m}-${day}-${h}-${min}${ampm}-replay.mp4`;
}

/**
 * Downloads a clip's processed video (the skeleton-burned-in overlay MP4)
 * to the user's device. Authorization is enforced server-side: the playUrl
 * comes from GET /clips/:id, which performs the same IDOR access check used
 * for playback, so only a coach who owns the clip or a student it's shared
 * with can obtain it. Fetched as a blob so a meaningful filename can be set
 * regardless of the signed URL's own path.
 */
export async function downloadClipVideo(opts: {
  clipId: string;
  startedAt?: string | undefined;
  playUrl?: string | undefined;
}): Promise<void> {
  let url = opts.playUrl;
  if (!url) {
    const data = await apiClient.get<{ playUrl: string }>(`/clips/${opts.clipId}`);
    url = data.playUrl;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = buildClipFilename(opts.startedAt);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
