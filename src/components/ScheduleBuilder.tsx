import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Visit, Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Calendar, Clock, ChevronLeft, ChevronRight, AlertCircle, Upload, Download, X, Car, Star, Ban, Check, Pencil } from 'lucide-react';
import { format, addDays, subDays, isSameDay, parse, addMinutes, isBefore, isAfter } from 'date-fns';
import { checkConstraints } from '../utils/scheduler';
import { parseVisitsCSV } from '../utils/csvParser';
import { formatTotalHours } from '../utils/hours';
import { showToast } from '../utils/toast';

interface Suggestion {
  startTime: string;
  cleanerIds: string[];
  driverId: string;
  score: number;
  reason: string;
}

export const ScheduleBuilder: React.FC = () => {
  const { visits, setVisits, cleaners, clients, teams, selectedDate, setSelectedDate } = useAppContext();
  const [showAdd, setShowAdd] = useState(false);
  const [newVisit, setNewVisit] = useState<Partial<Visit>>({
    clientId: '', startTime: '09:00', assignedTeamId: '', durationMinutes: 120, assignedCleanerIds: []
  });
  const [csvPreview, setCsvPreview] = useState<Partial<Visit>[] | null>(null);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Visit>>({});

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = visits.filter(v => v.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const selectedClient = clients.find(c => c.id === newVisit.clientId);

  // ── SMART SUGGESTION ENGINE ──
  const suggestion = useMemo((): Suggestion | null => {
    if (!selectedClient) return null;
    const duration = newVisit.durationMinutes || selectedClient.durationMinutes || 120;
    const activeCleaners = cleaners.filter(c => c.active);
    const todayVisits = dayVisits.filter(v => !v.cancelled);

    // Build driver routes for today
    const driverRoutes: Record<string, Visit[]> = {};
    todayVisits.forEach(v => {
      const ids = v.assignedCleanerIds || [];
      const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
      if (driver) {
        if (!driverRoutes[driver.id]) driverRoutes[driver.id] = [];
        driverRoutes[driver.id].push(v);
      }
    });
    Object.values(driverRoutes).forEach(route => route.sort((a, b) => a.startTime.localeCompare(b.startTime)));

    const slots: Suggestion[] = [];

    // 1) Check gaps in existing driver routes
    Object.entries(driverRoutes).forEach(([driverId, route]) => {
      const driver = activeCleaners.find(c => c.id === driverId);
      if (!driver) return;

      // Find cleaners already paired with this driver today
      const pairedToday = new Set<string>();
      route.forEach(v => (v.assignedCleanerIds || []).forEach(id => { if (id !== driverId) pairedToday.add(id); }));

      // Pick best compatible partner (preferred > already-paired > any)
      const pickPartner = (): Cleaner | undefined => {
        const candidates = activeCleaners.filter(c => {
          if (c.id === driverId) return false;
          if (!c.active) return false;
          if (selectedClient.avoidCleaners.includes(c.id)) return false;
          if (c.cannotWorkWith.includes(driverId) || driver.cannotWorkWith.includes(c.id)) return false;
          return true;
        });
        return candidates.find(c => selectedClient.preferredCleaners.includes(c.id) && pairedToday.has(c.id))
          || candidates.find(c => pairedToday.has(c.id))
          || candidates.find(c => selectedClient.preferredCleaners.includes(c.id))
          || candidates[0];
      };

      const partner = pickPartner();

      // Gaps between visits
      for (let i = 0; i < route.length - 1; i++) {
        const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), route[i].durationMinutes);
        const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
        const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
        if (gapMin < duration + 15) continue;

        const slotStart = format(addMinutes(curEnd, 15), 'HH:mm');
        const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), duration);

        if (selectedClient.notBefore && isBefore(parse(slotStart, 'HH:mm', new Date()), parse(selectedClient.notBefore, 'HH:mm', new Date()))) continue;
        if (selectedClient.notAfter && isAfter(slotEnd, parse(selectedClient.notAfter, 'HH:mm', new Date()))) continue;
        if (driver.mustBeOffBy && isAfter(slotEnd, parse(driver.mustBeOffBy, 'HH:mm', new Date()))) continue;

        let usePartner = partner;
        if (usePartner) {
          const busy = todayVisits.some(v =>
            (v.assignedCleanerIds || []).includes(usePartner!.id) &&
            v.startTime < format(slotEnd, 'HH:mm') &&
            format(addMinutes(parse(v.startTime, 'HH:mm', new Date()), v.durationMinutes), 'HH:mm') > slotStart
          );
          if (busy) usePartner = undefined;
        }

        const ids = usePartner ? [driver.id, usePartner.id] : [driver.id];
        const hasPref = ids.some(id => selectedClient.preferredCleaners.includes(id));
        slots.push({ startTime: slotStart, cleanerIds: ids, driverId: driver.id, score: 100 + (hasPref ? 50 : 0) + (usePartner ? 20 : 0), reason: `Fits in ${driver.name}'s route (${Math.round(gapMin)} min gap)` });
      }

      // After last visit
      if (route.length > 0) {
        const last = route[route.length - 1];
        const lastEnd = addMinutes(parse(last.startTime, 'HH:mm', new Date()), last.durationMinutes);
        const slotStart = format(addMinutes(lastEnd, 15), 'HH:mm');
        const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), duration);

        if (selectedClient.notBefore && isBefore(parse(slotStart, 'HH:mm', new Date()), parse(selectedClient.notBefore, 'HH:mm', new Date()))) {
          /* too early */
        } else if (selectedClient.notAfter && isAfter(slotEnd, parse(selectedClient.notAfter, 'HH:mm', new Date()))) {
          /* too late for client */
        } else if (driver.mustBeOffBy && isAfter(slotEnd, parse(driver.mustBeOffBy, 'HH:mm', new Date()))) {
          /* driver off duty */
        } else {
          let usePartner = partner;
          if (usePartner) {
            const busy = todayVisits.some(v =>
              (v.assignedCleanerIds || []).includes(usePartner!.id) &&
              v.startTime < format(slotEnd, 'HH:mm') &&
              format(addMinutes(parse(v.startTime, 'HH:mm', new Date()), v.durationMinutes), 'HH:mm') > slotStart
            );
            if (busy) usePartner = undefined;
          }
          const ids = usePartner ? [driver.id, usePartner.id] : [driver.id];
          const hasPref = ids.some(id => selectedClient.preferredCleaners.includes(id));
          slots.push({ startTime: slotStart, cleanerIds: ids, driverId: driver.id, score: 80 + (hasPref ? 50 : 0) + (usePartner ? 20 : 0), reason: `After ${driver.name}'s last visit` });
        }
      }
    });

    // 2) Relief driver fallback — unscheduled drivers
    if (slots.length === 0) {
      const freeDrivers = activeCleaners.filter(c => {
        if (!c.isDriver) return false;
        if (selectedClient.avoidCleaners.includes(c.id)) return false;
        return !todayVisits.some(v => (v.assignedCleanerIds || []).includes(c.id));
      });
      const freeCleaners = activeCleaners.filter(c => {
        if (c.isDriver) return false;
        if (selectedClient.avoidCleaners.includes(c.id)) return false;
        return !todayVisits.some(v => (v.assignedCleanerIds || []).includes(c.id));
      });

      if (freeDrivers.length > 0) {
        const bestDriver = freeDrivers.find(d => selectedClient.preferredCleaners.includes(d.id)) || freeDrivers[0];
        const bestCleaner = freeCleaners.find(c => selectedClient.preferredCleaners.includes(c.id)) || freeCleaners[0];
        const slotStart = selectedClient.notBefore || '09:00';
        const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), duration);

        if (!selectedClient.notAfter || !isAfter(slotEnd, parse(selectedClient.notAfter, 'HH:mm', new Date()))) {
          const ids = bestCleaner ? [bestDriver.id, bestCleaner.id] : [bestDriver.id];
          slots.push({ startTime: slotStart, cleanerIds: ids, driverId: bestDriver.id, score: 25, reason: `Relief driver: ${bestDriver.name}${bestCleaner ? ' + ' + bestCleaner.name : ''} (new route)` });
        }
      }
    }

    // Hard safety filter: never suggest cleaners the client avoids
    const validSlots = selectedClient
      ? slots.filter(s => !s.cleanerIds.some(id => selectedClient.avoidCleaners.includes(id)))
      : slots;
    validSlots.sort((a, b) => b.score - a.score);
    return validSlots[0] || null;
  }, [selectedClient, newVisit.durationMinutes, dayVisits, cleaners]);

  // Suggestion is displayed but NEVER auto-applied — user has final say

  const addVisit = () => {
    if (!newVisit.clientId) return;
    const client = clients.find(c => c.id === newVisit.clientId);
    if (!client) return;

    const assignedCleanerIds = (newVisit.assignedCleanerIds || []).filter(id => cleaners.find(c => c.id === id)?.active);
    if (assignedCleanerIds.length === 0) {
      alert('Please select at least one active cleaner');
      return;
    }

    const visit: Visit = {
      id: uuidv4(),
      clientId: client.id,
      clientName: client.name,
      clientAddress: client.address,
      clientZone: client.zone,
      date: dateStr,
      startTime: newVisit.startTime || '09:00',
      durationMinutes: newVisit.durationMinutes || client.durationMinutes || 120,
      assignedTeamId: '',
      assignedCleanerIds,
      cancelled: false,
      teamName: undefined
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

  const startEdit = (visit: Visit) => {
    setEditingVisitId(visit.id);
    setEditForm({
      clientId: visit.clientId,
      startTime: visit.startTime,
      durationMinutes: visit.durationMinutes,
      date: visit.date,
      assignedCleanerIds: [...(visit.assignedCleanerIds || [])],
      notes: visit.notes || '',
    });
    setShowAdd(false);
    setCsvPreview(null);
  };

  const cancelEdit = () => {
    setEditingVisitId(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (!editingVisitId) return;
    const assignedIds = (editForm.assignedCleanerIds || []).filter(id => cleaners.find(c => c.id === id)?.active);
    if (assignedIds.length === 0) {
      alert('Please select at least one active cleaner');
      return;
    }
    setVisits(visits.map(v => {
      if (v.id !== editingVisitId) return v;
      return {
        ...v,
        date: editForm.date || v.date,
        startTime: editForm.startTime || v.startTime,
        durationMinutes: editForm.durationMinutes || v.durationMinutes,
        assignedCleanerIds: assignedIds,
        notes: editForm.notes !== undefined ? editForm.notes : v.notes,
      };
    }));
    setEditingVisitId(null);
    setEditForm({});
  };

  const editToggleCleaner = (id: string) => {
    const current = editForm.assignedCleanerIds || [];
    setEditForm({
      ...editForm,
      assignedCleanerIds: current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    });
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(subDays(selectedDate, 3), i));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseVisitsCSV(text, clients, teams, cleaners);
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const confirmCsvImport = () => {
    if (!csvPreview || csvPreview.length === 0) return;
    const updatedVisits = [...visits];
    csvPreview.forEach((p) => {
      const importedDate = p.date;
      const importedClientName = p.clientName?.trim();
      const importedStartTime = p.startTime;
      if (!importedDate || !importedClientName || !importedStartTime) return;
      const existingIndex = updatedVisits.findIndex(v =>
        v.date === importedDate &&
        v.clientName.trim().toLowerCase() === importedClientName.toLowerCase()
      );
      if (existingIndex >= 0) {
        const existing = updatedVisits[existingIndex];
        updatedVisits[existingIndex] = {
          ...existing,
          clientId: p.clientId || existing.clientId,
          clientAddress: p.clientAddress || existing.clientAddress,
          clientZone: p.clientZone || existing.clientZone,
          date: p.date || existing.date,
          startTime: p.startTime || existing.startTime,
          durationMinutes: p.durationMinutes || existing.durationMinutes,
          assignedTeamId: p.assignedTeamId || existing.assignedTeamId,
          assignedCleanerIds: p.assignedCleanerIds || existing.assignedCleanerIds,
          teamName: p.teamName || existing.teamName,
          cancelled: p.cancelled ?? existing.cancelled,
        };
      } else {
        updatedVisits.push({ ...p, id: uuidv4(), cancelled: false } as Visit);
      }
    });
    setVisits(updatedVisits);
    setCsvPreview(null);
  };

  const handleExport = () => {
    if (visits.length === 0) {
      showToast('No visits to export', 'warning');
      return;
    }
    const headers = ['Date', 'Client', 'Address', 'Zone', 'Start Time', 'Duration (min)', 'Cleaners', 'Cancelled', 'Notes'];
    const rows = visits.map(v => {
      const cleanerNames = (v.assignedCleanerIds || [])
        .map(id => cleaners.find(c => c.id === id)?.name)
        .filter(Boolean)
        .join('; ');
      return [
        v.date,
        v.clientName,
        v.clientAddress || '',
        v.clientZone || '',
        v.startTime,
        v.durationMinutes,
        cleanerNames,
        v.cancelled ? 'Yes' : 'No',
        v.notes || ''
      ];
    });
    const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hhce-visits-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${visits.length} visits to CSV`, 'success');
  };

  const toggleCleaner = (id: string) => {
    const current = newVisit.assignedCleanerIds || [];
    setNewVisit({
      ...newVisit,
      assignedCleanerIds: current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    });
  };

  const previewViolations = (() => {
    if (!newVisit.clientId || (newVisit.assignedCleanerIds || []).length === 0) return [];
    const client = clients.find(c => c.id === newVisit.clientId);
    if (!client) return [];
    const previewVisit: Visit = {
      id: 'preview', clientId: client.id, clientName: client.name, clientAddress: client.address, clientZone: client.zone,
      date: dateStr, startTime: newVisit.startTime || '09:00',
      durationMinutes: newVisit.durationMinutes || client.durationMinutes || 120,
      assignedTeamId: '', assignedCleanerIds: newVisit.assignedCleanerIds || [],
      cancelled: false
    };
    return checkConstraints([previewVisit], cleaners, clients, teams);
  })();

  // Cleaner status helpers
  const getCleanerStatus = (cleaner: Cleaner): { label: string; color: string; icon?: string } => {
    if (selectedClient?.avoidCleaners.includes(cleaner.id)) return { label: 'Avoided by client', color: 'bg-red-100 text-red-600 border-red-200', icon: 'ban' };
    if (!cleaner.active) return { label: cleaner.inactiveUntil ? `Off until ${cleaner.inactiveUntil}` : 'Inactive — no return date', color: 'bg-slate-100 text-slate-400 border-slate-200', icon: 'ban' };

    const cleanerVisits = dayVisits.filter(v => !v.cancelled && (v.assignedCleanerIds || []).includes(cleaner.id));
    if (cleanerVisits.length === 0) {
      if (cleaner.isDriver) return { label: 'Free — relief driver', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'bus' };
      return { label: 'Not scheduled', color: 'bg-slate-50 text-slate-500 border-slate-200', icon: 'clock' };
    }

    const lastVisit = cleanerVisits.sort((a, b) => a.startTime.localeCompare(b.startTime))[cleanerVisits.length - 1];
    const lastEnd = format(addMinutes(parse(lastVisit.startTime, 'HH:mm', new Date()), lastVisit.durationMinutes), 'HH:mm');

    if (cleaner.isDriver) {
      const routePartners = new Set<string>();
      cleanerVisits.forEach(v => (v.assignedCleanerIds || []).forEach(id => { if (id !== cleaner.id) routePartners.add(id); }));
      const partnerNames = Array.from(routePartners).map(pid => cleaners.find(c => c.id === pid)?.name).filter(Boolean).join(', ');
      return { label: `Route ends ${lastEnd}${partnerNames ? ' with ' + partnerNames : ''}`, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'car' };
    }
    return { label: `Done at ${lastEnd}`, color: 'bg-green-50 text-green-700 border-green-200', icon: 'check' };
  };
  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="text-purple-600" size={24} /> Schedule Builder
        </h2>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors flex items-center gap-2 text-sm font-bold active:scale-95"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
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
            {csvPreview.slice(0, 10).map((v, i) => {
              const isExisting = visits.some(existing =>
                existing.date === v.date &&
                existing.clientName.trim().toLowerCase() === (v.clientName || '').trim().toLowerCase()
              );
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-slate-50 last:border-0">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isExisting ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {isExisting ? 'UPDATE' : 'NEW'}
                  </span>
                  <span className="font-bold text-slate-700 min-w-[80px]">{v.date}</span>
                  <span className="font-bold text-slate-800">{v.startTime}</span>
                  <span className="text-slate-500">{v.clientName}</span>
                  <span className="text-slate-400">{formatTotalHours(v.durationMinutes || 120)}</span>
                </div>
              );
            })}
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

          {/* Suggestion banner */}
          {suggestion && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <Check size={16} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-800">Suggested: {suggestion.startTime}</p>
                <p className="text-[10px] text-blue-600 mt-0.5">{suggestion.reason}</p>
                <p className="text-[10px] text-blue-500 mt-0.5">
                  Cleaners: {suggestion.cleanerIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                </p>
              </div>
              <button
                onClick={() => {
                  setNewVisit(prev => ({
                    ...prev,
                    startTime: suggestion.startTime,
                    assignedCleanerIds: suggestion.cleanerIds,
                    assignedTeamId: ''
                  }));
                }}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 active:scale-95 shrink-0"
              >
                Accept
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Client *</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                value={newVisit.clientId}
                onChange={e => setNewVisit({ ...newVisit, clientId: e.target.value, assignedCleanerIds: [] })}
              >
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.zone ? `(${c.zone})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start Time</label>
              <div className="flex gap-2">
                <input
                  type="time"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={newVisit.startTime}
                  onChange={e => setNewVisit({ ...newVisit, startTime: e.target.value })}
                />
                {selectedClient?.notBefore && (
                  <span className="text-[10px] text-slate-400 font-medium self-center shrink-0">
                    {selectedClient.notBefore}–{selectedClient.notAfter || 'end'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Duration (hrs)</label>
              <input
                type="number"
                step="0.5"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={(newVisit.durationMinutes || 120) / 60}
                onChange={e => setNewVisit({ ...newVisit, durationMinutes: Math.round(parseFloat(e.target.value) * 60) || 120 })}
              />
            </div>
            <div className="flex items-end">
              <span className="text-xs text-slate-500 font-medium">
                = {formatTotalHours(newVisit.durationMinutes || 120)}
              </span>
            </div>
          </div>

          {/* All cleaners with status indicators */}
          {cleaners.filter(c => c.active).length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Select Cleaners ({(newVisit.assignedCleanerIds || []).length} selected)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {cleaners.filter(c => c.active).map(c => {
                  const isSelected = (newVisit.assignedCleanerIds || []).includes(c.id);
                  const isAvoided = selectedClient?.avoidCleaners.includes(c.id);
                  const isPreferred = selectedClient?.preferredCleaners.includes(c.id);
                  const status = getCleanerStatus(c);

                  return (
                    <button
                      key={c.id}
                      onClick={() => { if (!isAvoided) toggleCleaner(c.id); }}
                      disabled={isAvoided}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                        isAvoided
                          ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed opacity-60'
                          : isSelected
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : status.color
                      }`}
                      title={status.label}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? 'white' : (c.color || '#94a3b8') }} />
                      {c.isDriver && <Car size={10} className={isSelected ? 'text-white' : 'text-blue-500'} />}
                      {isPreferred && <Star size={10} className={isSelected ? 'text-yellow-200' : 'text-amber-500'} />}
                      {isAvoided && <Ban size={10} className="text-red-500" />}
                      <span>{c.name}</span>
                      {!isSelected && !isAvoided && (
                        <span className="text-[9px] font-medium opacity-70 ml-0.5">{status.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {(newVisit.assignedCleanerIds || []).length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1 font-medium">No cleaners selected — pick at least one driver or cleaner</p>
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
            disabled={!newVisit.clientId || (newVisit.assignedCleanerIds || []).length === 0}
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

          const isEditing = editingVisitId === visit.id;
          return (
            <div key={visit.id} className={`bg-white rounded-2xl border shadow-sm ${isEditing ? 'p-4 space-y-3 border-purple-300' : 'p-3 flex items-center gap-3 ' + (hasError ? 'border-red-300' : 'border-slate-200')}`}>
              {isEditing ? (
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-800">Edit Visit — {visit.clientName}</h4>
                    <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={editForm.date || visit.date}
                        onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Start Time</label>
                      <input
                        type="time"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={editForm.startTime || visit.startTime}
                        onChange={e => setEditForm({ ...editForm, startTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Duration (hrs)</label>
                      <input
                        type="number"
                        step="0.5"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={(editForm.durationMinutes || visit.durationMinutes || 120) / 60}
                        onChange={e => setEditForm({ ...editForm, durationMinutes: Math.round(parseFloat(e.target.value) * 60) || 120 })}
                      />
                    </div>
                    <div className="flex items-end">
                      <span className="text-xs text-slate-500 font-medium">
                        = {formatTotalHours(editForm.durationMinutes || visit.durationMinutes || 120)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Cleaners ({(editForm.assignedCleanerIds || visit.assignedCleanerIds || []).length} selected)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {cleaners.filter(c => c.active).map(c => {
                        const isSelected = (editForm.assignedCleanerIds || visit.assignedCleanerIds || []).includes(c.id);
                        const isAvoided = client?.avoidCleaners.includes(c.id);
                        const isPreferred = client?.preferredCleaners.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => { if (!isAvoided) editToggleCleaner(c.id); }}
                            disabled={isAvoided}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
                              isAvoided
                                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed opacity-60'
                                : isSelected
                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isSelected ? 'white' : (c.color || '#94a3b8') }} />
                            {c.isDriver && <Car size={10} className={isSelected ? 'text-white' : 'text-blue-500'} />}
                            {isPreferred && <Star size={10} className={isSelected ? 'text-yellow-200' : 'text-amber-500'} />}
                            {isAvoided && <Ban size={10} className="text-red-500" />}
                            <span>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes / Details</label>
                    <textarea
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      rows={2}
                      value={editForm.notes || ''}
                      onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Service notes, special instructions..."
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">Changing the date will move this visit to that day on all calendars.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors active:scale-[0.98]"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors active:scale-[0.98]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="shrink-0 w-14 text-center">
                    <div className="text-sm font-black text-slate-800">{visit.startTime}</div>
                    <div className="text-[9px] text-slate-400 font-bold">{formatTotalHours(visit.durationMinutes)}</div>
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
                          {c!.isDriver && <Car size={8} className="text-blue-500" />}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(visit)}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};