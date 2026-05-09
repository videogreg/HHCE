import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, UserPlus, Car, Clock, Ban, Phone, FileText, ChevronDown, ChevronUp } from 'lucide-react';

const COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
];

export const CleanerManager: React.FC = () => {
  const { cleaners, setCleaners } = useAppContext();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newCleaner, setNewCleaner] = useState<Partial<Cleaner>>({
    name: '', isDriver: false, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], active: true, phone: '', notes: ''
  });
  const [showAdd, setShowAdd] = useState(false);

  const addCleaner = () => {
    if (!newCleaner.name?.trim()) return;
    const idx = cleaners.length % COLORS.length;
    const cleaner: Cleaner = {
      id: uuidv4(),
      name: newCleaner.name.trim(),
      isDriver: !!newCleaner.isDriver,
      canStartAt: newCleaner.canStartAt || '08:00',
      mustBeOffBy: newCleaner.mustBeOffBy || '17:00',
      cannotWorkWith: newCleaner.cannotWorkWith || [],
      active: true,
      phone: newCleaner.phone || '',
      notes: newCleaner.notes || '',
      color: COLORS[idx].dot
    };
    setCleaners([...cleaners, cleaner]);
    setNewCleaner({ name: '', isDriver: false, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], active: true, phone: '', notes: '' });
    setShowAdd(false);
  };

  const removeCleaner = (id: string) => {
    if (confirm('Remove this cleaner?')) {
      setCleaners(cleaners.filter(c => c.id !== id));
    }
  };

  const toggleCannotWorkWith = (targetId: string, cleanerId: string) => {
    const cleaner = cleaners.find(c => c.id === cleanerId);
    if (!cleaner) return;
    const has = cleaner.cannotWorkWith.includes(targetId);
    const updated = cleaners.map(c => {
      if (c.id === cleanerId) {
        return { ...c, cannotWorkWith: has ? c.cannotWorkWith.filter(x => x !== targetId) : [...c.cannotWorkWith, targetId] };
      }
      // Also update the target cleaner's list for bidirectional
      if (c.id === targetId) {
        const targetHas = c.cannotWorkWith.includes(cleanerId);
        return { ...c, cannotWorkWith: targetHas ? c.cannotWorkWith.filter(x => x !== cleanerId) : [...c.cannotWorkWith, cleanerId] };
      }
      return c;
    });
    setCleaners(updated);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <UserPlus className="text-blue-600" size={24} /> Cleaners ({cleaners.length})
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-md active:scale-95 flex items-center gap-2"
        >
          <Plus size={16} /> {showAdd ? 'Close' : 'Add'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Name *</label>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={newCleaner.name}
                onChange={e => setNewCleaner({ ...newCleaner, name: e.target.value })}
                placeholder="e.g. Sarah"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
              <input
                type="tel"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.phone}
                onChange={e => setNewCleaner({ ...newCleaner, phone: e.target.value })}
                placeholder="555-0100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start</label>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.canStartAt}
                onChange={e => setNewCleaner({ ...newCleaner, canStartAt: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Off By</label>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.mustBeOffBy}
                onChange={e => setNewCleaner({ ...newCleaner, mustBeOffBy: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={newCleaner.isDriver}
                  onChange={e => setNewCleaner({ ...newCleaner, isDriver: e.target.checked })}
                />
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1"><Car size={14} /> Driver</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
            <input
              type="text"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={newCleaner.notes}
              onChange={e => setNewCleaner({ ...newCleaner, notes: e.target.value })}
              placeholder="e.g. Picks up kids at 2:30pm"
            />
          </div>

          <button
            onClick={addCleaner}
            disabled={!newCleaner.name?.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
          >
            Add Cleaner
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cleaners.map((cleaner, idx) => {
          const style = COLORS[idx % COLORS.length];
          const isExpanded = expandedId === cleaner.id;
          return (
            <div key={cleaner.id} className={`${style.bg} border ${style.border} rounded-2xl p-4 transition-all hover:shadow-md`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${style.dot} ${cleaner.active ? '' : 'opacity-30'}`} />
                  <div>
                    <h3 className={`font-bold text-sm ${style.text} ${cleaner.active ? '' : 'line-through opacity-50'}`}>{cleaner.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {cleaner.isDriver && <span className="text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-bold">DRIVER</span>}
                      <span className="text-[10px] text-slate-500 font-medium">{cleaner.canStartAt}-{cleaner.mustBeOffBy}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setExpandedId(isExpanded ? null : cleaner.id)} className="p-1.5 rounded-lg hover:bg-black/5 text-slate-400">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => removeCleaner(cleaner.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-black/5 space-y-3 animate-slide-up">
                  {cleaner.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Phone size={12} /> {cleaner.phone}
                    </div>
                  )}
                  {cleaner.notes && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <FileText size={12} className="mt-0.5 shrink-0" /> {cleaner.notes}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Ban size={10} /> Cannot work with
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cleaners.filter(c => c.id !== cleaner.id).map(other => {
                        const isBlocked = cleaner.cannotWorkWith.includes(other.id);
                        return (
                          <button
                            key={other.id}
                            onClick={() => toggleCannotWorkWith(other.id, cleaner.id)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                              isBlocked
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {other.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
