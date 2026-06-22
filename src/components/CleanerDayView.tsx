import React from 'react';
import { Clock, Car, User, MapPin, X, ArrowRight, Navigation, Star, Ban } from 'lucide-react';
import type { Cleaner, Visit, Client, Team } from '../types';
import { format, parse, addMinutes } from 'date-fns';

interface CleanerDayViewProps {
  cleaner: Cleaner;
  date: string;
  visits: Visit[];
  cleaners: Cleaner[];
  clients: Client[];
  teams: Team[];
  onClose: () => void;
}

export const CleanerDayView: React.FC<CleanerDayViewProps> = ({
  cleaner, date, visits, cleaners, clients, teams, onClose,
}) => {
  // All visits for this cleaner on the selected date
  const myVisits = visits
    .filter((v) => {
      if (v.date !== date || v.cancelled) return false;
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const t = teams.find((tm) => tm.id === v.assignedTeamId);
        if (t) ids = t.cleanerIds;
      }
      return ids.includes(cleaner.id);
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Find which driver(s) this cleaner works with
  const driverMap = new Map<string, Cleaner>();
  myVisits.forEach((v) => {
    let ids = v.assignedCleanerIds || [];
    if (ids.length === 0) {
      const t = teams.find((tm) => tm.id === v.assignedTeamId);
      if (t) ids = t.cleanerIds;
    }
    ids.forEach((id) => {
      const c = cleaners.find((x) => x.id === id);
      if (c?.isDriver) driverMap.set(c.id, c);
    });
  });
  const drivers = Array.from(driverMap.values());
  const hasDriver = drivers.length > 0 && !cleaner.isDriver;

  // Calculate total hours
  const totalCleanMinutes = myVisits.reduce((sum, v) => sum + v.durationMinutes, 0);
  // Estimate 15 min travel between consecutive visits for admin view
  const travelMinutes = Math.max(0, (myVisits.length - 1) * 15);
  const totalHours = Math.round(((totalCleanMinutes + travelMinutes) / 60) * 10) / 10;

  const firstVisit = myVisits[0];
  const lastVisit = myVisits[myVisits.length - 1];
  const startTime = firstVisit?.startTime || '--:--';
  const endTime = lastVisit
    ? format(addMinutes(parse(lastVisit.startTime, 'HH:mm', new Date()), lastVisit.durationMinutes), 'HH:mm')
    : '--:--';

  // Estimate pickup / dropoff times for non-drivers with a driver
  const pickupTime = firstVisit && hasDriver
    ? format(addMinutes(parse(firstVisit.startTime, 'HH:mm', new Date()), -15), 'HH:mm')
    : null;
  const dropoffTime = lastVisit && hasDriver
    ? format(addMinutes(parse(lastVisit.startTime, 'HH:mm', new Date()), lastVisit.durationMinutes + 15), 'HH:mm')
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${cleaner.isDriver ? 'bg-blue-50' : 'bg-green-50'}`}>
            {cleaner.isDriver ? <Car size={20} className="text-blue-600" /> : <User size={20} className="text-green-600" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">{cleaner.name}</h3>
            <p className="text-[10px] text-slate-500 font-medium">
              {myVisits.length} visit{myVisits.length !== 1 ? 's' : ''} • {totalHours} hrs • {startTime} – {endTime}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors active:scale-95"
        >
          <X size={18} />
        </button>
      </div>

      {/* Driver info for non-drivers */}
      {hasDriver && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-blue-50 rounded-xl border border-blue-100">
          <Car size={14} className="text-blue-600" />
          <span className="text-xs font-bold text-blue-700">
            Rides with: {drivers.map((d) => d.name).join(', ')}
          </span>
          {pickupTime && dropoffTime && (
            <span className="text-[10px] text-blue-600 ml-auto font-medium">
              Pickup ~{pickupTime} • Dropoff ~{dropoffTime}
            </span>
          )}
        </div>
      )}

      {/* Solo non-driver notice */}
      {!cleaner.isDriver && !hasDriver && myVisits.length > 0 && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-amber-50 rounded-xl border border-amber-100">
          <User size={14} className="text-amber-600" />
          <span className="text-xs font-bold text-amber-700">
            Solo Assignment — No driver pickup today
          </span>
        </div>
      )}

      {/* No visits */}
      {myVisits.length === 0 && (
        <div className="text-center py-8">
          <Clock className="mx-auto mb-2 text-slate-300" size={32} />
          <p className="text-sm text-slate-500 font-medium">No cleans scheduled for this day.</p>
          <p className="text-xs text-slate-400 mt-1">Enjoy the day off!</p>
        </div>
      )}

      {/* Visit timeline */}
      {myVisits.length > 0 && (
        <div className="space-y-3">
          {myVisits.map((visit, idx) => {
            const client = clients.find((c) => c.id === visit.clientId);
            const isLast = idx === myVisits.length - 1;
            const endTime = format(addMinutes(parse(visit.startTime, 'HH:mm', new Date()), visit.durationMinutes), 'HH:mm');

            return (
              <div key={visit.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                    <Clock size={14} className="text-green-600" />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 min-h-[20px] bg-slate-200" />}
                </div>
                <div className="flex-1 pb-2">
                  <p className="text-xs font-bold text-slate-800">{visit.clientName}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {visit.startTime} – {endTime} ({visit.durationMinutes} min)
                  </p>
                  {visit.clientAddress && (
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin size={10} /> {visit.clientAddress}
                    </p>
                  )}
                  {client?.preferredCleaners.length && client.preferredCleaners.includes(cleaner.id) && (
                    <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                      <Star size={10} /> Preferred cleaner for this client
                    </p>
                  )}
                  {client?.avoidCleaners.length && client.avoidCleaners.includes(cleaner.id) && (
                    <p className="text-[10px] text-red-600 flex items-center gap-1 mt-0.5">
                      <Ban size={10} /> Client avoids this cleaner
                    </p>
                  )}
                  {!isLast && (
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                      <ArrowRight size={10} /> ~15 min travel to next
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {myVisits.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-green-50 rounded-xl p-2 text-center border border-green-100">
              <p className="text-[9px] text-green-800 font-bold uppercase tracking-wider">Clean</p>
              <p className="text-lg font-black text-green-700">{(Math.round((totalCleanMinutes / 60) * 10) / 10).toFixed(1)} <span className="text-sm">hrs</span></p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2 text-center border border-amber-100">
              <p className="text-[9px] text-amber-800 font-bold uppercase tracking-wider">Travel</p>
              <p className="text-lg font-black text-amber-700">{(Math.round((travelMinutes / 60) * 10) / 10).toFixed(1)} <span className="text-sm">hrs</span></p>
            </div>
            <div className="bg-slate-50 rounded-xl p-2 text-center border border-slate-100">
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Total</p>
              <p className="text-lg font-black text-slate-800">{totalHours.toFixed(1)} <span className="text-sm">hrs</span></p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center font-medium">
            Travel times are estimates. Actual routing depends on real-time traffic.
          </p>
        </div>
      )}
    </div>
  );
};
