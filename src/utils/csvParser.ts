import Papa from 'papaparse';
import type { Client, Visit } from '../types';
import { v4 as uuidv4 } from 'uuid';

export const parseClientsCSV = (csvContent: string): Partial<Client>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  return (data as any[]).map(row => ({
    id: uuidv4(),
    name: row['Client name'] || row['First name'] + ' ' + row['Last name'],
    address: row['Service street'] || row['Address'] || '',
    preferredDays: [],
    preferredCleaners: [],
    avoidCleaners: []
  }));
};

export const parseVisitsCSV = (csvContent: string): Partial<Visit>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  return (data as any[]).map(row => {
    const startDateTime = row['Schedule start date'] || '';
    // Jobber often format is "YYYY-MM-DD HH:mm" or just "YYYY-MM-DD"
    const [date, time] = startDateTime.split(' ');
    
    return {
      id: uuidv4(),
      clientName: row['Client name'] || '',
      date: date || '',
      startTime: time || '09:00',
      durationMinutes: 120, // Default duration if not specified
      cancelled: false
    };
  });
};
