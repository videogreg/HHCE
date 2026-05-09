import type { Cleaner, Client, Visit, Team, DayOfWeek } from '../types';
import { parse, isBefore, isAfter, addMinutes } from 'date-fns';

export interface ConstraintViolation {
  visitId: string;
  message: string;
  severity: 'error' | 'warning';
}

const timeToDate = (time: string) => parse(time, 'HH:mm', new Date());

export const checkConstraints = (
  visits: Visit[],
  cleaners: Cleaner[],
  clients: Client[],
  teams: Team[]
): ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];

  visits.filter(v => !v.cancelled).forEach(visit => {
    const client = clients.find(c => c.id === visit.clientId);
    const team = teams.find(t => t.id === visit.assignedTeamId);
    const teamCleaners = team ? cleaners.filter(c => team.cleanerIds.includes(c.id)) : [];

    if (!client) return;

    // 1. Client Day Preference
    if (client.preferredDays.length > 0) {
      const visitDate = new Date(visit.date + 'T00:00:00');
      const dayNames: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const visitDay = dayNames[visitDate.getDay()];
      if (!client.preferredDays.includes(visitDay)) {
        violations.push({
          visitId: visit.id,
          message: `Client ${client.name} prefers ${client.preferredDays.join(', ')} but scheduled for ${visitDay}.`,
          severity: 'warning'
        });
      }
    }

    // 2. Client Time Window
    const visitStart = timeToDate(visit.startTime);
    if (client.notBefore && isBefore(visitStart, timeToDate(client.notBefore))) {
      violations.push({
        visitId: visit.id,
        message: `Scheduled before client's ${client.notBefore} start time.`,
        severity: 'error'
      });
    }

    // 3. Cleaner Availability (Sick/Inactive)
    const inactiveCleaners = teamCleaners.filter(c => !c.active);
    if (inactiveCleaners.length > 0) {
      violations.push({
        visitId: visit.id,
        message: `Team includes inactive cleaner(s): ${inactiveCleaners.map(c => c.name).join(', ')}.`,
        severity: 'error'
      });
    }

    // 4. Cleaner Time Restrictions
    teamCleaners.forEach(cleaner => {
      if (cleaner.canStartAt && isBefore(visitStart, timeToDate(cleaner.canStartAt))) {
        violations.push({
          visitId: visit.id,
          message: `Cleaner ${cleaner.name} cannot start before ${cleaner.canStartAt}.`,
          severity: 'error'
        });
      }
      const visitEnd = addMinutes(visitStart, visit.durationMinutes);
      if (cleaner.mustBeOffBy && isAfter(visitEnd, timeToDate(cleaner.mustBeOffBy))) {
        violations.push({
          visitId: visit.id,
          message: `Cleaner ${cleaner.name} must be off by ${cleaner.mustBeOffBy}.`,
          severity: 'error'
        });
      }
    });

    // 5. Driver Requirement (at least one driver per team)
    if (team && teamCleaners.length > 0 && !teamCleaners.some(c => c.isDriver)) {
        // Warning instead of error because some might walk/bus as per prompt
        violations.push({
            visitId: visit.id,
            message: `Team ${team.name} has no driver.`,
            severity: 'warning'
        });
    }

    // 6. Cleaner Compatibility
    teamCleaners.forEach(c1 => {
        teamCleaners.forEach(c2 => {
            if (c1.cannotWorkWith.includes(c2.id)) {
                violations.push({
                    visitId: visit.id,
                    message: `${c1.name} and ${c2.name} cannot work together.`,
                    severity: 'error'
                });
            }
        });
    });
  });

  return violations;
};

/**
 * Basic re-optimizer:
 * 1. Identify visits in jeopardy (assigned to teams with sick cleaners)
 * 2. Try to move them to other active teams that have capacity and meet constraints
 */
export const reoptimizeSchedule = (
    currentVisits: Visit[],
    cleaners: Cleaner[],
    clients: Client[],
    teams: Team[]
): Visit[] => {
    const activeCleaners = cleaners.filter(c => c.active);
    const activeTeams = teams.filter(t => 
        t.cleanerIds.every(id => activeCleaners.some(ac => ac.id === id))
    );

    return currentVisits.map(visit => {
        if (visit.cancelled) return visit;

        const currentTeam = teams.find(t => t.id === visit.assignedTeamId);
        const hasIssue = !currentTeam || currentTeam.cleanerIds.some(id => !cleaners.find(c => c.id === id)?.active);

        if (!hasIssue) return visit;

        // Try to find a new team that satisfies all constraints
        for (const team of activeTeams) {
            const tempVisit = { ...visit, assignedTeamId: team.id };
            const violations = checkConstraints([tempVisit], cleaners, clients, teams);
            const hasErrors = violations.some(v => v.severity === 'error');
            
            if (!hasErrors) {
                return tempVisit;
            }
        }

        return visit; // Fallback to current if no perfect match found (will be flagged in UI)
    });
};
