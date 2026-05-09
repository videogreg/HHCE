import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { AlertTriangle, UserX, Home, CheckCircle2, MessageSquare, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { reoptimizeSchedule } from '../utils/scheduler';

export const ReorganizeModal: React.FC = () => {
  const { cleaners, setCleaners, clients, visits, setVisits, teams } = useAppContext();
  const [selectedSickCleaner, setSelectedSickCleaner] = useState<string>('');
  const [selectedCancelledClient, setSelectedCancelledClient] = useState<string>('');
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const activeTodaysVisits = visits.filter(v => v.date === today && !v.cancelled);

  const handleSickCall = () => {
    if (!selectedSickCleaner) return;
    setCleaners(cleaners.map(c => c.id === selectedSickCleaner ? { ...c, active: false } : c));
    setSelectedSickCleaner('');
  };

  const handleAutoFix = () => {
    const newVisits = reoptimizeSchedule(visits, cleaners, clients, teams);
    setVisits(newVisits);
  };

  const handleClientCancellation = () => {
    if (!selectedCancelledClient) return;
    setVisits(visits.map(v => v.id === selectedCancelledClient ? { ...v, cancelled: true } : v));
    setSelectedCancelledClient('');
  };

  const resetAll = () => {
    setCleaners(cleaners.map(c => ({ ...c, active: true })));
    setVisits(visits.map(v => ({ ...v, cancelled: false })));
  };

  // Identify who needs to be contacted
  const contactList = activeTodaysVisits.filter(visit => {
    const team = teams.find(t => t.id === visit.assignedTeamId);
    const teamCleaners = team ? cleaners.filter(c => team.cleanerIds.includes(c.id)) : [];
    return teamCleaners.some(c => !c.active);
  });

  return (
    <div className="p-6 bg-slate-900 text-white rounded-2xl shadow-2xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-red-500 rounded-lg animate-pulse">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Morning Nightmare Mode</h2>
          <p className="text-slate-400 text-sm">Quickly resolve cancellations and sick calls</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cleaner Sick Section */}
        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="flex items-center gap-2 font-semibold mb-4 text-red-400">
            <UserX size={18} /> Cleaner Called In Sick
          </h3>
          <div className="space-y-4">
            <select 
              className="w-full bg-slate-700 border-slate-600 rounded-md p-2 text-sm focus:ring-red-500"
              value={selectedSickCleaner}
              onChange={(e) => setSelectedSickCleaner(e.target.value)}
            >
              <option value="">Select Cleaner...</option>
              {cleaners.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button 
              onClick={handleSickCall}
              disabled={!selectedSickCleaner}
              className="w-full py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md font-bold transition-colors"
            >
              Mark as Inactive
            </button>
          </div>
        </div>

        {/* Client Cancel Section */}
        <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
          <h3 className="flex items-center gap-2 font-semibold mb-4 text-amber-400">
            <Home size={18} /> Client Cancelled
          </h3>
          <div className="space-y-4">
            <select 
              className="w-full bg-slate-700 border-slate-600 rounded-md p-2 text-sm focus:ring-amber-500"
              value={selectedCancelledClient}
              onChange={(e) => setSelectedCancelledClient(e.target.value)}
            >
              <option value="">Select Visit...</option>
              {activeTodaysVisits.map(v => (
                <option key={v.id} value={v.id}>{v.clientName} ({v.startTime})</option>
              ))}
            </select>
            <button 
              onClick={handleClientCancellation}
              disabled={!selectedCancelledClient}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-md font-bold transition-colors"
            >
              Cancel Visit
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleAutoFix}
        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-indigo-900/20 transition-all active:scale-95"
      >
        <Zap className="fill-current" /> AUTO-FIX SCHEDULE
      </button>

      {/* Action List */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MessageSquare size={20} className="text-blue-400" /> Action List (Immediate Notifications)
        </h3>
        <div className="space-y-2">
          {contactList.length === 0 ? (
            <div className="p-8 text-center bg-slate-800/50 rounded-xl border border-dashed border-slate-700 text-slate-500">
              <CheckCircle2 className="mx-auto mb-2 opacity-20" size={32} />
              <p>No affected visits currently.</p>
            </div>
          ) : (
            contactList.map(visit => (
              <div key={visit.id} className="p-4 bg-slate-800 border-l-4 border-blue-500 rounded-r-xl flex justify-between items-center">
                <div>
                  <p className="font-bold">{visit.clientName}</p>
                  <p className="text-xs text-slate-400">Scheduled: {visit.startTime} • Team issue: Sick member</p>
                </div>
                <button className="px-3 py-1 bg-blue-600 text-xs rounded-full font-bold hover:bg-blue-500 transition-colors">
                  SEND UPDATE
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <button 
          onClick={resetAll}
          className="text-xs text-slate-500 hover:text-slate-300 underline"
        >
          Reset all for tomorrow
        </button>
      </div>
    </div>
  );
};
