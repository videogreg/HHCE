import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { PasswordGate } from './components/PasswordGate';
import { CleanerManager } from './components/CleanerManager';
import { ClientManager } from './components/ClientManager';
import { ScheduleBoard } from './components/ScheduleBoard';
import { ScheduleBuilder } from './components/ScheduleBuilder';
import { FixModal } from './components/FixModal';
import { SearchBar } from './components/SearchBar';
import { LayoutDashboard, Users, UserCheck, Wrench, Sparkles, CalendarPlus } from 'lucide-react';

function App() {
  return (
    <AppProvider>
      <PasswordGate>
        <AppContent />
      </PasswordGate>
    </AppProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'builder' | 'cleaners' | 'clients'>('dashboard');
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

      <SearchBar onNavigate={(tab, id) => { setActiveTab(tab); setFocusId(id || null); }} />

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {activeTab === 'dashboard' && <ScheduleBoard focusVisitId={focusId} onFocusClear={() => setFocusId(null)} />}
        {activeTab === 'builder' && <ScheduleBuilder />}
        {activeTab === 'cleaners' && <CleanerManager focusId={focusId} onFocusClear={() => setFocusId(null)} />}
        {activeTab === 'clients' && <ClientManager focusId={focusId} onFocusClear={() => setFocusId(null)} />}
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
      </nav>

      {showFixModal && (
        <FixModal onClose={() => setShowFixModal(false)} />
      )}
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