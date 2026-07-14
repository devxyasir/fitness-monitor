'use client';

import { Calendar } from 'lucide-react';
import { ClipCard } from './ClipCard';
import { groupClipsByMeeting, formatMeetingDateTime, type ClipItem } from './clipsShared';

interface MeetingGroupsProps {
  clips: ClipItem[];
  onPlay: (clip: ClipItem) => void;
  onShare?: ((clip: ClipItem) => void) | undefined;
}

/**
 * Renders clips grouped by meeting — one header per meeting (participant name
 * + date + time), meetings newest-first, clips within a meeting newest-first.
 * The header shows the OTHER participant's first name (resolved server-side,
 * never the viewer's own name and never an email).
 */
export function MeetingGroups({ clips, onPlay, onShare }: MeetingGroupsProps) {
  const groups = groupClipsByMeeting(clips);

  return (
    <div className="flex flex-col gap-10">
      {groups.map((group) => (
        <section key={group.sessionId}>
          {/* One meeting header, rendered once for the whole group. */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-hairline">
            <div className="w-9 h-9 rounded-md bg-session/10 border border-session/25 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-session" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-display-s text-ink truncate">
                {group.otherParticipantName}
              </h3>
              <p className="text-xs text-ink-muted">{formatMeetingDateTime(group.startedAt)}</p>
            </div>
            <span className="ml-auto font-mono text-[10px] font-semibold text-ink-faint bg-panel-2 border border-hairline rounded-md px-2 py-1 shrink-0">
              {group.clips.length} clip{group.clips.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {group.clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} onPlay={onPlay} onShare={onShare} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
