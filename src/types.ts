export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface TimeRange {
  start: string; // HH:mm
  end: string;   // HH:mm
}

export interface Cleaner {
  id: string;
  name: string;
  isDriver: boolean;
  canStartAt?: string; // HH:mm
  mustBeOffBy?: string; // HH:mm
  cannotWorkWith: string[]; // Array of cleaner IDs
  active: boolean; // For "Morning Nightmare" sick calls
}

export interface Client {
  id: string;
  name: string;
  address: string;
  preferredDays: DayOfWeek[];
  notBefore?: string; // HH:mm
  notAfter?: string;  // HH:mm
  preferredCleaners: string[]; // Cleaner IDs
  avoidCleaners: string[];    // Cleaner IDs
}

export interface Visit {
  id: string;
  clientId: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  assignedTeamId: string;
  cancelled: boolean; // For "Morning Nightmare"
}

export interface Team {
  id: string;
  cleanerIds: string[];
  name: string;
}

export interface DailySchedule {
  date: string;
  teams: Team[];
  visits: Visit[];
}
