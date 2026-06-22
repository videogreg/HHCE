import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Clock, MapPin, Phone, Mail, Calendar, FileText, User, AlertCircle, AlertTriangle, Pencil, Save, RotateCcw, Car, Ban, Star, Check, Bus } from 'lucide-react';
import type { Visit, Cleaner, Client, ConstraintViolation } from '../types';
import { checkConstraints } from '../utils/scheduler';
import { format, parse, addMinutes, isBefore, isAfter } from 'date-fns';
import { formatHrsMins } from '../utils/hours';

interface VisitDetailModalProps {
  visit: Visit;
  cleaners: Cleaner[];
  clients: Client[];
  teams: any[];
  violations: ConstraintViolation[];
  onClose: () => void;
  onSave?: (updatedVisit: Visit) => void;
}

interface MoveSuggestion {
  priority: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  startTime?: string;
  cleanerIds?: string[];
  driverName?: string;
  score: number;
}

export const VisitDetailModal: React.FC<VisitDetailModalProps> = ({
  visit,
  cleaners,
  clients,
  teams,
  violations: originalViolations,
  onClose,
  onSave,
}) => {
  const { visits } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState(visit.date);
  const [editTime, setEditTime] = useState(visit.startTime);
  const [editCleanerIds, setEditCleanerIds] = useState<string[]>(visit.assignedCleanerIds || []);
  const [acceptedSuggestion, setAcceptedSuggestion] = useState<MoveSuggestion | null>(null);

  // Relief driver form (Priority 4)
  const [reliefName, setReliefName] = useState('');
  const [reliefAddress, setReliefAddress] = useState('');
  const [showReliefForm, setShowReliefForm] = useState(false);

  const client = clients.find(c => c.id === visit.clientId);
  const assignedCleaners = (visit.assignedCleanerIds || [])
    .map(id => cleaners.find(c => c.id === id))
    .filter(Boolean);

  const totalHours = ((visit.durationMinutes || 0) / 60).toFixed(1);

  // ── SMART MOVE SUGGESTION ENGINE ──
  const suggestions = useMemo((): MoveSuggestion[] => {
    if (!isEditing || !client) return [];
    const duration = visit.durationMinutes || client.durationMinutes || 120;
    const targetDateStr = editDate;
    const activeCleaners = cleaners.filter(c => c.active);
    const dayVisits = visits.filter(v => v.date === targetDateStr && !v.cancelled && v.id !== visit.id);

    const slots: MoveSuggestion[] = [];

    // Build driver routes for target date
    const driverRoutes: Record<string, Visit[]> = {};
    dayVisits.forEach(v => {
      const ids = v.assignedCleanerIds || [];
      const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
      if (driver) {
        if (!driverRoutes[driver.id]) driverRoutes[driver.id] = [];
        driverRoutes[driver.id].push(v);
      }
    });
    Object.values(driverRoutes).forEach(route => route.sort((a, b) => a.startTime.localeCompare(b.startTime)));

    // Priority 1 & 2: Check gaps in existing driver routes
    Object.entries(driverRoutes).forEach(([driverId, route]) => {
      const driver = activeCleaners.find(c => c.id === driverId);
      if (!driver) return;

      const pairedToday = new Set<string>();
      route.forEach(v => (v.assignedCleanerIds || []).forEach(id => { if (id !== driverId) pairedToday.add(id); }));

      const pickPartner = (): Cleaner | undefined => {
        const candidates = activeCleaners.filter(c => {
          if (c.id === driverId) return false;
          if (!c.active) return false;
          if (client.avoidCleaners.includes(c.id)) return false;
          if (c.cannotWorkWith.includes(driverId) || driver.cannotWorkWith.includes(c.id)) return false;
          const visitDay = new Date(targetDateStr + 'T00:00:00');
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
          const dayName = dayNames[visitDay.getDay()];
          if (c.unavailableDays?.includes(dayName)) return false;
          return true;
        });
        return candidates.find(c => client.preferredCleaners.includes(c.id) && pairedToday.has(c.id))
          || candidates.find(c => pairedToday.has(c.id))
          || candidates.find(c => client.preferredCleaners.includes(c.id))
          || candidates[0];
      };

      const partner = pickPartner();

      // Check all gaps
      const gaps: { start: string; end: Date; gapMin: number }[] = [];
      for (let i = 0; i < route.length - 1; i++) {
        const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), route[i].durationMinutes);
        const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
        const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
        if (gapMin >= duration + 15) {
          gaps.push({ start: format(addMinutes(curEnd, 15), 'HH:mm'), end: nxtStart, gapMin });
        }
      }
      // After last visit
      if (route.length > 0) {
        const last = route[route.length - 1];
        const lastEnd = addMinutes(parse(last.startTime, 'HH:mm', new Date()), last.durationMinutes);
        gaps.push({ start: format(addMinutes(lastEnd, 15), 'HH:mm'), end: parse('23:59', 'HH:mm', new Date()), gapMin: 999 });
      }

      gaps.forEach(gap => {
        const slotStart = gap.start;
        const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), duration);

        if (client.notBefore && isBefore(parse(slotStart, 'HH:mm', new Date()), parse(client.notBefore, 'HH:mm', new Date()))) return;
        if (client.notAfter && isAfter(slotEnd, parse(client.notAfter, 'HH:mm', new Date()))) return;
        if (driver.mustBeOffBy && isAfter(slotEnd, parse(driver.mustBeOffBy, 'HH:mm', new Date()))) return;

        let usePartner = partner;
        if (usePartner) {
          const busy = dayVisits.some(v =>
            (v.assignedCleanerIds || []).includes(usePartner!.id) &&
            v.startTime < format(slotEnd, 'HH:mm') &&
            format(addMinutes(parse(v.startTime, 'HH:mm', new Date()), v.durationMinutes), 'HH:mm') > slotStart
          );
          if (busy) usePartner = undefined;
        }

        const ids = usePartner ? [driver.id, usePartner.id] : [driver.id];
        const isRequestedTime = slotStart === editTime;
        const hasPref = ids.some(id => client.preferredCleaners.includes(id));

        if (isRequestedTime) {
          slots.push({
            priority: 1,
            title: `Squeeze in with ${driver.name}`,
            description: `Fits at requested time ${slotStart} in ${driver.name}'s route (${Math.round(gap.gapMin)} min gap)`,
            startTime: slotStart,
            cleanerIds: ids,
            driverName: driver.name,
            score: 100 + (hasPref ? 50 : 0) + (usePartner ? 20 : 0)
          });
        } else {
          slots.push({
            priority: 2,
            title: `Move to ${slotStart} with ${driver.name}`,
            description: `${driver.name} has a ${Math.round(gap.gapMin)} min gap at ${slotStart}`,
            startTime: slotStart,
            cleanerIds: ids,
            driverName: driver.name,
            score: 70 + (hasPref ? 50 : 0) + (usePartner ? 20 : 0)
          });
        }
      });
    });

    // Priority 3: Unscheduled cleaner
    const freeCleaners = activeCleaners.filter(c => {
      if (client.avoidCleaners.includes(c.id)) return false;
      const visitDay = new Date(targetDateStr + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const dayName = dayNames[visitDay.getDay()];
      if (c.unavailableDays?.includes(dayName)) return false;
      return !dayVisits.some(v => (v.assignedCleanerIds || []).includes(c.id));
    });

    const freeDrivers = freeCleaners.filter(c => c.isDriver);
    const freeNonDrivers = freeCleaners.filter(c => !c.isDriver);

    if (freeDrivers.length > 0) {
      const bestDriver = freeDrivers.find(d => client.preferredCleaners.includes(d.id)) || freeDrivers[0];
      const bestCleaner = freeNonDrivers.find(c => client.preferredCleaners.includes(c.id)) || freeNonDrivers[0];
      const slotStart = editTime;
      const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), duration);
      if (!client.notAfter || !isAfter(slotEnd, parse(client.notAfter, 'HH:mm', new Date()))) {
        const ids = bestCleaner ? [bestDriver.id, bestCleaner.id] : [bestDriver.id];
        slots.push({
          priority: 3,
          title: `Unscheduled: ${bestDriver.name}`,
          description: `${bestDriver.name}${bestCleaner ? ' + ' + bestCleaner.name : ''} — free all day`,
          startTime: slotStart,
          cleanerIds: ids,
          driverName: bestDriver.name,
          score: 30
        });
      }
    }

    // Priority 4: Relief driver (always available as fallback)
    slots.push({
      priority: 4,
      title: 'Relief Driver Route',
      description: `Create a new driver route for ${targetDateStr} at ${editTime}`,
      startTime: editTime,
      cleanerIds: [],
      score: 0
    });

    // Sort by score descending, but keep priority order
    slots.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.score - a.score;
    });

    // Only return the best of each priority
    const bestByPriority: MoveSuggestion[] = [];
    const seen = new Set<number>();
    slots.forEach(s => {
      if (!seen.has(s.priority)) {
        seen.add(s.priority);
        bestByPriority.push(s);
      }
    });

    return bestByPriority;
  }, [isEditing, editDate, editTime, visit.durationMinutes, client, cleaners, visits]);

  const previewViolations = (() => {
    if (!isEditing) return [];
    const previewVisit: Visit = {
      ...visit,
      date: editDate,
      startTime: editTime,
      assignedCleanerIds: editCleanerIds,
    };
    return checkConstraints([previewVisit], cleaners, clients, teams);
  })();

  const handleSave = () => {
    if (!onSave) return;

    // If relief driver was chosen, save it first
    if (acceptedSuggestion?.priority === 4 && reliefName && reliefAddress) {
      const reliefStops = [
        { type: 'depart', label: `Leave Home — ${reliefName}`, address: reliefAddress, arrivalTime: '', durationMin: 0, latLng: null, included: true },
        { type: 'clean', label: `Clean — ${visit.clientName}`, address: visit.clientAddress, arrivalTime: '', durationMin: visit.durationMinutes, targetTime: editTime, latLng: null, included: true },
        { type: 'home', label: `Arrive Home — ${reliefName}`, address: reliefAddress, arrivalTime: '', durationMin: 0, latLng: null, included: true }
      ];
      try {
        const raw = localStorage.getItem('hhce_relief_routes');
        const all = raw ? JSON.parse(raw) : {};
        all[editDate] = reliefStops;
        localStorage.setItem('hhce_relief_routes', JSON.stringify(all));
      } catch { /* ignore */ }
    }

    const updated: Visit = {
      ...visit,
      date: editDate,
      startTime: editTime,
      assignedCleanerIds: editCleanerIds,
    };
    onSave(updated);
    setIsEditing(false);
    setAcceptedSuggestion(null);
    setShowReliefForm(false);
  };

  const toggleCleaner = (id: string) => {
    setEditCleanerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const activeCleaners = cleaners.filter(c => c.active);

  const applySuggestion = (s: MoveSuggestion) => {
    setAcceptedSuggestion(s);
    if (s.startTime) setEditTime(s.startTime);
    if (s.cleanerIds && s.cleanerIds.length > 0) setEditCleanerIds(s.cleanerIds);
    if (s.priority === 4) setShowReliefForm(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-800">{visit.clientName}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {visit.jobType || 'Cleaning Visit'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && onSave && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 active:scale-95 transition-all"
                title="Edit visit"
              >
                <Pencil size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 active:scale-95 transition-all"
            >
              <X size={20} className="text-slate-500" />
            </button>          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Original violations */}
          {!isEditing && originalViolations.length > 0 && (
            <div className="space-y-2">
              {originalViolations.map(v => (
                <div
                  key={v.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-xs font-medium ${
                    v.severity === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {v.severity === 'error'
                    ? <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    : <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  }
                  {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Preview violations while editing */}
          {isEditing && previewViolations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Current Conflicts</p>
              {previewViolations.map(v => (
                <div key={v.id} className={`flex items-start gap-2 text-xs font-medium ${v.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                  {v.severity === 'error' ? <AlertCircle size={12} className="shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
                  {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Smart Suggestions */}
          {isEditing && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Smart Suggestions for {editDate}</p>
              {suggestions.map((s, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3 space-y-1.5 ${
                    acceptedSuggestion?.priority === s.priority
                      ? 'bg-blue-50 border-blue-300'
                      : s.priority === 1
                      ? 'bg-green-50 border-green-200'
                      : s.priority === 2
                      ? 'bg-amber-50 border-amber-200'
                      : s.priority === 3
                      ? 'bg-purple-50 border-purple-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white ${
                        s.priority === 1 ? 'bg-green-500' :
                        s.priority === 2 ? 'bg-amber-500' :
                        s.priority === 3 ? 'bg-purple-500' :
                        'bg-slate-500'
                      }`}>
                        P{s.priority}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{s.title}</span>
                    </div>
                    {acceptedSuggestion?.priority === s.priority ? (
                      <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                        <Check size={12} /> Selected
                      </span>
                    ) : (
                      <button
                        onClick={() => applySuggestion(s)}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        {s.priority === 4 ? 'Set Up' : 'Accept'}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600">{s.description}</p>
                  {s.startTime && (
                    <p className="text-[10px] font-bold text-slate-700">
                      Time: {s.startTime} • Cleaners: {s.cleanerIds?.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ') || 'TBD'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Relief Driver Form */}
          {isEditing && showReliefForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                <Bus size={14} /> Relief Driver Setup
              </h3>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Driver Name</label>
                <input
                  type="text"
                  value={reliefName}
                  onChange={e => setReliefName(e.target.value)}
                  placeholder="e.g. Backup Driver"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Home Address</label>
                <input
                  type="text"
                  value={reliefAddress}
                  onChange={e => setReliefAddress(e.target.value)}
                  placeholder="e.g. 123 Main St, Kitchener"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <p className="text-[10px] text-slate-500">
                Route: {reliefName || 'Driver'} home → {visit.clientName} → {reliefName || 'Driver'} home
              </p>
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</span>
              </div>
              {isEditing ? (
                <input
                  type="date"
                  value={editDate}
                  onChange={e => { setEditDate(e.target.value); setAcceptedSuggestion(null); }}
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-xs font-bold text-slate-800">{visit.date}</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Start Time</span>
              </div>
              {isEditing ? (
                <input
                  type="time"
                  value={editTime}
                  onChange={e => { setEditTime(e.target.value); setAcceptedSuggestion(null); }}
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-xs font-bold text-slate-800">{visit.startTime}</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Duration</span>
              </div>
              <p className="text-xs font-bold text-slate-800">{formatHrsMins(visit.durationMinutes || 0)} ({visit.durationMinutes || 0} min)</p>
            </div>
          </div>

          {/* Address */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={12} className="text-slate-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Address</span>
            </div>
            <p className="text-xs font-medium text-slate-700">{visit.clientAddress || client?.address || 'No address on file'}</p>
            {visit.clientZone && (
              <p className="text-[10px] text-slate-500 mt-1">Zone: {visit.clientZone}</p>
            )}
          </div>

          {/* Assigned Cleaners */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <User size={12} className="text-slate-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                {isEditing ? `Select Cleaners (${editCleanerIds.length})` : 'Assigned Cleaners'}
              </span>
            </div>
            {isEditing ? (
              <div className="flex flex-wrap gap-1.5">
                {activeCleaners.map(c => {
                  const isSelected = editCleanerIds.includes(c.id);
                  const isAvoided = client?.avoidCleaners.includes(c.id);
                  const isPreferred = client?.preferredCleaners.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => { if (!isAvoided) toggleCleaner(c.id); }}
                      disabled={isAvoided}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 flex items-center gap-1 ${
                        isAvoided
                          ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed opacity-60'
                          : isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSelected ? 'white' : (c.color || '#94a3b8') }} />
                      {c.isDriver && <Car size={8} className={isSelected ? 'text-white' : 'text-blue-500'} />}
                      {isPreferred && <Star size={8} className={isSelected ? 'text-yellow-200' : 'text-amber-500'} />}
                      {isAvoided && <Ban size={8} className="text-red-500" />}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignedCleaners.length > 0 ? (
                  assignedCleaners.map(c => (
                    <span
                      key={c!.id}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c!.color || '#94a3b8' }} />
                      {c!.name}
                      {c!.isDriver && <span className="text-blue-600">(Driver)</span>}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">No cleaners assigned</span>
                )}
              </div>
            )}
          </div>

          {/* Client notes */}
          {client?.notes && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-amber-500" />
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">House Notes</span>
              </div>
              <p className="text-xs text-amber-800 font-medium">{client.notes}</p>
            </div>
          )}

          {/* Client instructions */}
          {client?.instructions && (
            <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-orange-500" />
                <span className="text-[9px] font-bold text-orange-600 uppercase tracking-wider">Instructions</span>
              </div>
              <p className="text-xs text-orange-800 font-medium">{client.instructions}</p>
            </div>
          )}

          {/* Visit notes */}
          {visit.notes && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-blue-500" />
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Visit Notes</span>
              </div>
              <p className="text-xs text-blue-800 font-medium">{visit.notes}</p>
            </div>
          )}

          {/* Edit action buttons */}
          {isEditing && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={editCleanerIds.length === 0 || (acceptedSuggestion?.priority === 4 && (!reliefName || !reliefAddress))}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-40 active:scale-95 flex items-center justify-center gap-2"
              >
                <Save size={14} /> Save Changes
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditDate(visit.date);
                  setEditTime(visit.startTime);
                  setEditCleanerIds(visit.assignedCleanerIds || []);
                  setAcceptedSuggestion(null);
                  setShowReliefForm(false);
                }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Cancel
              </button>
            </div>
          )}

          {/* Contact */}
          {!isEditing && (client?.phone || client?.email) && (
            <div className="flex gap-2">
              {client?.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors active:scale-95"
                >
                  <Phone size={14} /> Call
                </a>
              )}
              {client?.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors active:scale-95"
                >
                  <Mail size={14} /> Email
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};