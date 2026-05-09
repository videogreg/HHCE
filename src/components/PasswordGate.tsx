import React, { useState } from 'react';
import { Sparkles, Lock, Eye, EyeOff } from 'lucide-react';

interface PasswordGateProps {
  children: React.ReactNode;
}

const CORRECT_PASSWORD = 'hhce2026';
const AUTH_KEY = 'hhce_auth';

export const PasswordGate: React.FC<PasswordGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem(AUTH_KEY) === 'true';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === CORRECT_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-hhce-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/50 mx-auto mb-4">
            <Sparkles size={32} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">HHCE</h1>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-[0.2em] mt-1">Happy House Cleaning Experts</p>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Lock size={18} className="text-blue-400" />
            <h2 className="text-sm font-bold text-slate-200">Password Required</h2>
          </div>
          <p className="text-xs text-slate-400 mb-4">Client and cleaner data is protected. Enter the password to access the scheduler.</p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(false); }}
                placeholder="Enter password"
                className={`w-full rounded-xl border px-4 py-3 text-sm text-white bg-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                  error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-blue-500'
                }`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400 font-bold">Incorrect password. Please try again.</p>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors active:scale-[0.98] shadow-lg shadow-blue-900/30"
            >
              Unlock Scheduler
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-6 font-medium">
          Password: hhce2026
        </p>
      </div>
    </div>
  );
};
