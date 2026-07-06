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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase inline-flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" /> Replay Sync Targets
        </h3>
        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 border border-indigo-800">
          {students.length} active students
        </span>
      </div>

      {students.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          No other participants in session.
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
          {students.map((student) => {
            const isChecked = selectedStudentIds.includes(student.identity);
            return (
              <label
                key={student.identity}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition cursor-pointer select-none ${
                  isChecked
                    ? 'bg-indigo-950/40 border-indigo-800 text-white'
                    : 'bg-slate-950/40 border-slate-900 text-slate-400 hover:bg-slate-950 hover:border-slate-800 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleStudent(student.identity)}
                    className="w-4 h-4 accent-indigo-500 rounded border-slate-800 bg-slate-900 cursor-pointer"
                  />
                  <span className="text-xs font-semibold">
                    {student.name || student.identity}
                  </span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                  Student
                </span>
              </label>
            );
          })}
        </div>
      )}

      {students.length > 0 && (
        <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-900">
          <button
            type="button"
            onClick={selectAll}
            className="px-3 py-2 text-[11px] font-bold rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 hover:text-white text-slate-300 transition"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={selectNone}
            className="px-3 py-2 text-[11px] font-bold rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 hover:text-white text-slate-300 transition"
          >
            Clear Selected
          </button>
        </div>
      )}
    </div>
  );
}
