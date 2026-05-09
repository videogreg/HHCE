import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { CleanerManager } from './components/CleanerManager';
import { ClientManager } from './components/ClientManager';
import { ScheduleBoard } from './components/ScheduleBoard';
import { ReorganizeModal } from './components/ReorganizeModal';
import { LayoutDashboard, Users, UserCheck, AlertTriangle, Sparkles } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'cleaners' | 'clients' | 'nightmare'>('schedule');

  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                <Sparkles size={24} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-blue-900 leading-none">HHCE</h1>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Happy House Cleaning Experts</p>
              </div>
            </div>
            
            <button 
              onClick={() => setActiveTab('nightmare')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${
                activeTab === 'nightmare' 
                ? 'bg-red-600 text-white shadow-lg shadow-red-200 ring-4 ring-red-100' 
                : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              <AlertTriangle size={16} />
              <span className="hidden sm:inline">Nightmare Mode</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8 pb-32">
          {activeTab === 'schedule' && <ScheduleBoard />}
          {activeTab === 'cleaners' && <CleanerManager />}
          {activeTab === 'clients' && <ClientManager />}
          {activeTab === 'nightmare' && (
            <div className="max-w-2xl mx-auto">
              <ReorganizeModal />
            </div>
          )}
        </main>

        {/* Bottom Navigation (Mobile Friendly) */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] z-20">
          <NavButton 
            active={activeTab === 'schedule'} 
            onClick={() => setActiveTab('schedule')}
            icon={<LayoutDashboard size={20} />}
            label="Schedule"
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
    </AppProvider>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 transition-colors ${
        active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <div className={`p-2 rounded-xl transition-all ${active ? 'bg-blue-50' : ''}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

export default App;
