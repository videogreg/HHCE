import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, UserPlus, Car, Phone, Mail, MapPin, FileText, ChevronDown, ChevronUp, Upload, Download, X, Save, Pencil } from 'lucide-react';
import { parseCleanersCSV } from '../utils/csvParser';
import { showToast } from '../utils/toast';

const COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
];

interface CleanerManagerProps {
  focusId?: string | null;
  onFocusClear?: () => void;
}

export const CleanerManager: React.FC<CleanerManagerProps> = ({ focusId, onFocusClear }) => {
  const { cleaners, setCleaners } = useAppContext();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<<Partial<Cleaner>>({});
  const [newCleaner, setNewCleaner] = useState<<Partial<Cleaner>>({
    name: '', isDriver: false, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], unavailableDays: [], active: true, phone: '', email: '', address: '', notes: '', password: ''
  });
  const [showAdd, setShowAdd] = useState(false);
  const [csvPreview, setCsvPreview] = useState<<Partial<Cleaner>[] | null>(null);

  useEffect(() => {
    if (focusId && cleaners.some(c => c.id === focusId)) {
      setExpandedId(focusId);
      setEditId(null);
      onFocusClear?.();
      setTimeout(() => {
        document.getElementById(`cleaner-card-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [focusId, cleaners, onFocusClear]);

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
      unavailableDays: newCleaner.unavailableDays || [],
      active: true,
      phone: newCleaner.phone || '',
      email: newCleaner.email || '',
      address: newCleaner.address || '',
      notes: newCleaner.notes || '',
      color: COLORS[idx].dot,
      password: newCleaner.password || undefined,
    };
    setCleaners([...cleaners, cleaner]);
    setNewCleaner({ name: '', isDriver: false, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], unavailableDays: [], active: true, phone: '', email: '', address: '', notes: '', password: '' });
    setShowAdd(false);
  };

  const removeCleaner = (id: string) => {
    if (confirm('Remove this cleaner?')) {
      setCleaners(cleaners.filter(c => c.id !== id));
    }
  };

  const startEdit = (cleaner: Cleaner) => {
    setEditId(cleaner.id);
    setEditForm({ ...cleaner });
    setExpandedId(cleaner.id);
  };

  const saveEdit = () => {
    const name = editForm.name?.trim();
    if (!editId || !name) return;
    setCleaners(cleaners.map(c => c.id === editId ? { ...c, ...editForm, name } as Cleaner : c));
    setEditId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditForm({});
  };

  const toggleCannotWorkWithEdit = (targetId: string) => {
    const current = editForm.cannotWorkWith || [];
    const has = current.includes(targetId);
    setEditForm({
      ...editForm,
      cannotWorkWith: has ? current.filter(x => x !== targetId) : [...current, targetId]
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCleanersCSV(text);
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    if (cleaners.length === 0) {
      showToast('No cleaners to export', 'warning');
      return;
    }
    const headers = ['Name', 'Driver', 'Phone', 'Email', 'Address', 'Start', 'Off By', 'Active', 'Unavailable Days', 'Cannot Work With', 'Notes'];
    const rows = cleaners.map(c => {
      const cannotWorkNames = (c.cannotWorkWith || [])
        .map(id => cleaners.find(x => x.id === id)?.name)
        .filter(Boolean)
        .join('; ');
      return [
        c.name,
        c.isDriver ? 'Yes' : 'No',
        c.phone || '',
        c.email || '',
        c.address || '',
        c.canStartAt || '',
        c.mustBeOffBy || '',
        c.active ? 'Yes' : 'No',
        (c.unavailableDays || []).join('; '),
        cannotWorkNames,
        c.notes || ''
      ];
    });
    const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hhce-cleaners-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${cleaners.length} cleaners to CSV`, 'success');
  };

  const confirmCsvImport = () => {
    if (!csvPreview || csvPreview.length === 0) return;

    const updatedCleaners = [...cleaners];

    csvPreview.forEach((p) => {
      const importedName = p.name?.trim();
      if (!importedName) return;

      const importedNameLower = importedName.toLowerCase();
      const existingIndex = updatedCleaners.findIndex(c => c.name.trim().toLowerCase() === importedNameLower);

      if (existingIndex >= 0) {
        const existing = updatedCleaners[existingIndex];
        updatedCleaners[existingIndex] = {
          ...existing,
          name: importedName,
          isDriver: p.isDriver ?? existing.isDriver,
          phone: p.phone || existing.phone,
          email: p.email || existing.email,
          address: p.address || existing.address,
          notes: p.notes || existing.notes,
          canStartAt: p.canStartAt || existing.canStartAt,
          mustBeOffBy: p.mustBeOffBy || existing.mustBeOffBy,
          active: p.active ?? existing.active,
        };
      } else {
        const style = COLORS[updatedCleaners.length % COLORS.length];
        const newCleaner: Cleaner = {
          ...p,
          id: uuidv4(),
          color: style.dot,
          isDriver: p.isDriver ?? false,
          canStartAt: p.canStartAt || '08:00',
          mustBeOffBy: p.mustBeOffBy || '17:00',
          cannotWorkWith: p.cannotWorkWith || [],
          active: p.active ?? true,
        } as Cleaner;
        updatedCleaners.push(newCleaner);
      }
    });

    setCleaners(updatedCleaners);
    setCsvPreview(null);
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <UserPlus className="text-blue-600" size={24} /> Cleaners ({cleaners.length})
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-xs font-bold active:scale-95"
          >
            <Download size={14} /> Export CSV
          </button>
          <label className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl cursor-pointer hover:bg-slate-200 transition-colors flex items-center gap-1.5 text-xs font-bold active:scale-95 border border-slate-200">
            <Upload size={14} /> Import CSV
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-md active:scale-95 flex items-center gap-2"
          >
            <Plus size={16} /> {showAdd ? 'Close' : 'Add'}
          </button>
        </div>
      </div>

      {csvPreview && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
              <Upload size={16} /> CSV Import Preview ({csvPreview.length} cleaners)
            </h3>
            <button onClick={() => setCsvPreview(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
              <X size={16} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-100 rounded-xl">
            {csvPreview.slice(0, 10).map((c, i) => {
              const isExisting = cleaners.some(existing => existing.name.trim().toLowerCase() === c.name?.trim().toLowerCase());
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-slate-50 last:border-0">
                  <span className="font-bold text-slate-800">{c.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isExisting ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                    {isExisting ? 'UPDATE' : 'NEW'}
                  </span>
                  <span className="text-slate-500">{c.phone || 'No phone'}</span>
                  <span className="text-slate-400 truncate">{c.notes || ''}</span>
                </div>
              );
            })}
            {csvPreview.length > 10 && (
              <p className="text-center text-[10px] text-slate-400 py-2">...and {csvPreview.length - 10} more</p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmCsvImport} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 active:scale-[0.98]">
              Import All
            </button>
            <button onClick={() => setCsvPreview(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 active:scale-[0.98]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Name *</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.name} onChange={e => setNewCleaner({ ...newCleaner, name: e.target.value })} placeholder="e.g. Sarah" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
              <input type="tel" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.phone} onChange={e => setNewCleaner({ ...newCleaner, phone: e.target.value })} placeholder="555-0100" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
              <input type="email" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.email} onChange={e => setNewCleaner({ ...newCleaner, email: e.target.value })} placeholder="sarah@email.com" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Address</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.address} onChange={e => setNewCleaner({ ...newCleaner, address: e.target.value })} placeholder="123 Main St, London" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Start</label>
              <input type="time" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.canStartAt} onChange={e => setNewCleaner({ ...newCleaner, canStartAt: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Off By</label>
              <input type="time" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.mustBeOffBy} onChange={e => setNewCleaner({ ...newCleaner, mustBeOffBy: e.target.value })} />
            </div>
            <div className="flex items-end pb-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={newCleaner.isDriver} onChange={e => setNewCleaner({ ...newCleaner, isDriver: e.target.checked })} />
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1"><Car size={14} /> Driver</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Portal Password</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.password} onChange={e => setNewCleaner({ ...newCleaner, password: e.target.value })} placeholder="Leave blank for default: hhce2026" />
              <p className="text-[10px] text-slate-400 mt-1">Blank = cleaners use default password</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newCleaner.notes} onChange={e => setNewCleaner({ ...newCleaner, notes: e.target.value })} placeholder="e.g. Picks up kids at 2:30pm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unavailable Days</label>
            <div className="flex flex-wrap gap-2">
              {(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const).map(day => (
                <label key={day} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                  (newCleaner.unavailableDays || []).includes(day)
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={(newCleaner.unavailableDays || []).includes(day)}
                    onChange={e => {
                      const current = newCleaner.unavailableDays || [];
                      setNewCleaner({
                        ...newCleaner,
                        unavailableDays: e.target.checked
                          ? [...current, day]
                          : current.filter(d => d !== day)
                      });
                    }}
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Red = cannot work this day. Schedule alerts will enforce this.</p>
          </div>
          <button onClick={addCleaner} disabled={!newCleaner.name?.trim()}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors active:scale-[0.98]">
            Add Cleaner
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cleaners.map((cleaner, idx) => {
          const style = COLORS[idx % COLORS.length];
          const isExpanded = expandedId === cleaner.id;
          const isEditing = editId === cleaner.id;

          return (
            <div key={cleaner.id} id={`cleaner-card-${cleaner.id}`} className={`${style.bg} border ${style.border} rounded-2xl p-4 transition-all hover:shadow-md`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${style.dot} ${cleaner.active ? '' : 'opacity-30'}`} />
                  <div>
                    <h3 className={`font-bold text-sm ${style.text} ${cleaner.active ? '' : 'line-through opacity-50'}`}>{cleaner.name}</h3>
                    {cleaner.phone && (
                      <a href={`tel:${cleaner.phone}`} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                        <Phone size={12} /> {cleaner.phone}
                      </a>
                    )}
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

              {isExpanded && !isEditing && (
                <div className="mt-3 pt-3 border-t border-black/5 space-y-3 animate-slide-up">
                  <div className="space-y-2">
                    {cleaner.phone && (
                      <a href={`tel:${cleaner.phone}`} className="flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
                        <Phone size={14} /> {cleaner.phone}
                      </a>
                    )}
                    {cleaner.email && (
                      <a href={`mailto:${cleaner.email}`} className="flex items-center gap-2 text-sm font-bold text-slate-700 hover:underline">
                        <Mail size={14} /> {cleaner.email}
                      </a>
                    )}
                    {cleaner.address && (
                      <div className="flex items-start gap-2 text-sm font-medium text-slate-600">
                        <MapPin size={14} className="mt-0.5 shrink-0" /> {cleaner.address}
                      </div>
                    )}
                  </div>

                  {cleaner.cannotWorkWith.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Cannot work with</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cleaner.cannotWorkWith.map(id => {
                          const other = cleaners.find(c => c.id === id);
                          return other ? (
                            <span key={id} className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                              {other.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {cleaner.unavailableDays.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1.5">Unavailable</p>
                      <div className="flex flex-wrap gap-1">
                        {cleaner.unavailableDays.map(day => (
                          <span key={day} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            {day}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {cleaner.notes && (
                    <div className="flex items-start gap-2 text-xs text-slate-600 bg-white/60 rounded-lg p-2">
                      <FileText size={12} className="mt-0.5 shrink-0" /> {cleaner.notes}
                    </div>
                  )}

                  <div className="bg-white/60 rounded-lg p-2 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Portal Password:</span>
                    <span className="text-xs font-bold text-slate-700 font-mono">{cleaner.password || 'hhce2026 (default)'}</span>
                  </div>

                  <button onClick={() => startEdit(cleaner)}
                    className="w-full py-2 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors active:scale-95 flex items-center justify-center gap-2">
                    <Pencil size={14} /> Edit Cleaner
                  </button>
                </div>
              )}

              {isEditing && (
                <div className="mt-3 pt-3 border-t border-black/5 space-y-3 animate-slide-up">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Name</label>
                      <input type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
                        <input type="tel" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                        <input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Address</label>
                      <input type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Start</label>
                        <input type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.canStartAt || ''} onChange={e => setEditForm({ ...editForm, canStartAt: e.target.value })} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Off By</label>
                        <input type="time" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.mustBeOffBy || ''} onChange={e => setEditForm({ ...editForm, mustBeOffBy: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 py-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600"
                          checked={!!editForm.isDriver} onChange={e => setEditForm({ ...editForm, isDriver: e.target.checked })} />
                        <span className="text-xs font-medium text-slate-700 flex items-center gap-1"><Car size={12} /> Driver</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-blue-600"
                          checked={!!editForm.active} onChange={e => setEditForm({ ...editForm, active: e.target.checked })} />
                        <span className="text-xs font-medium text-slate-700">Active</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Portal Password</label>
                        <input type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.password || ''} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="hhce2026" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                        <input type="text" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Unavailable Days</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const).map(day => (
                          <label key={day} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer transition-colors ${
                            (editForm.unavailableDays || []).includes(day)
                              ? 'bg-red-100 text-red-700 border-red-200'
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={(editForm.unavailableDays || []).includes(day)}
                              onChange={e => {
                                const current = editForm.unavailableDays || [];
                                setEditForm({
                                  ...editForm,
                                  unavailableDays: e.target.checked
                                    ? [...current, day]
                                    : current.filter(d => d !== day)
                                });
                              }}
                            />
                            {day.slice(0, 3)}
                          </label>
                        ))}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1">Red = cannot work. Alerts will block scheduling.</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cannot work with</p>
                      <div className="flex flex-wrap gap-1.5">
                        {cleaners.filter(c => c.id !== cleaner.id).map(other => {
                          const isBlocked = (editForm.cannotWorkWith || []).includes(other.id);
                          return (
                            <button key={other.id} onClick={() => toggleCannotWorkWithEdit(other.id)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                                isBlocked ? 'bg-red-100 text-red-700 border-red-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                              }`}>
                              {other.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors active:scale-95 flex items-center justify-center gap-1.5">
                      <Save size={14} /> Save
                    </button>
                    <button onClick={cancelEdit} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors active:scale-95">
                      Cancel
                    </button>
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