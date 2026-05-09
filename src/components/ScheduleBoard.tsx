import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { checkConstraints } from '../utils/scheduler';
import { Calendar, Clock, MapPin, AlertCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export const ScheduleBoard: React.FC = () => {
  const { visits, cleaners, clients, teams } = useAppContext();
  
  // For simplicity, we show current day's visits
  const today = format(new Date(), 'yyyy-MM-dd');
  const todaysVisits = visits.filter(v => v.date === today);

  const violations = useMemo(() => 
    checkConstraints(visits, cleaners, clients, teams),
    [visits, cleaners, clients, teams]
  );

  const getViolationsForVisit = (visitId: string) => 
    violations.filter(v => v.visitId === visitId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="text-purple-600" /> Daily Schedule: {today}
        </h2>
      </div>

      {todaysVisits.length === 0 && (
        <div className="text-center py-12 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-500 italic text-sm">No visits scheduled for today.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {todaysVisits.map(visit => {
          const visitViolations = getViolationsForVisit(visit.id);
          const hasError = visitViolations.some(v => v.severity === 'error');
          const hasWarning = visitViolations.some(v => v.severity === 'warning');
          const team = teams.find(t => t.id === visit.assignedTeamId);

          return (
            <div 
              key={visit.id}
              className={`p-4 rounded-xl border-2 transition-all ${
                visit.cancelled 
                  ? 'bg-gray-100 border-gray-200 opacity-60' 
                  : hasError 
                  ? 'bg-red-50 border-red-200' 
                  : hasWarning 
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-white border-white shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-bold text-gray-900">{visit.clientName}</h3>
                <div className="flex gap-1">
                  {visitViolations.map((v, i) => (
                    v.severity === 'error' 
                      ? <AlertCircle key={i} size={16} className="text-red-500" />
                      : <AlertTriangle key={i} size={16} className="text-amber-500" />
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-gray-400" />
                  <span>{visit.startTime} ({visit.durationMinutes} min)</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-gray-400" />
                  <span className="truncate">Team: {team?.name || 'Unassigned'}</span>
                </div>
              </div>

              {visitViolations.length > 0 && !visit.cancelled && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <ul className="space-y-1">
                    {visitViolations.map((v, i) => (
                      <li key={i} className={`text-[10px] leading-tight font-medium ${v.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                        • {v.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {visit.cancelled && (
                <div className="mt-2 text-center font-bold text-gray-400 uppercase text-xs tracking-widest">
                  Cancelled
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
