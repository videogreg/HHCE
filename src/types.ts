export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface Cleaner {
  id: string;
  name: string;
  isDriver: boolean;
  canStartAt?: string; // HH:mm
  mustBeOffBy?: string; // HH:mm
  cannotWorkWith: string[]; // Cleaner IDs
  unavailableDays: DayOfWeek[]; // Days they cannot work (e.g. religious observance)
  active: boolean;
  inactiveUntil?: string; // YYYY-MM-DD date when cleaner returns (if active=false)
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  color?: string; // hex color for UI
  password?: string; // ← ADD THIS LINE
}

export interface Client {
  id: string;
  name: string;
  address: string;
  zone?: string; // Travel grouping area (e.g. "North", "Downtown")
  preferredDays: DayOfWeek[];
  notBefore?: string; // HH:mm
  notAfter?: string;  // HH:mm
  preferredCleaners: string[]; // Cleaner IDs
  avoidCleaners: string[];     // Cleaner IDs
  durationMinutes: number; // Default clean duration
  phone?: string;
  email?: string;
  notes?: string;
  instructions?: string; // door codes, access info, cleaning instructions for cleaners
}

export interface Visit {
  id: string;
  clientId: string;
  clientName: string;
  clientAddress: string;
  clientZone?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  assignedTeamId: string;
  assignedCleanerIds?: string[]; // Optional direct assignment override
  cancelled: boolean;
  teamName?: string;
  jobType?: string;
  price?: number;
  notes?: string;
  checkedInCleanerIds?: string[]; // Cleaner IDs who have checked in at this visit
  finishedCleanerIds?: string[]; // Cleaner IDs who have marked this visit finished
  checkInTimes?: Record<string, string>; // cleanerId → ISO timestamp
  finishTimes?: Record<string, string>; // cleanerId → ISO timestamp
  dismissedViolations?: string[]; // IDs of alerts the user has dismissed for this visit
}

export interface Team {
  id: string;
  cleanerIds: string[];
  name: string;
  color?: string;
}

export interface ConstraintViolation {
  id: string; // Stable hash so it can be dismissed
  visitId: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ScheduleChange {
  visitId: string;
  clientName: string;
  oldTeamId: string;
  newTeamId: string;
  oldTeamName: string;
  newTeamName: string;
  reason: string;
}

export interface CallItem {
  type: 'client' | 'cleaner';
  name: string;
  phone?: string;
  message: string;
  priority: 'urgent' | 'normal';
}