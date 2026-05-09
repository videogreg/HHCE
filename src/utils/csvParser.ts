import Papa from 'papaparse';
import type { Client, Visit, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const parseClientsCSV = (csvContent: string): Partial<Client>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  return (data as any[]).map(row => ({
    id: uuidv4(),
    name: row['Client name'] || row['First name'] + ' ' + row['Last name'] || row['Name'] || 'Unknown',
    address: row['Service street'] || row['Address'] || row['Billing street'] || '',
    phone: row['Phone'] || row['Mobile'] || row['Home phone'] || '',
    preferredDays: [],
    preferredCleaners: [],
    avoidCleaners: [],
    durationMinutes: parseInt(row['Duration'] || row['Default duration'] || '120', 10) || 120,
    zone: row['Zone'] || row['Area'] || '',
    notes: row['Notes'] || row['Internal notes'] || ''
  }));
};

/**
 * Parse Jobber visit CSV.
 * Expected columns: Client name, Service street, Schedule start date, Duration, Team name (optional)
 * Schedule start date format: "YYYY-MM-DD HH:mm" or "YYYY-MM-DD"
 */
export const parseVisitsCSV = (csvContent: string, clients: Client[], teams: Team[]): Partial<Visit>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  return (data as any[]).map(row => {
    const startDateTime = row['Schedule start date'] || row['Date'] || row['Start date'] || '';
    let date = '';
    let time = '09:00';

    if (startDateTime.includes(' ')) {
      [date, time] = startDateTime.split(' ');
    } else if (startDateTime.includes('T')) {
      [date, time] = startDateTime.split('T');
      time = time?.substring(0, 5) || '09:00';
    } else {
      date = startDateTime;
    }

    // Parse duration - Jobber might give "2.5" hours or "150" minutes
    let durationMinutes = 120;
    const durVal = row['Duration'] || row['Estimated duration'] || row['Hours'] || '';
    if (durVal) {
      const num = parseFloat(durVal);
      if (!isNaN(num)) {
        // If value is small (like 2.5), assume hours. If large (like 150), assume minutes.
        durationMinutes = num < 10 ? Math.round(num * 60) : Math.round(num);
      }
    }

    const clientName = row['Client name'] || row['Name'] || '';
    const client = clients.find(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());
    const teamName = row['Team'] || row['Team name'] || '';
    const team = teams.find(t => t.name.toLowerCase().trim() === teamName.toLowerCase().trim());

    return {
      id: uuidv4(),
      clientId: client?.id || '',
      clientName: clientName || client?.name || 'Unknown',
      clientAddress: row['Service street'] || row['Address'] || client?.address || '',
      clientZone: client?.zone || row['Zone'] || '',
      date: date || row['Date'] || '',
      startTime: time || row['Start time'] || '09:00',
      durationMinutes,
      assignedTeamId: team?.id || '',
      assignedCleanerIds: team?.cleanerIds || [],
      cancelled: false,
      teamName: team?.name || teamName || ''
    };
  }).filter(v => v.date && v.clientName);
};
