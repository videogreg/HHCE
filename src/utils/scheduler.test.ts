import { describe, it, expect } from 'vitest';
import { checkConstraints } from './scheduler';
import type { Cleaner, Client, Visit, Team } from '../types';

describe('checkConstraints', () => {
  const mockCleaners: Cleaner[] = [
    { id: 'c1', name: 'Alice', isDriver: true, active: true, cannotWorkWith: [], unavailableDays: [], color: '#dbeafe' },
    { id: 'c2', name: 'Bob', isDriver: false, active: true, cannotWorkWith: ['c1'], unavailableDays: [], color: '#d1fae5' },
  ];

  const mockClients: Client[] = [
    { id: 'cl1', name: 'Home A', address: '', preferredDays: ['Tuesday'], notBefore: '10:00', preferredCleaners: [], avoidCleaners: [], durationMinutes: 120 },
  ];

  const mockTeams: Team[] = [
    { id: 't1', name: 'Team 1', cleanerIds: ['c1', 'c2'], color: '#2563eb' },
  ];

  it('should flag cleaner compatibility issues', () => {
    const visits: Visit[] = [
      { id: 'v1', clientId: 'cl1', clientName: 'Home A', clientAddress: '', date: '2024-05-07', startTime: '10:00', durationMinutes: 60, assignedTeamId: 't1', cancelled: false }
    ];

    const violations = checkConstraints(visits, mockCleaners, mockClients, mockTeams);
    expect(violations.some(v => v.message.includes('cannot work together'))).toBe(true);
  });

  it('should flag client time window violations', () => {
    const visits: Visit[] = [
      { id: 'v1', clientId: 'cl1', clientName: 'Home A', clientAddress: '', date: '2024-05-07', startTime: '09:00', durationMinutes: 60, assignedTeamId: 't1', cancelled: false }
    ];

    const violations = checkConstraints(visits, mockCleaners, mockClients, mockTeams);
    expect(violations.some(v => v.severity === 'error' && v.message.includes("before client's 10:00"))).toBe(true);
  });

  it('should flag multiple drivers on the same visit', () => {
    const twoDrivers: Cleaner[] = [
      { id: 'c1', name: 'Alice', isDriver: true, active: true, cannotWorkWith: [], unavailableDays: [], color: '#dbeafe' },
      { id: 'c3', name: 'Charlie', isDriver: true, active: true, cannotWorkWith: [], unavailableDays: [], color: '#fef3c7' },
    ];
    const visits: Visit[] = [
      { id: 'v2', clientId: 'cl1', clientName: 'Home A', clientAddress: '', date: '2024-05-07', startTime: '11:00', durationMinutes: 60, assignedCleanerIds: ['c1', 'c3'], assignedTeamId: '', cancelled: false }
    ];

    const violations = checkConstraints(visits, twoDrivers, mockClients, mockTeams);
    expect(violations.some(v => v.severity === 'error' && v.message.includes('Multiple drivers assigned'))).toBe(true);
  });
});