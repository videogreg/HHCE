import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner } from '../types';
import { isCleanerActiveOnDate } from '../utils/scheduler';
import { format } from 'date-fns';
import { ArrowLeft, LogIn, User } from 'lucide-react';

interface CleanerLoginProps {
  onLogin: (cleaner: Cleaner) => void;
  onBack: () => void;
}

export const CleanerLogin: React.FC<CleanerLoginProps> = ({ onLogin, onBack }) => {
  const { cleaners } = useAppContext();
  const [selectedId, setSelectedId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const activeCleaners = cleaners.filter(c => isCleanerActiveOnDate(c, format(new Date(), 'yyyy-MM-dd'))).sort((a, b) => a.name.localeCompare(b.name));

  const handleLogin = () => {
    const cleaner = cleaners.find(c => c.id === selectedId);
    if (!cleaner) {
      setError('Please select your name');
      return;
    }
    // If no individual password set, default to shared password
    const expected = cleaner.password || 'hhce2026';
    if (password !== expected) {
      setError('Incorrect password');
      return;
    }
    onLogin(cleaner);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-4">
        <button onClick={onBack} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold transition-colors">
          <ArrowLeft size={16} /> Back
        </button>

        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center text-white mx-auto shadow-lg">
            <User size={24} />
          </div>
          <h1 className="text-xl font-black text-slate-800">Cleaner Portal</h1>
          <p className="text-xs text-slate-500 font-medium">HHCE Staff Access</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Select Name</label>
            <select
              value={selectedId}
              onChange={e => { setSelectedId(e.target.value); setError(''); }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="">-- Choose your name --</option>
              {activeCleaners.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
            />
          </div>

          {error && (
            <p className="text-red-600 text-xs font-bold text-center bg-red-50 rounded-lg py-2">{error}</p>
          )}

          <button 
            onClick={handleLogin} 
            className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-green-900/20"
          >
            <LogIn size={18} /> Sign In
          </button>
        </div>
      </div>
    </div>
  );
};