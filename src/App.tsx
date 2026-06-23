import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { PasswordGate } from './components/PasswordGate';
import { CleanerManager } from './components/CleanerManager';
import { ClientManager } from './components/ClientManager';
import { ScheduleBoard } from './components/ScheduleBoard';
import { ScheduleBuilder } from './components/ScheduleBuilder';
import { FixModal } from './components/FixModal';
import { Reports } from './components/Reports';
import ToastContainer from './components/ToastContainer';
import { CleanerLogin } from './components/CleanerLogin';
import { CleanerDashboard } from './components/CleanerDashboard';
import type { Cleaner } from './types';
import { LayoutDashboard, Users, UserCheck, Wrench, Sparkles, CalendarPlus, Shield, User, BarChart3 } from 'lucide-react';

function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}

function AppRouter() {
  const [mode, setMode] = useState<'landing' | 'admin' | 'cleaner-login' | 'cleaner-dashboard'>('landing');
  const [loggedInCleaner, setLoggedInCleaner] = useState<Cleaner | null>(null);

  if (mode === 'landing') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-sm w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center text-white mx-auto shadow-lg shadow-blue-900/50">
              <Sparkles size={32} />
            </div>
            <h1 className="text-2xl font-black text-slate-800">HHCE</h1>
            <p className="text-sm text-slate-500 font-medium">Happy House Cleaning Experts</p>
          </div>

          <div className="space-y-3">
            <button 
              onClick={() => setMode('admin')}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
            >
              <Shield size={18} /> Administration
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-slate-400 font-bold uppercase tracking-wider">or</span>
              </div>
            </div>

            <button 
              onClick={() => setMode('cleaner-login')}
              className="w-full py-3.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-green-900/20"
            >
              <User size={18} /> Cleaner Portal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'admin') {
    return (
      <PasswordGate>
        <AppContent />
      </PasswordGate>
    );
  }

  if (mode === 'cleaner-login') {
    return (
      <CleanerLogin 
        onLogin={(cleaner) => {
          setLoggedInCleaner(cleaner);
          setMode('cleaner-dashboard');
        }} 
        onBack={() => setMode('landing')}
      />
    );
  }

  if (mode === 'cleaner-dashboard' && loggedInCleaner) {
    return (
      <CleanerDashboard 
        cleaner={loggedInCleaner} 
        onLogout={() => {
          setLoggedInCleaner(null);
          setMode('landing');
        }} 
      />
    );
  }

  return null;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'builder' | 'cleaners' | 'clients' | 'reports'>('dashboard');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      <header className="bg-hhce-dark border-b border-slate-800 sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-900/50">
              <Sparkles size={22} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white leading-none">HHCE</h1>
              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-[0.2em]">Happy House Cleaning Experts</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFixModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs sm:text-sm bg-red-600 text-white shadow-lg shadow-red-900/40 ring-2 ring-red-400/30 transition-all active:scale-95 hover:bg-red-700"
            >
              <Wrench size={16} />
              <span>FIX</span>
            </button>
          </div>
        </div>
      </header>

      <SearchBar onNavigate={(tab, id) => {
        if (tab === 'dashboard' || tab === 'builder' || tab === 'cleaners' || tab === 'clients' || tab === 'reports') {
          setActiveTab(tab);
          setFocusId(id || null);
        }
      }} />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'dashboard' && <ScheduleBoard focusVisitId={focusId} onFocusClear={() => setFocusId(null)} />}
        {activeTab === 'builder' && <ScheduleBuilder />}
        {activeTab === 'cleaners' && <CleanerManager focusId={focusId} onFocusClear={() => setFocusId(null)} />}
        {activeTab === 'clients' && <ClientManager focusId={focusId} onFocusClear={() => setFocusId(null)} />}
        {activeTab === 'reports' && <Reports />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-2 sm:px-6 py-2 flex justify-around items-center shadow-[0_-4px_24px_-6px_rgba(0,0,0,0.12)] z-30">
        <NavButton
          active={activeTab === 'dashboard'}
          onClick={() => setActiveTab('dashboard')}
          icon={<LayoutDashboard size={20} />}
          label="Today"
        />
        <NavButton
          active={activeTab === 'builder'}
          onClick={() => setActiveTab('builder')}
          icon={<CalendarPlus size={20} />}
          label="Build"
        />
        <NavButton
          active={activeTab === 'cleaners'}
          onClick={() => setActiveTab('cleaners')}
          icon={<UserCheck size={20} />}
          label="Cleaners"
        />
        <NavButton
          active={activeTab === 'clients'}
          onClick={() => setActiveTab('clients')}
          icon={<Users size={20} />}
          label="Clients"
        />
        <NavButton
          active={activeTab === 'reports'}
          onClick={() => setActiveTab('reports')}
          icon={<BarChart3 size={20} />}
          label="Reports"
        />
      </nav>

      {showFixModal && (
        <FixModal onClose={() => setShowFixModal(false)} />
      )}

      <ToastContainer />
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 min-w-[64px] py-1 rounded-xl transition-all active:scale-95 ${
        active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className={`p-1.5 rounded-xl transition-all ${active ? 'bg-blue-50 shadow-sm' : ''}`}>
        {icon}
      </div>
      <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

export default App;