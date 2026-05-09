import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Visit } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Calendar, Clock, ChevronLeft, ChevronRight, AlertCircle, Upload, X } from 'lucide-react';
import { format, addDays, subDays, isSameDay } from 'date-fns';
import { checkConstraints } from '../utils/scheduler';
import { parseVisitsCSV } from '../utils/csvParser';

const formatDurationHours = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hrs}.00`;
  if (rem === 15) return `${hrs}.25`;
  if (rem === 30) return `${hrs}.50`;
  if (rem === 45) return `${hrs}.75`;
  return `${(minutes / 60).toFixed(2)}`;
};

export const ScheduleBuilder: React.FC = () => {
  const { visits, setVisits, cleaners, clients, teams } = useAppContext();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [newVisit, setNewVisit] = useState<Partial<Visit>>({
    clientId: '', startTime: '09:00', assignedTeamId: '', durationMinutes: 120, assignedCleanerIds: []
  });
  const [csvPreview, setCsvPreview] = useState<Partial<Visit>[] | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = visits.filter(v => v.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const addVisit = () => {
    if (!newVisit.clientId || !newVisit.assignedTeamId) return;
    const client = clients.find(c => c.id === newVisit.clientId);
    if (!client) return;
    const team = teams.find(t => t.id === newVisit.assignedTeamId);

    const assignedCleanerIds = (newVisit.assignedCleanerIds || []).length > 0
      ? newVisit.assignedCleanerIds
      : team?.cleanerIds || [];

    const visit: Visit = {
      id: uuidv4(),
      clientId: client.id,
      clientName: client.name,
      clientAddress: client.address,
      clientZone: client.zone,
      date: dateStr,
      startTime: newVisit.startTime || '09:00',
      durationMinutes: newVisit.durationMinutes || client.durationMinutes || 120,
      assignedTeamId: newVisit.assignedTeamId,
      assignedCleanerIds,
      cancelled: false,
      teamName: team?.name
    };
    setVisits([...visits, visit]);
    setNewVisit({ clientId: '', startTime: '09:00', assignedTeamId: '', durationMinutes: 120, assignedCleanerIds: [] });
    setShowAdd(false);
  };

  const removeVisit = (id: string) => {
    if (confirm('Remove this visit?')) setVisits(visits.filter(v => v.id !== id));
  };

  const toggleCancel = (id: string) => {
    setVisits(visits.map(v => v.id === id ? { ...v, cancelled: !v.cancelled } : v));
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(subDays(selectedDate, 3), i));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseVisitsCSV(text, clients, teams);
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const confirmCsvImport = () => {
    if (!csvPreview || csvPreview.length === 0) return;
    const fullVisits = csvPreview.map(p => ({
      ...p,
      id: uuidv4(),
      cancelled: false,
    })) as Visit[];
    setVisits([...visits, ...fullVisits]);
    setCsvPreview(null);
  };

  const toggleCleaner = (id: string) => {
    const current = newVisit.assignedCleanerIds || [];
    setNewVisit({
      ...newVisit,
      assignedCleanerIds: current.includes(id)
        ? current.filter(x => x !== id)
        : [...current, id]
    });
  };

  const previewViolations = (() => {
    if (!newVisit.clientId || !newVisit.assignedTeamId) return [];
    const client = clients.find(c => c.id === newVisit.clientId);
    const team = teams.find(t => t.id === newVisit.assignedTeamId);
    if (!client || !team) return [];
    const previewVisit: Visit = {
      id: 'preview', clientId: client.id, clientName: client.name, clientAddress: client.address, clientZone: client.zone,
      date: dateStr, startTime: newVisit.startTime || '09:00',
      durationMinutes: newVisit.durationMinutes || client.durationMinutes || 120,
      assignedTeamId: team.id, assignedCleanerIds: newVisit.assignedCleanerIds || team.cleanerIds,
      cancelled: false, teamName: team.name
    };
    return checkConstraints([previewVisit], cleaners, clients, teams);
  })();

  const teamCleaners = (() => {
    const team = teams.find(t => t.id === newVisit.assignedTeamId);
    if (!team) return [];
    return cleaners.filter(c => team.cleanerIds.includes(c.id));
  })();

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="text-purple-600" size={24} /> Schedule Builder
        </h2>
        <div className="flex gap-2">
          <label className="px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl cursor-pointer hover:bg-purple-100 transition-colors flex items-center gap-2 text-sm font-bold active:scale-95">
            <Upload size={16} />
            <span className="hidden sm:inline">Import CSV</span>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => { setShowAdd(!showAdd); setCsvPreview(null); }}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors shadow-md active:scale-95 flex items-center gap-2"
          >
            <Plus size={16} /> {showAdd ? 'Close' : 'Add'}
          </button>
        </div>
      </div>

      {csvPreview && (
        <div className="bg-white rounded-2xl border border-purple-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-purple-800 flex items-center gap-2">
              <Upload size={16} /> CSV Import Preview ({csvPreview.length} visits)
            </h3>
            <button onClick={() => setCsvPreview(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl">
            {csvPreview.slice(0, 10).map((v, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-slate-50 last:border-0">
                <span className="font-bold text-slate-700 min-w-[80px]">{v.date}</span>
                <span className="font-bold text-slate-800">{v.startTime}</span>
                <span className="text-slate-500">{v.clientName}</span>
                <span className="text-slate-400">{formatDurationHours(v.durationMinutes || 120)} hrs</span>
              </div>
            ))}
            {csvPreview.length > 10 && (
              <p className="text-center text-[10px] text-slate-400 py-2">...and {csvPreview.length - 10} more</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmCsvImport} className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 active:scale-[0.98]">
              Import All
            </button>
            <button onClick={() => setCsvPreview(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 active:scale-[0.98]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setSelectedDate(subDays(selectedDate, 7))} className="p-1.5 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <span className="text-sm font-bold text-slate-600">{format(selectedDate, 'MMMM yyyy')}</span>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="p-1.5 rounded-lg hover:bg-slate-100">
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>
        <div className="flex justify-between gap-1">
          {weekDays.map(d => {
            const isSelected = isSameDay(d, selectedDate);
            const ds = format(d, 'yyyy-MM-dd');
            const count = visits.filter(v => v.date === ds && !v.cancelled).length;
            return (
              <button
                key={ds}
                onClick={() => { setSelectedDate(d); setShowAdd(false); }}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl flex-1 transition-all active:scale-95 ${
                  isSelected ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className="text-[9px] font-bold uppercase">{format(d, 'EEE')}</span>
                <span className="text-sm font-black">{format(d, 'd')}</span>
                <span className={`text-[9px] font-bold px-1 rounded ${isSelected ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Add Visit for {format(selectedDate, 'EEEE, MMM d')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Client *</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                value={newVisit.clientId}
                onChange={e => setNewVisit({ ...newVisit, clientId: e.target.value })}
              >
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.zone ? `(${c.zone})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Team *</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                value={newVisit.assignedTeamId}
                onChange={e => setNewVisit({ ...newVisit, assignedTeamId: e.target.value, assignedCleanerIds: [] })}
              >
                <option value="">Select team...</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start Time</label>
              <input type="time" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={newVisit.startTime} onChange={e => setNewVisit({ ...newVisit, startTime: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Duration (min)</label>
              <input type="number" step="15" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={newVisit.durationMinutes} onChange={e => setNewVisit({ ...newVisit, durationMinutes: parseInt(e.target.value) || 120 })} />
            </div>
            <div className="flex items-end">
              <span className="text-xs text-slate-500 font-medium">
                = {formatDurationHours(newVisit.durationMinutes || 120)} hrs
              </span>
            </div>
          </div>

          {teamCleaners.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Assigned Cleaners ({teamCleaners.length} available, pick 1–5)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {teamCleaners.map(c => {
                  const isSelected = (newVisit.assignedCleanerIds || []).includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCleaner(c.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? 'white' : (c.color || '#94a3b8') }} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {(newVisit.assignedCleanerIds || []).length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">No cleaners selected — will default to all team members</p>
              )}
            </div>
          )}

          {previewViolations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              {previewViolations.map((v, i) => (
                <p key={i} className={`text-[11px] font-bold flex items-center gap-1 ${v.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                  <AlertCircle size={10} /> {v.message}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={addVisit}
            disabled={!newVisit.clientId || !newVisit.assignedTeamId}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-40 transition-colors active:scale-[0.98]"
          >
            Add Visit
          </button>
        </div>
      )}

      <div className="space-y-2">
        {dayVisits.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300">
            <Clock className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-slate-500 text-sm">No visits on this day yet.</p>
          </div>
        )}
        {dayVisits.map(visit => {
          const client = clients.find(c => c.id === visit.clientId);
          const team = teams.find(t => t.id === visit.assignedTeamId);
          const vios = checkConstraints([visit], cleaners, clients, teams);
          const hasError = vios.some(v => v.severity === 'error');

          let assignedCleanerIds = visit.assignedCleanerIds || [];
          if (assignedCleanerIds.length === 0 && team) {
            assignedCleanerIds = team.cleanerIds;
          }
          const assignedCleaners = assignedCleanerIds
            .map(id => cleaners.find(c => c.id === id))
            .filter(Boolean);

          return (
            <div key={visit.id} className={`bg-white rounded-2xl border p-3 shadow-sm flex items-center gap-3 ${hasError ? 'border-red-300' : 'border-slate-200'}`}>
              <div className="shrink-0 w-14 text-center">
                <div className="text-sm font-black text-slate-800">{visit.startTime}</div>
                <div className="text-[9px] text-slate-400 font-bold">{formatDurationHours(visit.durationMinutes)} hrs</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-sm truncate ${visit.cancelled ? 'line-through text-slate-400' : 'text-slate-800'}`}>{visit.clientName}</span>
                  {client?.zone && <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold shrink-0">{client.zone}</span>}
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-0.5">{visit.clientAddress}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {assignedCleaners.map(c => (
                    <span key={c!.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: c!.color || '#94a3b8' }} />
                      {c!.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleCancel(visit.id)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                    visit.cancelled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                  }`}
                >
                  {visit.cancelled ? 'Restore' : 'Cancel'}
                </button>
                <button onClick={() => removeVisit(visit.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};