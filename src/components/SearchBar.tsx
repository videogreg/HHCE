import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Search, X, User, Users, Calendar } from 'lucide-react';

interface SearchBarProps {
  onNavigate: (tab: 'dashboard' | 'builder' | 'cleaners' | 'clients' | 'nightmare', itemId?: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onNavigate }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { clients, cleaners, visits, setSelectedDate } = useAppContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const q = query.toLowerCase().trim();
  const clientResults = q ? clients.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.address.toLowerCase().includes(q) ||
    (c.phone && c.phone.includes(q)) ||
    (c.zone && c.zone.toLowerCase().includes(q))
  ).slice(0, 5) : [];

  const cleanerResults = q ? cleaners.filter(c =>
    c.name.toLowerCase().includes(q) ||
    (c.phone && c.phone.includes(q)) ||
    (c.notes && c.notes.toLowerCase().includes(q))
  ).slice(0, 5) : [];

  const visitResults = q ? visits.filter(v =>
    v.clientName.toLowerCase().includes(q) ||
    v.clientAddress.toLowerCase().includes(q) ||
    v.date.includes(q)
  ).slice(0, 5) : [];

  const hasResults = clientResults.length + cleanerResults.length + visitResults.length > 0;

  return (
    <div ref={ref} className="sticky top-16 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-2 shadow-sm">
      <div className="max-w-7xl mx-auto relative">
        <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            type="text"
            className="flex-1 bg-transparent text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none"
            placeholder="Search clients, cleaners, visits..."
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
          {query && (
            <button onClick={() => { setQuery(''); setOpen(false); }} className="p-1 rounded hover:bg-slate-200 text-slate-400">
              <X size={14} />
            </button>
          )}
        </div>

        {open && hasResults && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-80 overflow-y-auto">
            {clientResults.length > 0 && (
              <div className="p-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Clients</div>
                {clientResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onNavigate('clients', c.id); setQuery(''); setOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-3"
                  >
                    <User size={14} className="text-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{c.address} {c.phone && `• ${c.phone}`}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {cleanerResults.length > 0 && (
              <div className="p-2 border-t border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Cleaners</div>
                {cleanerResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onNavigate('cleaners', c.id); setQuery(''); setOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Users size={14} className="text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{c.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{c.phone || 'No phone'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {visitResults.length > 0 && (
              <div className="p-2 border-t border-slate-100">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Visits</div>
                {visitResults.map(v => (
                  <button
                    key={v.id}
                    onClick={() => {
                      const [y, m, d] = v.date.split('-').map(Number);
                      if (y && m && d) setSelectedDate(new Date(y, m - 1, d));
                      onNavigate('dashboard', v.id);
                      setQuery('');
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center gap-3"
                  >
                    <Calendar size={14} className="text-purple-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-700 truncate">{v.clientName}</div>
                      <div className="text-[10px] text-slate-500 truncate">{v.date} • {v.startTime} • {v.clientAddress}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};