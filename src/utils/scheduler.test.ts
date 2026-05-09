import { describe, it, expect } from 'vitest';
import { checkConstraints } from './scheduler';
import type { Cleaner, Client, Visit, Team } from '../types';

describe('checkConstraints', () => {
  const mockCleaners: Cleaner[] = [
    { id: 'c1', name: 'Alice', isDriver: true, active: true, cannotWorkWith: [] },
    { id: 'c2', name: 'Bob', isDriver: false, active: true, cannotWorkWith: ['c1'] },
  ];

  const mockClients: Client[] = [
    { id: 'cl1', name: 'Home A', address: '', preferredDays: ['Tuesday'], notBefore: '10:00', preferredCleaners: [], avoidCleaners: [] },
  ];

  const mockTeams: Team[] = [
    { id: 't1', name: 'Team 1', cleanerIds: ['c1', 'c2'] },
  ];

  it('should flag cleaner compatibility issues', () => {
    const visits: Visit[] = [
      { id: 'v1', clientId: 'cl1', clientName: 'Home A', date: '2024-05-07', startTime: '10:00', durationMinutes: 60, assignedTeamId: 't1', cancelled: false }
    ];

    const violations = checkConstraints(visits, mockCleaners, mockClients, mockTeams);
    expect(violations.some(v => v.message.includes('cannot work together'))).toBe(true);
  });

  it('should flag client time window violations', () => {
     const visits: Visit[] = [
      { id: 'v1', clientId: 'cl1', clientName: 'Home A', date: '2024-05-07', startTime: '09:00', durationMinutes: 60, assignedTeamId: 't1', cancelled: false }
    ];

    const violations = checkConstraints(visits, mockCleaners, mockClients, mockTeams);
    expect(violations.some(v => v.severity === 'error' && v.message.includes('before client\'s 10:00'))).toBe(true);
  });
});
