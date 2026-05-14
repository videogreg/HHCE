import type { Cleaner, Client, Visit, Team, ConstraintViolation, ScheduleChange, CallItem } from '../types';
import { parse, isBefore, isAfter, addMinutes, format } from 'date-fns';

const timeToDate = (time: string) => parse(time, 'HH:mm', new Date());

/** Simple stable hash for violation IDs */
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

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

    let visitCleanerIds = visit.assignedCleanerIds || [];
    if (visitCleanerIds.length === 0 && team) {
      visitCleanerIds = team.cleanerIds;
    }
    const teamCleaners = cleaners.filter(c => visitCleanerIds.includes(c.id) && c.active);

    if (!client) return;

    if (client.preferredDays.length > 0) {
      const visitDate = new Date(visit.date + 'T00:00:00');
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const visitDay = dayNames[visitDate.getDay()];
      if (!client.preferredDays.includes(visitDay)) {
        violations.push({
          id: hashString(`${visit.id}-preferredDays-${visitDay}`),
          visitId: visit.id,
          message: `${client.name} prefers ${client.preferredDays.join(', ')} but scheduled for ${visitDay}.`,
          severity: 'warning'
        });
      }
    }

    // Check cleaner unavailable days
    teamCleaners.forEach(cleaner => {
      if (cleaner.unavailableDays.length > 0) {
        const visitDate = new Date(visit.date + 'T00:00:00');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const visitDay = dayNames[visitDate.getDay()];
        if (cleaner.unavailableDays.includes(visitDay)) {
          violations.push({
            id: hashString(`${visit.id}-unavailable-${cleaner.id}-${visitDay}`),
            visitId: visit.id,
            message: `${cleaner.name} is unavailable on ${visitDay}s.`,
            severity: 'error'
          });
        }
      }
    });

    const visitStart = timeToDate(visit.startTime);
    if (client.notBefore && isBefore(visitStart, timeToDate(client.notBefore))) {
      violations.push({
        id: hashString(`${visit.id}-notBefore-${client.notBefore}`),
        visitId: visit.id,
        message: `Starts before client's ${client.notBefore} limit.`,
        severity: 'error'
      });
    }
    const visitEnd = addMinutes(visitStart, visit.durationMinutes);
    if (client.notAfter && isAfter(visitEnd, timeToDate(client.notAfter))) {
      violations.push({
        id: hashString(`${visit.id}-notAfter-${client.notAfter}`),
        visitId: visit.id,
        message: `Ends after client's ${client.notAfter} limit.`,
        severity: 'error'
      });
    }

    if (visitCleanerIds.length > 0) {
      const inactiveOnTeam = visitCleanerIds.filter(id => !cleaners.find(c => c.id === id)?.active);
      if (inactiveOnTeam.length > 0) {
        const names = inactiveOnTeam.map(id => cleaners.find(c => c.id === id)?.name || 'Unknown').join(', ');
        violations.push({
          id: hashString(`${visit.id}-inactive-${names}`),
          visitId: visit.id,
          message: `Assigned inactive cleaner(s): ${names}.`,
          severity: 'error'
        });
      }
    }

    teamCleaners.forEach(cleaner => {
      if (cleaner.canStartAt && isBefore(visitStart, timeToDate(cleaner.canStartAt))) {
        violations.push({
          id: hashString(`${visit.id}-start-${cleaner.id}-${cleaner.canStartAt}`),
          visitId: visit.id,
          message: `${cleaner.name} cannot start before ${cleaner.canStartAt}.`,
          severity: 'error'
        });
      }
      if (cleaner.mustBeOffBy && isAfter(visitEnd, timeToDate(cleaner.mustBeOffBy))) {
        violations.push({
          id: hashString(`${visit.id}-off-${cleaner.id}-${cleaner.mustBeOffBy}`),
          visitId: visit.id,
          message: `${cleaner.name} must be off by ${cleaner.mustBeOffBy}.`,
          severity: 'error'
        });
      }
    });

    if (visitCleanerIds.length > 1 && !teamCleaners.some(c => c.isDriver)) {
      violations.push({
        id: hashString(`${visit.id}-noDriver`),
        visitId: visit.id,
        message: `No driver assigned (multi-person team).`,
        severity: 'warning'
      });
    }

    for (let i = 0; i < teamCleaners.length; i++) {
      for (let j = i + 1; j < teamCleaners.length; j++) {
        const c1 = teamCleaners[i];
        const c2 = teamCleaners[j];
        if (c1.cannotWorkWith.includes(c2.id) || c2.cannotWorkWith.includes(c1.id)) {
          violations.push({
            id: hashString(`${visit.id}-conflict-${c1.id}-${c2.id}`),
            visitId: visit.id,
            message: `${c1.name} and ${c2.name} cannot work together.`,
            severity: 'warning'
          });
        }
      }
    }

    const avoided = client.avoidCleaners.filter(id => visitCleanerIds.includes(id));
    if (avoided.length > 0) {
      const names = avoided.map(id => cleaners.find(c => c.id === id)?.name || 'Unknown').join(', ');
      violations.push({
        id: hashString(`${visit.id}-avoid-${names}`),
        visitId: visit.id,
        message: `${client.name} avoids cleaner(s): ${names}.`,
        severity: 'error'
      });
    }
    if (client.preferredCleaners.length > 0) {
      const hasPreferred = visitCleanerIds.some(id => client.preferredCleaners.includes(id));
      if (!hasPreferred) {
        violations.push({
          id: hashString(`${visit.id}-preferredMissing`),
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
  const changes: ScheduleChange[] = [];

  const newVisits = currentVisits.map(visit => {
    if (visit.cancelled) return visit;

    const currentTeam = teams.find(t => t.id === visit.assignedTeamId);
    let visitCleanerIds = visit.assignedCleanerIds || [];
    if (visitCleanerIds.length === 0 && currentTeam) {
      visitCleanerIds = currentTeam.cleanerIds;
    }

    const sickIds = visitCleanerIds.filter(id => !cleaners.find(c => c.id === id)?.active);
    const hasSickMember = sickIds.length > 0;
    const currentVios = checkConstraints([visit], cleaners, clients, teams);
    const hasErrors = currentVios.some(v => v.severity === 'error');

    if (!hasSickMember && !hasErrors) return visit;

    const client = clients.find(c => c.id === visit.clientId);
    if (!client) return visit;

    // Strategy 1: Replace sick cleaner(s) with a replacement, keep healthy members
    if (hasSickMember && currentTeam) {
      const healthyIds = visitCleanerIds.filter(id => cleaners.find(c => c.id === id)?.active);
      const needsDriver = healthyIds.length > 0 && !cleaners.filter(c => healthyIds.includes(c.id)).some(c => c.isDriver);

      const candidates = activeCleaners.filter(c => {
        if (visitCleanerIds.includes(c.id)) return false;
        if (client.avoidCleaners.includes(c.id)) return false;
        if (healthyIds.some(hid => {
          const h = cleaners.find(x => x.id === hid);
          return h && (h.cannotWorkWith.includes(c.id) || c.cannotWorkWith.includes(h.id));
        })) return false;
        if (needsDriver && !c.isDriver) return false;
        return true;
      });

      for (const candidate of candidates) {
        const newIds = [...healthyIds, candidate.id];
        const tempVisit = { ...visit, assignedCleanerIds: newIds, assignedTeamId: currentTeam.id, teamName: currentTeam.name };
        const vios = checkConstraints([tempVisit], cleaners, clients, teams);
        if (!vios.some(v => v.severity === 'error')) {
          const sickNames = sickIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ');
          changes.push({
            visitId: visit.id,
            clientName: visit.clientName,
            oldTeamId: visit.assignedTeamId,
            newTeamId: currentTeam.id,
            oldTeamName: `${currentTeam.name} (lost ${sickNames})`,
            newTeamName: `${currentTeam.name} + ${candidate.name}`,
            reason: `Replaced sick cleaner(s): ${sickNames}`
          });
          return tempVisit;
        }
      }
    }

    // Strategy 2: Swap to a completely different active team
    const activeTeams = teams.filter(t =>
      t.cleanerIds.length > 0 && t.cleanerIds.every(id => activeCleaners.some(ac => ac.id === id))
    );

    for (const team of activeTeams) {
      const tempVisit = { ...visit, assignedTeamId: team.id, assignedCleanerIds: team.cleanerIds, teamName: team.name };
      const vios = checkConstraints([tempVisit], cleaners, clients, teams);
      const teamHasErrors = vios.some(v => v.severity === 'error');

      if (!teamHasErrors) {
        if (team.id !== visit.assignedTeamId) {
          changes.push({
            visitId: visit.id,
            clientName: visit.clientName,
            oldTeamId: visit.assignedTeamId,
            newTeamId: team.id,
            oldTeamName: currentTeam?.name || 'Unassigned',
            newTeamName: team.name,
            reason: hasSickMember ? 'Sick cleaner — full team swap' : 'Constraint violation — team swap'
          });
        }
        return tempVisit;
      }
    }

    // Strategy 3: Assign a solo cleaner
    const soloCandidates = activeCleaners.filter(c => {
      if (client.avoidCleaners.includes(c.id)) return false;
      const tempVisit = { ...visit, assignedCleanerIds: [c.id], assignedTeamId: '' };
      const vios = checkConstraints([tempVisit], cleaners, clients, teams);
      return !vios.some(v => v.severity === 'error');
    });

    if (soloCandidates.length > 0) {
      const best = soloCandidates[0];
      changes.push({
        visitId: visit.id,
        clientName: visit.clientName,
        oldTeamId: visit.assignedTeamId,
        newTeamId: '',
        oldTeamName: currentTeam?.name || 'Unassigned',
        newTeamName: `Solo: ${best.name}`,
        reason: hasSickMember ? 'Sick cleaner — assigned solo' : 'Constraint violation — assigned solo'
      });
      return { ...visit, assignedCleanerIds: [best.id], assignedTeamId: '' };
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