import Papa from 'papaparse';
import type { Client, Visit, Team, Cleaner } from '../types';
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

/**
 * Parse a flexible date string into yyyy-MM-dd.
 * Handles ISO, North American slashes/dashes, and written formats like "May 8, 2026".
 */
const parseFlexibleDate = (raw: string): string => {
  if (!raw) return '';
  raw = raw.trim();

  // Already ISO yyyy-MM-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Try native Date parse (handles MM/DD/YYYY, DD-MM-YYYY, etc.)
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Manual parse for written dates: "May 8, 2026" or "8 May 2026"
  const monthMap: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  const parts = raw.split(/[\s,/-]+/).filter(Boolean);
  if (parts.length >= 3) {
    let day = 0, month = 0, year = 0;
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (monthMap[lower]) {
        month = monthMap[lower];
      } else if (/^\d{4}$/.test(part)) {
        year = parseInt(part);
      } else if (/^\d{1,2}$/.test(part)) {
        day = parseInt(part);
      }
    }
    if (year && month && day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return '';
};

/**
 * Extract start time (HH:MM) from a time or time-range string.
 * Handles "9:00 AM - 11:00 AM", "09:00 - 11:00", "9:00am", etc.
 */
const parseStartTime = (raw: string): string => {
  if (!raw) return '09:00';
  raw = raw.trim();

  // Grab the first time-looking token in the string
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2];
    const meridian = match[3]?.toUpperCase();
    if (meridian === 'PM' && hours !== 12) hours += 12;
    if (meridian === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return '09:00';
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

/**
 * Parse a Jobber Visits report CSV.
 * Headers recognized in any order: Date, Times, Client name, Client phone,
 * Service street, Service city, Visit completed date, Assigned to,
 * One-off job ($), Schedule duration, Job type, House Notes
 */
export const parseVisitsCSV = (csvContent: string, clients: Client[], teams: Team[], cleaners: Cleaner[]): Partial<Visit>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    // --- DATE (Jobber: "Date") ---
    const dateRaw = getColumn(row, ['date', 'visit date', 'scheduled date', 'service date']);
    const date = parseFlexibleDate(dateRaw);

    // --- TIME (Jobber: "Times" e.g. "9:00 AM - 11:00 AM") ---
    const timesRaw = getColumn(row, ['times', 'time', 'scheduled time', 'start time', 'time range']);
    const startTime = parseStartTime(timesRaw);

    // --- CLIENT ---
    const clientName = getColumn(row, ['client name', 'customer name', 'name', 'client']);
    const client = clients.find(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());

    // --- ADDRESS (Jobber: "Service street" + "Service city") ---
    const serviceStreet = getColumn(row, ['service street', 'street', 'address', 'service address']);
    const serviceCity = getColumn(row, ['service city', 'city']);
    const address = [serviceStreet, serviceCity].filter(Boolean).join(', ');

    // --- ZONE ---
    const zone = serviceCity || client?.zone || '';

    // --- DURATION (Jobber: "Schedule duration", usually decimal hours like "2.00") ---
    const durationRaw = getColumn(row, ['schedule duration', 'duration', 'estimated duration', 'hours', 'job duration']);
    let durationMinutes = 120;
    if (durationRaw) {
      // If it explicitly says minutes, treat as minutes
      if (/min/i.test(durationRaw)) {
        const num = parseFloat(durationRaw.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) durationMinutes = Math.round(num);
      } else {
        // Otherwise assume hours (Jobber default export is decimal hours)
        const num = parseFloat(durationRaw.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) {
          durationMinutes = num < 24 ? Math.round(num * 60) : Math.round(num);
        }
      }
    }

    // --- ASSIGNED TO / TEAM (Jobber: "Assigned to") ---
    const assignedToRaw = getColumn(row, ['assigned to', 'assigned', 'cleaner', 'team', 'team name', 'staff']);
    let team = teams.find(t => t.name.toLowerCase().trim() === assignedToRaw.toLowerCase().trim());

    // If no exact team match, try matching cleaner names inside the assignment string
    if (!team && assignedToRaw && cleaners.length > 0) {
      const assignedNames = assignedToRaw.split(/,|&|\band\b|\+/i).map(n => n.trim().toLowerCase()).filter(Boolean);
      team = teams.find(t => {
        const teamCleanerNames = t.cleanerIds
          .map(id => cleaners.find(c => c.id === id))
          .filter(Boolean)
          .map(c => c!.name.toLowerCase());
        return assignedNames.some(name =>
          teamCleanerNames.some(tcName => tcName.includes(name) || name.includes(tcName))
        );
      });
    }

    return {
      id: uuidv4(),
      clientId: client?.id || '',
      clientName: clientName || client?.name || 'Unknown',
      clientAddress: address || client?.address || '',
      clientZone: zone,
      date,
      startTime,
      durationMinutes,
      assignedTeamId: team?.id || '',
      assignedCleanerIds: team?.cleanerIds || [],
      cancelled: false,
      teamName: team?.name || assignedToRaw || ''
    };
  }).filter(v => v.date && v.clientName);
};

/**
 * Parse a Cleaners CSV.
 * Headers recognized in any order: First Name, Last Name, Equipment #,
 * Telephone, Email, Address, Unit #, City, Province, Notes, Start Date, Birthday
 */
export const parseCleanersCSV = (csvContent: string): Partial<Cleaner>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    const firstName = getColumn(row, ['first name']);
    const lastName = getColumn(row, ['last name']);
    const name = `${firstName} ${lastName}`.trim() || 'Unknown Cleaner';

    const phone = getColumn(row, ['telephone', 'phone', 'mobile', 'cell']);
    const equipment = getColumn(row, ['equipment #', 'equipment', 'equipment number', 'equip #']);
    const email = getColumn(row, ['email', 'e-mail']);
    const address = getColumn(row, ['address', 'street']);
    const unit = getColumn(row, ['unit #', 'unit', 'unit number', 'apt', 'apartment']);
    const city = getColumn(row, ['city']);
    const province = getColumn(row, ['province', 'state']);
    const notesRaw = getColumn(row, ['notes', 'comments', 'remarks']);
    const startDate = getColumn(row, ['start date', 'startdate', 'hire date']);
    const birthday = getColumn(row, ['birthday', 'birth date', 'dob']);

    const extraParts = [
      equipment && `Equip: ${equipment}`,
      email && `Email: ${email}`,
      (address || city) && `Addr: ${[address, unit, city, province].filter(Boolean).join(', ')}`,
      startDate && `Started: ${startDate}`,
      birthday && `DOB: ${birthday}`,
      notesRaw
    ].filter(Boolean);

    return {
      id: uuidv4(),
      name,
      isDriver: false,
      canStartAt: '08:00',
      mustBeOffBy: '17:00',
      cannotWorkWith: [],
      active: true,
      phone,
      notes: extraParts.join(' | ') || undefined,
    };
  }).filter(c => c.name && c.name !== 'Unknown Cleaner');
};