import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner, Visit } from '../types';
import { LogOut, MapPin, Clock, Calendar, Phone, FileText, User, Car, Users, ChevronLeft, ChevronRight } from 'lucide-react';

interface CleanerDashboardProps {
  cleaner: Cleaner;
  onLogout: () => void;
}

const formatLocalDate = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const parseTime = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const formatMinutes = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const addMinutes = (time: string, mins: number): string => {
  return formatMinutes(parseTime(time) + mins);
};

const diffHours = (start: string, end: string): number => {
  return (parseTime(end) - parseTime(start)) / 60;
};

const dayName = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export const CleanerDashboard: React.FC<CleanerDashboardProps> = ({ cleaner, onLogout }) => {
  const { visits, clients, teams, cleaners } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<string>(formatLocalDate(new Date()));
  const [detailVisit, setDetailVisit] = useState<Visit | null>(null);

  const dayVisits = useMemo(() => {
    return visits
      .filter(v => {
        if (v.date !== selectedDate) return false;
        if (v.assignedCleanerIds.includes(cleaner.id)) return true;
        const team = teams.find(t => t.id === v.assignedTeamId);
        return team?.cleanerIds.includes(cleaner.id) ?? false;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [visits, selectedDate, cleaner.id, teams]);

  const firstVisit = dayVisits[0];
  const lastVisit = dayVisits[dayVisits.length - 1];

  let driverName = '';
  let hasDriverPickup = false;
  let teamMembers: string[] = [];

  if (firstVisit) {
    const team = teams.find(t => t.id === firstVisit.assignedTeamId);
    if (team) {
      const driverId = team.cleanerIds.find(cid => cleaners.find(c => c.id === cid)?.isDriver);
      if (driverId) {
        hasDriverPickup = !cleaner.isDriver;
        driverName = cleaners.find(c => c.id === driverId)?.name || 'Driver';
      }
      teamMembers = team.cleanerIds
        .filter(cid => cid !== cleaner.id)
        .map(cid => cleaners.find(c => c.id === cid)?.name)
        .filter(Boolean) as string[];
    }
  }

  const firstStart = firstVisit?.startTime;
  const lastEnd = lastVisit ? addMinutes(lastVisit.startTime, lastVisit.durationMinutes) : null;
  const paidHours = (firstStart && lastEnd) ? diffHours(firstStart, lastEnd) : 0;
  const pickupTime = firstStart ? addMinutes(firstStart, -15) : null;
  const dropoffTime = lastEnd ? addMinutes(lastEnd, 15) : null;

  const clientForVisit = (visit: Visit) => clients.find(c => c.id === visit.clientId);

  const goPrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatLocalDate(d));
  };

  const goNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(formatLocalDate(d));
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-hhce-dark border-b border-slate-800 sticky top-0 z-30 shadow-lg">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center text-white shadow-md">
              <User size={18} />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">{cleaner.name}</h1>
              <p className="text-[9px] text-green-400 font-bold uppercase tracking-wider">
                {cleaner.isDriver ? 'Driver' : 'Cleaner'}
              </p>
            </div>
          </div>
          <button 
            onClick={onLogout} 
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors active:scale-95"
          >
            <LogOut size={14} /> Exit
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-4 space-y-4">
        {/* Date Navigator */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center gap-2">
          <button 
            onClick={goPrevDay}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors active:scale-95"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{dayName(selectedDate)}</p>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full text-center text-sm font-bold text-slate-800 bg-transparent focus:outline-none"
            />
          </div>

          <button 
            onClick={goNextDay}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors active:scale-95"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {dayVisits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
            <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-bold text-sm">No cleans scheduled.</p>
            <p className="text-slate-400 text-xs mt-1">Enjoy your day off!</p>
          </div>
        ) : (
          <>
            {/* Summary Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" /> Day Summary
              </h2>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block mb-1">First Clean</span>
                  <span className="text-slate-800 font-black text-xl">{firstStart}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block mb-1">Last Clean Ends</span>
                  <span className="text-slate-800 font-black text-xl">{lastEnd}</span>
                </div>
              </div>

              {!cleaner.isDriver && hasDriverPickup && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800 font-bold text-xs">
                    <Car size={14} /> Driver Pickup
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Driver:</span>
                    <span className="font-bold text-slate-800">{driverName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Pickup by:</span>
                    <span className="font-bold text-slate-800">{pickupTime}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Dropoff:</span>
                    <span className="font-bold text-slate-800">{dropoffTime}</span>
                  </div>
                </div>
              )}

              {!cleaner.isDriver && !hasDriverPickup && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-amber-800 text-xs font-bold flex items-center gap-2">
                    <User size={14} /> Solo Assignment — No driver pickup today
                  </p>
                </div>
              )}

              {cleaner.isDriver && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                  <p className="text-blue-800 text-xs font-bold flex items-center gap-2">
                    <Car size={14} /> You are driving today
                  </p>
                  {teamMembers.length > 0 && (
                    <p className="text-slate-600 text-xs">
                      With: <span className="font-bold">{teamMembers.join(', ')}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center justify-between">
                <span className="text-green-800 text-xs font-bold uppercase tracking-wider">Paid Hours</span>
                <span className="text-green-700 font-black text-2xl">{paidHours.toFixed(1)} <span className="text-sm">hrs</span></span>
              </div>
            </div>

            {/* Route Timeline */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MapPin size={16} className="text-green-600" /> Your Route ({dayVisits.length} {dayVisits.length === 1 ? 'clean' : 'cleans'})
              </h2>

              <div className="relative pl-6 space-y-4">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200" />

                {dayVisits.map((visit, idx) => {
                  const client = clientForVisit(visit);
                  const endTime = addMinutes(visit.startTime, detailVisit.durationMinutes);
                  const isFirst = idx === 0;
                  const isLast = idx === dayVisits.length - 1;

                  return (
                    <div key={visit.id} className="relative">
                      {/* Dot */}
                      <div className={`absolute -left-[25px] top-2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black shadow-sm
                        ${isFirst ? 'bg-green-600 border-green-600 text-white' : 
                          isLast ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300 text-slate-500'}`}>
                        {idx + 1}
                      </div>

                      <div 
                        onClick={() => setDetailVisit(visit)}
                        className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {visit.startTime} – {endTime}
                            </p>
                            <h3 className="font-bold text-sm text-slate-800 mt-0.5 truncate">{visit.clientName}</h3>
                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                              <MapPin size={10} className="shrink-0" /> 
                              {detailVisit.clientAddress || client?.address || 'No address'}
                            </p>
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold shrink-0">
                            {detailVisit.durationMinutes}m
                          </span>
                        </div>

                        {client?.notes && (
                          <p className="text-[10px] text-amber-700 mt-2 bg-amber-50 rounded-lg px-2 py-1.5 flex items-start gap-1.5 border border-amber-100">
                            <FileText size={10} className="shrink-0 mt-0.5" /> 
                            <span className="line-clamp-2">{client.notes}</span>
                          </p>
                        )}

                        <p className="text-[10px] text-blue-600 mt-2 font-bold flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-blue-50 flex items-center justify-center">ℹ</span>
                          Tap for full details
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Detail Modal */}
      {detailVisit && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" 
          onClick={() => setDetailVisit(null)}
        >
          <div 
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl animate-slide-up" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">{detailVisit.clientName}</h3>
              <button 
                onClick={() => setDetailVisit(null)} 
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
              >
                ✕
              </button>
            </div>

            {(() => {
              const client = clientForVisit(detailVisit);
              const endTime = addMinutes(detailVisit.startTime, detailVisit.durationMinutes);
              return (
                <div className="space-y-3 text-sm">
                  <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                    <Clock size={18} className="text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Scheduled Time</p>
                      <p className="font-black text-slate-800">{detailVisit.startTime} – {endTime} <span className="text-slate-400 font-normal">({detailVisit.durationMinutes} min)</span></p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 text-slate-600">
                    <MapPin size={18} className="text-green-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Address</p>
                      <p>{detailVisit.clientAddress || client?.address || 'No address on file'}</p>
                    </div>
                  </div>

                  {client?.phone && (
                    <div className="flex items-center gap-3 text-slate-600">
                      <Phone size={18} className="text-green-500 shrink-0" />
                      <div>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Phone</p>
                        <p className="font-medium">{client.phone}</p>
                      </div>
                    </div>
                  )}

                  {client?.zone && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">Zone: {client.zone}</span>
                    </div>
                  )}

                  {client?.notes && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 space-y-1">
                      <p className="font-bold flex items-center gap-1"><FileText size={12} /> House Notes</p>
                      <p>{client.notes}</p>
                    </div>
                  )}

                  {detailVisit.teamName && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 space-y-1">
                      <p className="font-bold flex items-center gap-1"><Users size={12} /> Team: {detailVisit.teamName}</p>
                      <p className="text-slate-600">
                        Assigned with: {detailVisit.assignedCleanerIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button 
                      onClick={() => setDetailVisit(null)}
                      className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors active:scale-[0.98]"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};