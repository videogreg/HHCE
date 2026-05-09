import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { checkConstraints } from '../utils/scheduler';
import { formatTotalHours } from '../utils/hours';
import { AlertTriangle, Wand2, CheckCircle, Clock, MapPin, Users } from 'lucide-react';
import { format } from 'date-fns';

export const ReorganizeModal: React.FC = () => {
  const { selectedDate, visits, cleaners, clients, teams, setVisits } = useAppContext();
  const [changes, setChanges] = useState<string[]>([]);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = useMemo(() =>
    visits.filter(v => v.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [visits, dateStr]);

  const violations = useMemo(() => checkConstraints(dayVisits, cleaners, clients, teams), [dayVisits, cleaners, clients, teams]);

  const autoFix = () => {
    let newVisits = [...visits];
    const madeChanges: string[] = [];

    dayVisits.forEach(visit => {
      if (!visit.assignedTeamId && teams.length > 0) {
        const team = teams[0];
        newVisits = newVisits.map(v => v.id === visit.id ? {
          ...v,
          assignedTeamId: team.id,
          assignedCleanerIds: team.cleanerIds,
          teamName: team.name
        } : v);
        madeChanges.push(`Assigned ${team.name} to ${visit.clientName}`);
      }
    });

    setVisits(newVisits);
    setChanges(madeChanges);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-1">
          <Wand2 className="text-purple-600" size={22} />
          Nightmare Fix
        </h2>
        <p className="text-xs text-slate-500 font-medium mb-4">
          Fixing schedule for <span className="font-bold text-slate-700">{format(selectedDate, 'EEEE, MMM d, yyyy')}</span>
        </p>

        {violations.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle size={20} className="text-green-600" />
            <p className="text-sm font-bold text-green-700">No issues found for this day!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <h3 className="text-xs font-black text-red-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                <AlertTriangle size={14} /> {violations.length} Issues Found
              </h3>
              <div className="space-y-1">
                {violations.map((v, i) => (
                  <p key={i} className={`text-xs font-medium ${v.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                    • {v.message}
                  </p>
                ))}
              </div>
            </div>

            <button
              onClick={autoFix}
              className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 active:scale-[0.98] transition-colors flex items-center justify-center gap-2"
            >
              <Wand2 size={16} /> Auto-Fix Day
            </button>

            {changes.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <h3 className="text-xs font-black text-blue-700 uppercase tracking-wider mb-2">Changes Made</h3>
                {changes.map((c, i) => (
                  <p key={i} className="text-xs text-blue-600 font-medium">• {c}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {dayVisits.map(visit => {
          const team = teams.find(t => t.id === visit.assignedTeamId);
          const visitVios = violations.filter(v => v.visitId === visit.id);
          return (
            <div key={visit.id} className={`bg-white rounded-xl border p-3 ${visitVios.some(v => v.severity === 'error') ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-slate-800">{visit.clientName}</span>
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Clock size={12} /> {visit.startTime} • {formatTotalHours(visit.durationMinutes)}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                <MapPin size={10} /> {visit.clientAddress}
              </div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <Users size={10} /> Team: {team?.name || 'Unassigned'}
              </div>
            </div>
          );
        })}
        {dayVisits.length === 0 && (
          <div className="text-center py-8 bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-xs text-slate-400">No visits on this day to fix.</p>
          </div>
        )}
      </div>
    </div>
  );
};