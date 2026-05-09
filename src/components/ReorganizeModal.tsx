import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { AlertTriangle, UserX, Home, CheckCircle2, MessageSquare, Zap, RotateCcw, Phone, ChevronRight, AlertCircle, Users, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { reoptimizeSchedule, checkConstraints, generateCallList } from '../utils/scheduler';
import type { ScheduleChange, CallItem } from '../types';

export const ReorganizeModal: React.FC = () => {
  const { cleaners, setCleaners, clients, visits, setVisits, teams } = useAppContext();
  const [selectedSickCleaner, setSelectedSickCleaner] = useState<string>('');
  const [selectedCancelledVisit, setSelectedCancelledVisit] = useState<string>('');
  const [lastChanges, setLastChanges] = useState<ScheduleChange[]>([]);
  const [lastCalls, setLastCalls] = useState<CallItem[]>([]);
  const [showResults, setShowResults] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todaysVisits = visits.filter(v => v.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const activeTodaysVisits = todaysVisits.filter(v => !v.cancelled);

  const todaysViolations = useMemo(() => checkConstraints(activeTodaysVisits, cleaners, clients, teams), [activeTodaysVisits, cleaners, clients, teams]);

  const handleSickCall = () => {
    if (!selectedSickCleaner) return;
    setCleaners(cleaners.map(c => c.id === selectedSickCleaner ? { ...c, active: false } : c));
    setSelectedSickCleaner('');
    setShowResults(false);
  };

  const handleClientCancellation = () => {
    if (!selectedCancelledVisit) return;
    setVisits(visits.map(v => v.id === selectedCancelledVisit ? { ...v, cancelled: true } : v));
    setSelectedCancelledVisit('');
    setShowResults(false);
  };

  const handleAutoFix = () => {
    const { visits: newVisits, changes } = reoptimizeSchedule(visits, cleaners, clients, teams);
    setVisits(newVisits);
    setLastChanges(changes);
    const calls = generateCallList(changes, clients, cleaners, teams);
    setLastCalls(calls);
    setShowResults(true);
  };

  const resetAll = () => {
    if (!confirm('Reset all cleaners to active and restore all cancelled visits?')) return;
    setCleaners(cleaners.map(c => ({ ...c, active: true })));
    setVisits(visits.map(v => ({ ...v, cancelled: false })));
    setLastChanges([]);
    setLastCalls([]);
    setShowResults(false);
  };

  // Affected visits (teams with inactive members)
  const affectedVisits = activeTodaysVisits.filter(visit => {
    const team = teams.find(t => t.id === visit.assignedTeamId);
    if (!team) return false;
    return team.cleanerIds.some(id => !cleaners.find(c => c.id === id)?.active);
  });

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <div className="relative">
            <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-900/50">
              <AlertTriangle size={24} />
            </div>
            {todaysViolations.some(v => v.severity === 'error') && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-400 rounded-full animate-pulse-ring" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-black">Morning Nightmare</h2>
            <p className="text-slate-400 text-xs font-medium">{format(new Date(), 'EEEE, MMMM d')} • {activeTodaysVisits.length} visits</p>
          </div>
        </div>
        {todaysViolations.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-red-500/20 text-red-300 rounded-lg font-bold border border-red-500/30">
              {todaysViolations.filter(v => v.severity === 'error').length} Errors
            </span>
            <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded-lg font-bold border border-amber-500/30">
              {todaysViolations.filter(v => v.severity === 'warning').length} Warnings
            </span>
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Sick Cleaner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-sm text-red-600 mb-3">
            <UserX size={16} /> Cleaner Called In Sick
          </h3>
          <div className="space-y-2">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
              value={selectedSickCleaner}
              onChange={e => setSelectedSickCleaner(e.target.value)}
            >
              <option value="">Select active cleaner...</option>
              {cleaners.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.isDriver ? '(Driver)' : ''}</option>
              ))}
            </select>
            <button
              onClick={handleSickCall}
              disabled={!selectedSickCleaner}
              className="w-full py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              Mark Inactive & Affected
            </button>
          </div>
        </div>

        {/* Client Cancel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <h3 className="flex items-center gap-2 font-bold text-sm text-amber-600 mb-3">
            <Home size={16} /> Client Cancelled
          </h3>
          <div className="space-y-2">
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              value={selectedCancelledVisit}
              onChange={e => setSelectedCancelledVisit(e.target.value)}
            >
              <option value="">Select visit...</option>
              {activeTodaysVisits.map(v => (
                <option key={v.id} value={v.id}>{v.startTime} — {v.clientName}</option>
              ))}
            </select>
            <button
              onClick={handleClientCancellation}
              disabled={!selectedCancelledVisit}
              className="w-full py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              Cancel Visit
            </button>
          </div>
        </div>
      </div>

      {/* Affected Visits Alert */}
      {affectedVisits.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h3 className="text-sm font-bold text-red-700 flex items-center gap-2 mb-3">
            <AlertCircle size={16} /> Affected Visits ({affectedVisits.length})
          </h3>
          <div className="space-y-2">
            {affectedVisits.map(v => {
              const team = teams.find(t => t.id === v.assignedTeamId);
              const badIds = team?.cleanerIds.filter(id => !cleaners.find(c => c.id === id)?.active) || [];
              const badNames = badIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ');
              return (
                <div key={v.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-red-100">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{v.clientName}</p>
                    <p className="text-[10px] text-red-600 font-bold">Inactive: {badNames}</p>
                  </div>
                  <span className="text-xs font-bold text-slate-400">{v.startTime}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AUTO-FIX Button */}
      <button
        onClick={handleAutoFix}
        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 transition-all active:scale-[0.98]"
      >
        <Zap className="fill-current" size={24} /> AUTO-FIX SCHEDULE
      </button>

      {/* Results */}
      {showResults && (
        <div className="space-y-4 animate-slide-up">
          {lastChanges.length > 0 ? (
            <>
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <RotateCcw size={16} className="text-indigo-500" /> Changes Made ({lastChanges.length})
                </h3>
                <div className="space-y-2">
                  {lastChanges.map((change, i) => (
                    <div key={i} className="flex items-center gap-3 bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                      <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">{change.clientName}</p>
                        <p className="text-[10px] text-slate-500">
                          {change.oldTeamName} <ChevronRight size={10} className="inline mx-0.5" /> {change.newTeamName}
                        </p>
                        <p className="text-[10px] text-indigo-600 font-medium mt-0.5">{change.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-blue-500" /> Call List ({lastCalls.length})
                </h3>
                <div className="space-y-2">
                  {lastCalls.map((call, i) => (
                    <div key={i} className={`flex items-start gap-3 rounded-xl p-3 border ${
                      call.type === 'client' ? 'bg-blue-50 border-blue-100' : 'bg-green-50 border-green-100'
                    }`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        call.type === 'client' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {call.type === 'client' ? <Phone size={14} /> : <Users size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">{call.name}</span>
                          {call.phone && <span className="text-[10px] text-slate-400 font-mono">{call.phone}</span>}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{call.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <CheckCircle2 className="mx-auto mb-2 text-green-500" size={32} />
              <p className="text-sm font-bold text-green-800">No changes needed!</p>
              <p className="text-xs text-green-600 mt-1">All visits are optimally assigned.</p>
            </div>
          )}
        </div>
      )}

      {/* Reset */}
      <div className="text-center pt-2">
        <button onClick={resetAll} className="text-xs text-slate-400 hover:text-slate-600 font-medium underline underline-offset-2">
          Reset all for tomorrow (restore all cleaners & visits)
        </button>
      </div>
    </div>
  );
};
