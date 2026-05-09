import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Cleaner, Client, Visit, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../utils/supabase';

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
  resetAllData: () => void;
  loadDemoData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const TEAM_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d'];
const CLEANER_COLORS = ['#dbeafe', '#d1fae5', '#fef3c7', '#ede9fe', '#fee2e2', '#cffafe', '#fce7f3'];

const createDemoData = (): AppState => {
  const c1: Cleaner = { id: 'c1', name: 'Sarah', isDriver: true, canStartAt: '08:00', mustBeOffBy: '15:00', cannotWorkWith: [], active: true, phone: '555-0101', color: CLEANER_COLORS[0] };
  const c2: Cleaner = { id: 'c2', name: 'Mike', isDriver: true, canStartAt: '09:00', mustBeOffBy: '17:00', cannotWorkWith: [], active: true, phone: '555-0102', color: CLEANER_COLORS[1] };
  const c3: Cleaner = { id: 'c3', name: 'Jessica', isDriver: false, canStartAt: '08:30', mustBeOffBy: '14:30', cannotWorkWith: ['c5'], active: true, phone: '555-0103', color: CLEANER_COLORS[2] };
  const c4: Cleaner = { id: 'c4', name: 'David', isDriver: true, canStartAt: '08:00', mustBeOffBy: '16:00', cannotWorkWith: [], active: true, phone: '555-0104', color: CLEANER_COLORS[3] };
  const c5: Cleaner = { id: 'c5', name: 'Emma', isDriver: false, canStartAt: '10:00', mustBeOffBy: '15:00', cannotWorkWith: ['c3'], active: true, phone: '555-0105', color: CLEANER_COLORS[4] };
  const c6: Cleaner = { id: 'c6', name: 'Alex', isDriver: true, canStartAt: '08:00', mustBeOffBy: '17:00', cannotWorkWith: [], active: true, phone: '555-0106', color: CLEANER_COLORS[5] };

  const cleaners = [c1, c2, c3, c4, c5, c6];

  const cl1: Client = { id: 'cl1', name: 'Johnson Residence', address: '42 Maple Ave, North End', zone: 'North', preferredDays: ['Tuesday', 'Thursday'], notBefore: '09:30', notAfter: '14:00', preferredCleaners: ['c1'], avoidCleaners: [], durationMinutes: 120, phone: '555-1001', notes: 'Allergic to strong scents' };
  const cl2: Client = { id: 'cl2', name: 'Smith Family', address: '88 Oak St, Downtown', zone: 'Downtown', preferredDays: ['Monday', 'Wednesday', 'Friday'], notBefore: '08:00', notAfter: '17:00', preferredCleaners: [], avoidCleaners: ['c5'], durationMinutes: 90, phone: '555-1002' };
  const cl3: Client = { id: 'cl3', name: 'Garcia Home', address: '15 Pine Rd, Westside', zone: 'West', preferredDays: ['Tuesday'], notBefore: '10:00', notAfter: '16:00', preferredCleaners: ['c2', 'c4'], avoidCleaners: [], durationMinutes: 150, phone: '555-1003', notes: 'Never Tuesdays before 10am' };
  const cl4: Client = { id: 'cl4', name: 'Williams Condo', address: '200 River Blvd, Downtown', zone: 'Downtown', preferredDays: [], notBefore: '09:00', notAfter: '12:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 75, phone: '555-1004' };
  const cl5: Client = { id: 'cl5', name: 'Brown Estate', address: '77 Hilltop Dr, North End', zone: 'North', preferredDays: ['Wednesday', 'Friday'], notBefore: '08:00', notAfter: '17:00', preferredCleaners: ['c6'], avoidCleaners: ['c3'], durationMinutes: 180, phone: '555-1005' };
  const cl6: Client = { id: 'cl6', name: 'Davis Apartment', address: '33 Main St, Downtown', zone: 'Downtown', preferredDays: ['Monday', 'Thursday'], notBefore: '09:00', notAfter: '15:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 60, phone: '555-1006' };
  const cl7: Client = { id: 'cl7', name: 'Miller House', address: '9 Cedar Ln, Westside', zone: 'West', preferredDays: ['Friday'], notBefore: '11:00', notAfter: '14:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 120, phone: '555-1007' };
  const cl8: Client = { id: 'cl8', name: 'Wilson Cottage', address: '55 Beach Rd, Eastside', zone: 'East', preferredDays: [], notBefore: '08:00', notAfter: '17:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 90, phone: '555-1008' };

  const clients = [cl1, cl2, cl3, cl4, cl5, cl6, cl7, cl8];

  const t1: Team = { id: 't1', name: 'Team A', cleanerIds: ['c1', 'c3'], color: TEAM_COLORS[0] };
  const t2: Team = { id: 't2', name: 'Team B', cleanerIds: ['c2', 'c5'], color: TEAM_COLORS[1] };
  const t3: Team = { id: 't3', name: 'Team C', cleanerIds: ['c4', 'c6'], color: TEAM_COLORS[2] };
  const t4: Team = { id: 't4', name: 'Solo C1', cleanerIds: ['c1'], color: TEAM_COLORS[3] };

  const teams = [t1, t2, t3, t4];

  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const visits: Visit[] = [
    { id: uuidv4(), clientId: cl1.id, clientName: cl1.name, clientAddress: cl1.address, clientZone: cl1.zone, date: formatDate(today), startTime: '09:30', durationMinutes: 120, assignedTeamId: t1.id, assignedCleanerIds: t1.cleanerIds, cancelled: false, teamName: t1.name },
    { id: uuidv4(), clientId: cl2.id, clientName: cl2.name, clientAddress: cl2.address, clientZone: cl2.zone, date: formatDate(today), startTime: '10:00', durationMinutes: 90, assignedTeamId: t2.id, assignedCleanerIds: t2.cleanerIds, cancelled: false, teamName: t2.name },
    { id: uuidv4(), clientId: cl4.id, clientName: cl4.name, clientAddress: cl4.address, clientZone: cl4.zone, date: formatDate(today), startTime: '09:00', durationMinutes: 75, assignedTeamId: t3.id, assignedCleanerIds: t3.cleanerIds, cancelled: false, teamName: t3.name },
    { id: uuidv4(), clientId: cl6.id, clientName: cl6.name, clientAddress: cl6.address, clientZone: cl6.zone, date: formatDate(addDays(today, 1)), startTime: '09:00', durationMinutes: 60, assignedTeamId: t1.id, assignedCleanerIds: t1.cleanerIds, cancelled: false, teamName: t1.name },
    { id: uuidv4(), clientId: cl3.id, clientName: cl3.name, clientAddress: cl3.address, clientZone: cl3.zone, date: formatDate(addDays(today, 2)), startTime: '10:00', durationMinutes: 150, assignedTeamId: t2.id, assignedCleanerIds: t2.cleanerIds, cancelled: false, teamName: t2.name },
    { id: uuidv4(), clientId: cl5.id, clientName: cl5.name, clientAddress: cl5.address, clientZone: cl5.zone, date: formatDate(addDays(today, 2)), startTime: '08:00', durationMinutes: 180, assignedTeamId: t3.id, assignedCleanerIds: t3.cleanerIds, cancelled: false, teamName: t3.name },
    { id: uuidv4(), clientId: cl7.id, clientName: cl7.name, clientAddress: cl7.address, clientZone: cl7.zone, date: formatDate(addDays(today, 4)), startTime: '11:00', durationMinutes: 120, assignedTeamId: t1.id, assignedCleanerIds: t1.cleanerIds, cancelled: false, teamName: t1.name },
    { id: uuidv4(), clientId: cl8.id, clientName: cl8.name, clientAddress: cl8.address, clientZone: cl8.zone, date: formatDate(addDays(today, 4)), startTime: '13:00', durationMinutes: 90, assignedTeamId: t2.id, assignedCleanerIds: t2.cleanerIds, cancelled: false, teamName: t2.name },
  ];

  return { cleaners, clients, visits, teams };
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loaded, setLoaded] = useState(false);
  const skipNextSave = useRef(false);

  // 1. Load from Supabase on mount
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('app_state')
        .select('data')
        .eq('key', 'main')
        .single();

      if (error) {
        console.error('Supabase load error:', error);
        setLoaded(true);
        return;
      }

      if (data?.data) {
        const parsed = data.data as AppState;
        if (parsed.cleaners) setCleaners(parsed.cleaners);
        if (parsed.clients) setClients(parsed.clients);
        if (parsed.visits) setVisits(parsed.visits);
        if (parsed.teams) setTeams(parsed.teams);
      }
      setLoaded(true);
    };
    load();
  }, []);

  // 2. Real-time subscription — sync changes from other devices instantly
  useEffect(() => {
    const channel = supabase
      .channel('app_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_state', filter: 'key=eq.main' },
        (payload) => {
          const parsed = payload.new.data as AppState;
          skipNextSave.current = true; // Prevent echo back to Supabase
          if (parsed.cleaners) setCleaners(parsed.cleaners);
          if (parsed.clients) setClients(parsed.clients);
          if (parsed.visits) setVisits(parsed.visits);
          if (parsed.teams) setTeams(parsed.teams);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Save to Supabase whenever state changes (debounced)
  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const data: AppState = { cleaners, clients, visits, teams };

    const timeout = setTimeout(async () => {
      await supabase
        .from('app_state')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('key', 'main');
    }, 500); // 500ms debounce

    return () => clearTimeout(timeout);
  }, [cleaners, clients, visits, teams, loaded]);

  const resetAllData = () => {
    if (confirm('Erase ALL data from Supabase? This cannot be undone.')) {
      setCleaners([]);
      setClients([]);
      setVisits([]);
      setTeams([]);
      supabase.from('app_state').update({ data: {}, updated_at: new Date().toISOString() }).eq('key', 'main');
    }
  };

  const loadDemoData = () => {
    if (cleaners.length > 0 && !confirm('Replace current data with demo data?')) return;
    const demo = createDemoData();
    setCleaners(demo.cleaners);
    setClients(demo.clients);
    setVisits(demo.visits);
    setTeams(demo.teams);
  };

  return (
    <AppContext.Provider value={{
      cleaners, setCleaners,
      clients, setClients,
      visits, setVisits,
      teams, setTeams,
      resetAllData,
      loadDemoData
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