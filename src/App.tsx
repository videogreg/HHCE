import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { PasswordGate } from './components/PasswordGate';
import { CleanerManager } from './components/CleanerManager';
import { ClientManager } from './components/ClientManager';
import { ScheduleBoard } from './components/ScheduleBoard';
import { ScheduleBuilder } from './components/ScheduleBuilder';
import { ReorganizeModal } from './components/ReorganizeModal';
import { LayoutDashboard, Users, UserCheck, AlertTriangle, Sparkles, CalendarPlus, Database } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'builder' | 'cleaners' | 'clients' | 'nightmare'>('dashboard');
  const { cleaners, clients, visits, loadDemoData } = useAppContext();
  const isEmpty = cleaners.length === 0 && clients.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      {/* Header */}
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
            {isEmpty && (
              <button
                onClick={loadDemoData}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors border border-slate-700"
              >
                <Database size={14} /> Load Demo
              </button>
            )}
            <button
              onClick={() => setActiveTab('nightmare')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs sm:text-sm transition-all active:scale-95 ${
                activeTab === 'nightmare'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-900/40 ring-2 ring-red-400/30'
                  : 'bg-red-950/60 text-red-400 hover:bg-red-900/60 border border-red-900'
              }`}
            >
              <AlertTriangle size={16} />
              <span className="hidden sm:inline">Nightmare</span>
              <span className="sm:hidden">Fix</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {isEmpty && activeTab !== 'nightmare' ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-slide-up">
            <div className="w-20 h-20 bg-slate-200 rounded-2xl flex items-center justify-center mb-6">
              <Sparkles size={40} className="text-slate-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to HHCE Scheduler</h2>
            <p className="text-slate-500 max-w-md mb-8">Add your cleaners and clients, or load demo data to see how the app works.</p>
            <div className="flex gap-3">
              <button
                onClick={loadDemoData}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              >
                Load Demo Data
              </button>
              <button
                onClick={() => setActiveTab('cleaners')}
                className="px-6 py-3 bg-white text-slate-700 border border-slate-300 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors"
              >
                Add Cleaners
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <ScheduleBoard />}
            {activeTab === 'builder' && <ScheduleBuilder />}
            {activeTab === 'cleaners' && <CleanerManager />}
            {activeTab === 'clients' && <ClientManager />}
            {activeTab === 'nightmare' && (
              <div className="max-w-3xl mx-auto">
                <ReorganizeModal />
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation */}
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
