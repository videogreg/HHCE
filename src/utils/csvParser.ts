import Papa from 'papaparse';
import type { Client, Visit, Team } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Normalize a header string for fuzzy matching.
 * Lowercase, remove brackets, hashes, special chars, extra spaces.
 */
const normalizeHeader = (h: string): string => {
  return h
    .toLowerCase()
    .replace(/[#\[\]\(\)\{\}\*\!\?\@\$\%\^\&\*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Find the best matching column value from a row.
 * Tries each candidate header name in order of priority.
 */
const getColumn = (row: Record<string, string>, candidates: string[]): string => {
  const keys = Object.keys(row);
  const normalizedKeys = keys.map(normalizeHeader);
  
  for (const candidate of candidates) {
    const normCandidate = normalizeHeader(candidate);
    // Exact normalized match
    const idx = normalizedKeys.indexOf(normCandidate);
    if (idx !== -1) {
      const val = row[keys[idx]];
      if (val && val.trim()) return val.trim();
    }
    // Contains match (for partial matches like "phone" matching "main phone s")
    for (let i = 0; i < normalizedKeys.length; i++) {
      if (normalizedKeys[i].includes(normCandidate) || normCandidate.includes(normalizedKeys[i])) {
        const val = row[keys[i]];
        if (val && val.trim()) return val.trim();
      }
    }
  }
  return '';
};

/**
 * Build a full name from available parts.
 * Priority: Display Name > Company Name > First + Last Name > Service Property Name
 */
const buildName = (row: Record<string, string>): string => {
  const displayName = getColumn(row, ['display name']);
  if (displayName) return displayName;

  const companyName = getColumn(row, ['company name']);
  if (companyName) return companyName;

  const firstName = getColumn(row, ['first name']);
  const lastName = getColumn(row, ['last name']);
  if (firstName || lastName) {
    return `${firstName} ${lastName}`.trim();
  }

  const serviceProperty = getColumn(row, ['service property name']);
  if (serviceProperty) return serviceProperty;

  return 'Unknown Client';
};

/**
 * Build a full address from available parts.
 * Priority: Service address > Billing address > CFT[Address]
 */
const buildAddress = (row: Record<string, string>): string => {
  const serviceStreet1 = getColumn(row, ['service street 1']);
  const serviceStreet2 = getColumn(row, ['service street 2']);
  const serviceCity = getColumn(row, ['service city']);
  
  if (serviceStreet1 || serviceCity) {
    const parts = [serviceStreet1, serviceStreet2, serviceCity].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }

  const billingStreet1 = getColumn(row, ['billing street 1']);
  const billingStreet2 = getColumn(row, ['billing street 2']);
  const billingCity = getColumn(row, ['billing city']);
  
  if (billingStreet1 || billingCity) {
    const parts = [billingStreet1, billingStreet2, billingCity].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }

  const cftAddress = getColumn(row, ['cft address']);
  if (cftAddress) return cftAddress;

  return '';
};

/**
 * Build a phone number from available parts.
 */
const buildPhone = (row: Record<string, string>): string => {
  const mainPhone = getColumn(row, ['main phone s', 'main phone', 'mainphone']);
  if (mainPhone) return mainPhone;

  const mobilePhone = getColumn(row, ['mobile phone s', 'mobile phone', 'mobilephone']);
  if (mobilePhone) return mobilePhone;

  const homePhone = getColumn(row, ['home phone s', 'home phone', 'homephone']);
  if (homePhone) return homePhone;

  const workPhone = getColumn(row, ['work phone s', 'work phone', 'workphone']);
  if (workPhone) return workPhone;

  return '';
};

/**
 * Build notes from available parts.
 */
const buildNotes = (row: Record<string, string>): string => {
  const cftNotes1 = getColumn(row, ['cft notes']);
  const cftNotes2 = getColumn(row, ['cftnotes']);
  const tags = getColumn(row, ['tags']);
  const referredBy = getColumn(row, ['cft referred by', 'referred by']);
  const finishDate = getColumn(row, ['cft finish date notes', 'finish date notes']);
  const emailRef = getColumn(row, ['cft email for reference only do not send invoice']);

  const parts = [cftNotes1, cftNotes2, tags, referredBy, finishDate, emailRef].filter(Boolean);
  if (parts.length > 0) return parts.join(' | ');
  return '';
};

/**
 * Get zone (city/area) from available parts.
 */
const buildZone = (row: Record<string, string>): string => {
  const serviceCity = getColumn(row, ['service city']);
  if (serviceCity) return serviceCity;

  const billingCity = getColumn(row, ['billing city']);
  if (billingCity) return billingCity;

  return '';
};

export const parseClientsCSV = (csvContent: string): Partial<Client>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    const name = buildName(row);
    const address = buildAddress(row);
    const phone = buildPhone(row);
    const notes = buildNotes(row);
    const zone = buildZone(row);

    return {
      id: uuidv4(),
      name,
      address,
      phone,
      preferredDays: [],
      preferredCleaners: [],
      avoidCleaners: [],
      durationMinutes: 120,
      zone,
      notes,
    };
  }).filter(c => c.name && c.name !== 'Unknown Client');
};

export const parseVisitsCSV = (csvContent: string, clients: Client[], teams: Team[]): Partial<Visit>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    const startDateTime = getColumn(row, ['schedule start date', 'date', 'start date']);
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

    let durationMinutes = 120;
    const durVal = getColumn(row, ['duration', 'estimated duration', 'hours']);
    if (durVal) {
      const num = parseFloat(durVal);
      if (!isNaN(num)) {
        durationMinutes = num < 10 ? Math.round(num * 60) : Math.round(num);
      }
    }

    const clientName = buildName(row);
    const client = clients.find(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());
    const teamName = getColumn(row, ['team', 'team name']);
    const team = teams.find(t => t.name.toLowerCase().trim() === teamName.toLowerCase().trim());

    return {
      id: uuidv4(),
      clientId: client?.id || '',
      clientName: clientName || client?.name || 'Unknown',
      clientAddress: buildAddress(row) || client?.address || '',
      clientZone: client?.zone || buildZone(row) || '',
      date: date || getColumn(row, ['date']) || '',
      startTime: time || getColumn(row, ['start time']) || '09:00',
      durationMinutes,
      assignedTeamId: team?.id || '',
      assignedCleanerIds: team?.cleanerIds || [],
      cancelled: false,
      teamName: team?.name || teamName || ''
    };
  }).filter(v => v.date && v.clientName);
};