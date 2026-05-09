import type { Cleaner, Client, Visit, Team, ConstraintViolation, ScheduleChange, CallItem } from '../types';
import { parse, isBefore, isAfter, addMinutes, format } from 'date-fns';

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

    // Use assignedCleanerIds if set, otherwise fall back to team cleanerIds
    let visitCleanerIds = visit.assignedCleanerIds || [];
    if (visitCleanerIds.length === 0 && team) {
      visitCleanerIds = team.cleanerIds;
    }
    const teamCleaners = cleaners.filter(c => visitCleanerIds.includes(c.id) && c.active);

    if (!client) return;

    // 1. Client Day Preference
    if (client.preferredDays.length > 0) {
      const visitDate = new Date(visit.date + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const visitDay = dayNames[visitDate.getDay()];
      if (!client.preferredDays.includes(visitDay)) {
        violations.push({
          visitId: visit.id,
          message: `${client.name} prefers ${client.preferredDays.join(', ')} but scheduled for ${visitDay}.`,
          severity: 'warning'
        });
      }
    }

    // 2. Client Time Window
    const visitStart = timeToDate(visit.startTime);
    if (client.notBefore && isBefore(visitStart, timeToDate(client.notBefore))) {
      violations.push({
        visitId: visit.id,
        message: `Starts before client's ${client.notBefore} limit.`,
        severity: 'error'
      });
    }
    const visitEnd = addMinutes(visitStart, visit.durationMinutes);
    if (client.notAfter && isAfter(visitEnd, timeToDate(client.notAfter))) {
      violations.push({
        visitId: visit.id,
        message: `Ends after client's ${client.notAfter} limit.`,
        severity: 'error'
      });
    }

    // 3. Cleaner Availability (Sick/Inactive)
    if (visitCleanerIds.length > 0) {
      const inactiveOnTeam = visitCleanerIds.filter(id => !cleaners.find(c => c.id === id)?.active);
      if (inactiveOnTeam.length > 0) {
        const names = inactiveOnTeam.map(id => cleaners.find(c => c.id === id)?.name || 'Unknown').join(', ');
        violations.push({
          visitId: visit.id,
          message: `Assigned inactive cleaner(s): ${names}.`,
          severity: 'error'
        });
      }
    }

    // 4. Cleaner Time Restrictions
    teamCleaners.forEach(cleaner => {
      if (cleaner.canStartAt && isBefore(visitStart, timeToDate(cleaner.canStartAt))) {
        violations.push({
          visitId: visit.id,
          message: `${cleaner.name} cannot start before ${cleaner.canStartAt}.`,
          severity: 'error'
        });
      }
      if (cleaner.mustBeOffBy && isAfter(visitEnd, timeToDate(cleaner.mustBeOffBy))) {
        violations.push({
          visitId: visit.id,
          message: `${cleaner.name} must be off by ${cleaner.mustBeOffBy}.`,
          severity: 'error'
        });
      }
    });

    // 5. Driver Requirement (at least one driver per team with 2+ people)
    if (visitCleanerIds.length > 1 && !teamCleaners.some(c => c.isDriver)) {
      violations.push({
        visitId: visit.id,
        message: `No driver assigned (multi-person team).`,
        severity: 'warning'
      });
    }

    // 6. Cleaner Compatibility
    for (let i = 0; i < teamCleaners.length; i++) {
      for (let j = i + 1; j < teamCleaners.length; j++) {
        const c1 = teamCleaners[i];
        const c2 = teamCleaners[j];
        if (c1.cannotWorkWith.includes(c2.id) || c2.cannotWorkWith.includes(c1.id)) {
          violations.push({
            visitId: visit.id,
            message: `${c1.name} and ${c2.name} cannot work together.`,
            severity: 'error'
          });
        }
      }
    }

    // 7. Client preferred/avoided cleaners
    const avoided = client.avoidCleaners.filter(id => visitCleanerIds.includes(id));
    if (avoided.length > 0) {
      const names = avoided.map(id => cleaners.find(c => c.id === id)?.name || 'Unknown').join(', ');
      violations.push({
        visitId: visit.id,
        message: `${client.name} avoids cleaner(s): ${names}.`,
        severity: 'error'
      });
    }
    if (client.preferredCleaners.length > 0) {
      const hasPreferred = visitCleanerIds.some(id => client.preferredCleaners.includes(id));
      if (!hasPreferred) {
        violations.push({
          visitId: visit.id,
          message: `${client.name} requested specific cleaner(s) not assigned.`,
          severity: 'warning'
        });
      }
    }
  });

  return violations;
};

export const reoptimizeSchedule = (
  currentVisits: Visit[],
  cleaners: Cleaner[],
  clients: Client[],
  teams: Team[]
): { visits: Visit[]; changes: ScheduleChange[] } => {
  const activeCleaners = cleaners.filter(c => c.active);
  const activeTeams = teams.filter(t =>
    t.cleanerIds.length > 0 && t.cleanerIds.every(id => activeCleaners.some(ac => ac.id === id))
  );

  const changes: ScheduleChange[] = [];

  const newVisits = currentVisits.map(visit => {
    if (visit.cancelled) return visit;

    const currentTeam = teams.find(t => t.id === visit.assignedTeamId);
    let visitCleanerIds = visit.assignedCleanerIds || [];
    if (visitCleanerIds.length === 0 && currentTeam) {
      visitCleanerIds = currentTeam.cleanerIds;
    }
    const hasIssue = visitCleanerIds.some(id => !cleaners.find(c => c.id === id)?.active);

    if (!hasIssue) {
      const vios = checkConstraints([visit], cleaners, clients, teams);
      if (!vios.some(v => v.severity === 'error')) return visit;
    }

    const client = clients.find(c => c.id === visit.clientId);
    if (!client) return visit;

    // Try each active team
    for (const team of activeTeams) {
      const tempVisit = { ...visit, assignedTeamId: team.id, assignedCleanerIds: team.cleanerIds, teamName: team.name };
      const vios = checkConstraints([tempVisit], cleaners, clients, teams);
      const hasErrors = vios.some(v => v.severity === 'error');

      if (!hasErrors) {
        if (team.id !== visit.assignedTeamId) {
          changes.push({
            visitId: visit.id,
            clientName: visit.clientName,
            oldTeamId: visit.assignedTeamId,
            newTeamId: team.id,
            oldTeamName: currentTeam?.name || 'Unassigned',
            newTeamName: team.name,
            reason: hasIssue ? 'Sick cleaner on original team' : 'Constraint violation on original team'
          });
        }
        return tempVisit;
      }
    }

    return visit;
  });

  return { visits: newVisits, changes };
};

export const generateCallList = (
  changes: ScheduleChange[],
  clients: Client[],
  cleaners: Cleaner[],
  teams: Team[]
): CallItem[] => {
  const calls: CallItem[] = [];

  changes.forEach(change => {
    const clientByName = clients.find(c => c.name === change.clientName);

    calls.push({
      type: 'client',
      name: change.clientName,
      phone: clientByName?.phone,
      message: `Your cleaning team has changed from ${change.oldTeamName} to ${change.newTeamName}. Same time, different crew.`,
      priority: 'normal'
    });

    const newTeam = teams.find(t => t.id === change.newTeamId);
    if (newTeam) {
      newTeam.cleanerIds.forEach(cid => {
        const cleaner = cleaners.find(c => c.id === cid);
        if (cleaner && cleaner.active) {
          calls.push({
            type: 'cleaner',
            name: cleaner.name,
            phone: cleaner.phone,
            message: `New assignment: ${change.clientName} (${change.reason}).`,
            priority: 'normal'
          });
        }
      });
    }
  });

  const unique = calls.filter((item, index, self) =>
    index === self.findIndex(t => t.name === item.name && t.message === item.message)
  );

  return unique;
};

export const getDayName = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return format(d, 'EEEE');
};
