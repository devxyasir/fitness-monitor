/**
 * Shared types + grouping/formatting helpers for the coach and student Clips
 * pages. Clips are grouped by meeting (session): one header per meeting,
 * meetings newest-first, clips within a meeting newest-first.
 */

export interface ClipItem {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionId: string;
  createdBy: string;
  createdAt: string;
  clipType?: 'recording' | 'reference';
  videoUrl?: string | null;
  downloadable?: boolean;
  referenceVideoId?: string | null;
  sharesCount?: number;
  meeting: {
    sessionId: string;
    startedAt: string;
    otherParticipantName: string;
  };
}

export interface MeetingGroup {
  sessionId: string;
  startedAt: string;
  otherParticipantName: string;
  clips: ClipItem[];
}

export function groupClipsByMeeting(clips: ClipItem[]): MeetingGroup[] {
  const map = new Map<string, MeetingGroup>();
  for (const c of clips) {
    let group = map.get(c.sessionId);
    if (!group) {
      group = {
        sessionId: c.sessionId,
        startedAt: c.meeting?.startedAt ?? c.createdAt,
        otherParticipantName: c.meeting?.otherParticipantName ?? 'Participant',
        clips: [],
      };
      map.set(c.sessionId, group);
    }
    group.clips.push(c);
  }

  const groups = Array.from(map.values());
  // Meetings newest first.
  groups.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  // Clips within each meeting newest first.
  for (const g of groups) {
    g.clips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  return groups;
}

/** "Monday, Jul 7 • 7:00 PM" — meeting date + time for the group header. */
export function formatMeetingDateTime(startedAtISO: string): string {
  const d = new Date(startedAtISO);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${weekday}, ${monthDay} • ${time}`;
}
