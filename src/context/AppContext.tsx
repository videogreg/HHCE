import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Cleaner, Client, Visit, Team } from '../types';

interface AppState {
  cleaners: Cleaner[];
  clients: Client[];
  visits: Visit[];
  teams: Team[];
}

interface AppContextType extends AppState {
  setCleaners: React.Dispatch<React.SetStateAction<Cleaner[]>>;
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  setVisits: React.Dispatch<React.SetStateAction<Visit[]>>;
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'hhce_scheduler_data';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.cleaners) setCleaners(parsed.cleaners);
        if (parsed.clients) setClients(parsed.clients);
        if (parsed.visits) setVisits(parsed.visits);
        if (parsed.teams) setTeams(parsed.teams);
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    const data = { cleaners, clients, visits, teams };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [cleaners, clients, visits, teams]);

  return (
    <AppContext.Provider value={{
      cleaners, setCleaners,
      clients, setClients,
      visits, setVisits,
      teams, setTeams
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
