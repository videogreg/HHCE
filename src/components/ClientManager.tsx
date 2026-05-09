import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Client, DayOfWeek } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Users, Upload, MapPin, Phone, FileText, ChevronDown, ChevronUp, Clock, Star, Ban } from 'lucide-react';
import { parseClientsCSV } from '../utils/csvParser';

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const ClientManager: React.FC = () => {
  const { cleaners, clients, setClients } = useAppContext();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState<Partial<Client>>({
    name: '', address: '', zone: '', preferredDays: [], notBefore: '09:00', notAfter: '17:00',
    preferredCleaners: [], avoidCleaners: [], durationMinutes: 120, phone: '', notes: ''
  });
  const [showAdd, setShowAdd] = useState(false);

  const addClient = () => {
    if (!newClient.name?.trim()) return;
    const client: Client = {
      id: uuidv4(),
      name: newClient.name.trim(),
      address: newClient.address || '',
      zone: newClient.zone || '',
      preferredDays: newClient.preferredDays || [],
      notBefore: newClient.notBefore || '09:00',
      notAfter: newClient.notAfter || '17:00',
      preferredCleaners: newClient.preferredCleaners || [],
      avoidCleaners: newClient.avoidCleaners || [],
      durationMinutes: newClient.durationMinutes || 120,
      phone: newClient.phone || '',
      notes: newClient.notes || ''
    };
    setClients([...clients, client]);
    setNewClient({ name: '', address: '', zone: '', preferredDays: [], notBefore: '09:00', notAfter: '17:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 120, phone: '', notes: '' });
    setShowAdd(false);
  };

  const removeClient = (id: string) => {
    if (confirm('Remove this client?')) setClients(clients.filter(c => c.id !== id));
  };

  const toggleDay = (day: DayOfWeek) => {
    const current = newClient.preferredDays || [];
    setNewClient({ ...newClient, preferredDays: current.includes(day) ? current.filter(d => d !== day) : [...current, day] });
  };

  const toggleCleaner = (id: string, type: 'preferred' | 'avoid') => {
    const key = type === 'preferred' ? 'preferredCleaners' : 'avoidCleaners';
    const current = (newClient[key] || []) as string[];
    setNewClient({ ...newClient, [key]: current.includes(id) ? current.filter(x => x !== id) : [...current, id] });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseClientsCSV(text);
        const fullClients = parsed.map(p => ({
          ...p,
          preferredDays: p.preferredDays || [],
          preferredCleaners: p.preferredCleaners || [],
          avoidCleaners: p.avoidCleaners || [],
          durationMinutes: p.durationMinutes || 120
        })) as Client[];
        setClients([...clients, ...fullClients]);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Users className="text-green-600" size={24} /> Clients ({clients.length})
        </h2>
        <div className="flex gap-2">
          <label className="px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-xl cursor-pointer hover:bg-green-100 transition-colors flex items-center gap-2 text-sm font-bold active:scale-95">
            <Upload size={16} />
            <span className="hidden sm:inline">Import CSV</span>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-colors shadow-md active:scale-95 flex items-center gap-2"
          >
            <Plus size={16} /> {showAdd ? 'Close' : 'Add'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Name *</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} placeholder="e.g. Johnson Residence" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Phone</label>
              <input type="tel" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} placeholder="555-1000" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Address</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.address} onChange={e => setNewClient({ ...newClient, address: e.target.value })} placeholder="123 Main St" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Zone (for travel grouping)</label>
              <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.zone} onChange={e => setNewClient({ ...newClient, zone: e.target.value })} placeholder="North, Downtown, etc." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preferred Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(day => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    newClient.preferredDays?.includes(day)
                      ? 'bg-green-600 text-white border-green-600 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-green-300'
                  }`}>
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Not Before</label>
              <input type="time" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.notBefore} onChange={e => setNewClient({ ...newClient, notBefore: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Not After</label>
              <input type="time" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.notAfter} onChange={e => setNewClient({ ...newClient, notAfter: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Duration (min)</label>
              <input type="number" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={newClient.durationMinutes} onChange={e => setNewClient({ ...newClient, durationMinutes: parseInt(e.target.value) || 120 })} />
            </div>
          </div>

          {cleaners.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Star size={10} /> Preferred Cleaners
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {cleaners.map(c => (
                    <button key={c.id} onClick={() => toggleCleaner(c.id, 'preferred')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        newClient.preferredCleaners?.includes(c.id) ? 'bg-green-100 text-green-700 border-green-300' : 'bg-white text-slate-400 border-slate-200'
                      }`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Ban size={10} /> Avoid Cleaners
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {cleaners.map(c => (
                    <button key={c.id} onClick={() => toggleCleaner(c.id, 'avoid')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                        newClient.avoidCleaners?.includes(c.id) ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-slate-400 border-slate-200'
                      }`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
            <input type="text" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={newClient.notes} onChange={e => setNewClient({ ...newClient, notes: e.target.value })} placeholder="e.g. Dog friendly, alarm code 1234" />
          </div>

          <button onClick={addClient} disabled={!newClient.name?.trim()}
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 transition-colors active:scale-[0.98]">
            Add Client
          </button>
        </div>
      )}

      <div className="space-y-2">
        {clients.map(client => {
          const isExpanded = expandedId === client.id;
          return (
            <div key={client.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-800 truncate">{client.name}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {client.zone && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold flex items-center gap-1"><MapPin size={8} /> {client.zone}</span>}
                    <span className="text-[10px] text-slate-400 font-medium">{client.durationMinutes} min</span>
                    {client.preferredDays.length > 0 && (
                      <span className="text-[10px] text-green-600 font-bold">{client.preferredDays.map(d => d.slice(0,3)).join(', ')}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setExpandedId(isExpanded ? null : client.id)} className="p-1.5 rounded-lg hover:bg-black/5 text-slate-400">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <button onClick={() => removeClient(client.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 animate-slide-up text-xs text-slate-600">
                  <div className="flex items-center gap-2"><MapPin size={12} className="shrink-0 text-slate-400" /> {client.address || 'No address'}</div>
                  {client.phone && <div className="flex items-center gap-2"><Phone size={12} className="shrink-0 text-slate-400" /> {client.phone}</div>}
                  <div className="flex items-center gap-2"><Clock size={12} className="shrink-0 text-slate-400" /> Window: {client.notBefore} - {client.notAfter}</div>
                  {client.notes && <div className="flex items-start gap-2"><FileText size={12} className="shrink-0 mt-0.5 text-slate-400" /> {client.notes}</div>}
                  {client.preferredCleaners.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Star size={12} className="shrink-0 text-amber-400" />
                      <span className="font-bold text-amber-700">Prefers:</span>
                      {client.preferredCleaners.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                  {client.avoidCleaners.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Ban size={12} className="shrink-0 text-red-400" />
                      <span className="font-bold text-red-700">Avoids:</span>
                      {client.avoidCleaners.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
