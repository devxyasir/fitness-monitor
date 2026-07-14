'use client';

import { useParticipants } from '@livekit/components-react';
import { Settings2 } from 'lucide-react';

interface ReplayTargetPickerProps {
  selectedStudentIds: string[];
  onChange: (ids: string[]) => void;
}

export function ReplayTargetPicker({ selectedStudentIds, onChange }: ReplayTargetPickerProps) {
  const participants = useParticipants();

  // Students are all other participants in the session
  const students = participants.filter((p) => !p.isLocal);

  const toggleStudent = (identity: string) => {
    if (selectedStudentIds.includes(identity)) {
      onChange(selectedStudentIds.filter((id) => id !== identity));
    } else {
      onChange([...selectedStudentIds, identity]);
    }
  };

  const selectAll = () => {
    onChange(students.map((s) => s.identity));
  };

  const selectNone = () => {
    onChange([]);
  };

  return (
    <div className="bg-panel border border-hairline rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h3 className="text-sm font-display font-semibold text-ink tracking-wide uppercase inline-flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" /> Sync replay to
        </h3>
        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-session/10 text-session border border-session/30">
          {students.length} active
        </span>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-6 text-ink-faint text-xs">
          No other participants in session.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {students.map((student) => {
            const isChecked = selectedStudentIds.includes(student.identity);
            return (
              <label
                key={student.identity}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer select-none ${
                  isChecked
                    ? 'bg-session/10 border-session/35 text-ink'
                    : 'bg-panel-2/40 border-hairline text-ink-muted hover:bg-panel-2 hover:text-ink'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleStudent(student.identity)}
                    className="w-4 h-4 accent-session rounded border-hairline bg-panel-2 cursor-pointer"
                  />
                  <span className="text-xs font-semibold">
                    {student.name || student.identity}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-panel-2 border border-hairline text-ink-faint">
                  Student
                </span>
              </label>
            );
          })}
        </div>
      )}

      {students.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-hairline">
          <button
            type="button"
            onClick={selectAll}
            className="px-3 py-2 text-[11px] font-bold rounded-full border border-hairline bg-panel-2 hover:bg-panel-2/60 hover:text-ink text-ink-muted transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="px-3 py-2 text-[11px] font-bold rounded-full border border-hairline bg-panel-2 hover:bg-panel-2/60 hover:text-ink text-ink-muted transition-colors"
          >
            Clear Selected
          </button>
        </div>
      )}
    </div>
  );
}
