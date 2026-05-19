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
  const displayName = getColumn(row, ['display name', 'displayname']);
  if (displayName) {
    const { cleanName } = extractDurationFromName(displayName);
    return cleanName;
  }

  const name = getColumn(row, ['name', 'full name', 'client name', 'customer name']);
  if (name) {
    const { cleanName } = extractDurationFromName(name);
    return cleanName;
  }

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
 * Extract duration in minutes from a name string containing (2h), (1.5h), etc.
 * Returns extracted minutes and the clean name without the duration bracket.
 */
const extractDurationFromName = (name: string): { cleanName: string; durationMinutes: number } => {
  if (!name) return { cleanName: '', durationMinutes: 120 };

  // Match duration patterns: (2h), (2.5h), (1.5H), (2H), (4H), (3.5H), (6h), (0.5h)
  // Case insensitive /i flag handles both h and H
  // Handles optional spaces: ( 2.5 h ), (2.5H), (4 h)
  const durationMatch = name.match(/\(\s*(\d+(?:\.\d+)?)\s*h\s*\)/i);
  if (durationMatch) {
    const hours = parseFloat(durationMatch[1]);
    if (!isNaN(hours) && hours > 0) {
      // Remove the duration bracket from the name
      let cleanName = name.replace(durationMatch[0], '').trim().replace(/\s+/g, ' ');
      return { cleanName, durationMinutes: Math.round(hours * 60) };
    }
  }
  return { cleanName: name.trim(), durationMinutes: 120 };
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
    // Jobber exports use "Display Name" column which contains: "Carol Barrett(O)(4H)"
    // The duration is embedded in brackets like (4H), (2h), (3.5h)
    const displayName = getColumn(row, ['display name', 'displayname', 'name', 'client name', 'customer name']);
    let name = '';
    let durationMinutes = 120;

    if (displayName) {
      const extracted = extractDurationFromName(displayName);
      name = extracted.cleanName;
      durationMinutes = extracted.durationMinutes;
    }

    // Fallback to other name fields if display name is empty
    if (!name) {
      name = buildName(row);
    }

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
      durationMinutes,
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

    // --- ASSIGNED TO / CLEANERS ---
    const assignedToRaw = getColumn(row, ['assigned to', 'assigned', 'cleaner', 'team', 'team name', 'staff']);

    // Match individual cleaners from the assignment text
    let assignedCleanerIds: string[] = [];
    if (assignedToRaw && cleaners.length > 0) {
      // Split by common separators and strip parentheticals / brackets
      const fragments = assignedToRaw
        .split(/,|&|\band\b|\+|\/|\|/i)
        .map(f => f.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim())
        .filter(Boolean);

      const matchedIds = new Set<string>();
      // Sort by name length descending so longer names match first
      const sortedCleaners = [...cleaners].sort((a, b) => b.name.length - a.name.length);

      for (const fragment of fragments) {
        const fragLower = fragment.toLowerCase();
        if (!fragLower) continue;

        for (const cleaner of sortedCleaners) {
          const cNameLower = cleaner.name.toLowerCase();
          const cParts = cNameLower.split(/\s+/).filter(p => p.length > 1);

          // Match if: exact, contained in full name, full name contained in fragment,
          // or fragment matches a significant name part
          const isMatch =
            cNameLower === fragLower ||
            cNameLower.includes(fragLower) ||
            fragLower.includes(cNameLower) ||
            cParts.some(part => part === fragLower) ||
            cParts.some(part => fragLower.includes(part) && part.length > 2);

          if (isMatch) {
            matchedIds.add(cleaner.id);
            break; // matched this fragment, move to next
          }
        }
      }

      assignedCleanerIds = Array.from(matchedIds);
    }

    // Try to find a team that contains all assigned cleaners
    let team = teams.find(t => t.name.toLowerCase().trim() === assignedToRaw.toLowerCase().trim());
    if (!team && assignedCleanerIds.length > 0) {
      team = teams.find(t => assignedCleanerIds.every(id => t.cleanerIds.includes(id)));
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
      assignedCleanerIds,
      cancelled: false,
      teamName: team?.name || assignedToRaw || ''
    };
  }).filter(v => v.date && v.clientName);
};

/**
 * Parse a Cleaners CSV.
 * Headers recognized in any order: First Name, Last Name, Equipment #,
 * Driver, Telephone, Email, Address, Unit #, City, Province, Notes, Start Date, Birthday
 */
export const parseCleanersCSV = (csvContent: string): Partial<Cleaner>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    const firstName = getColumn(row, ['first name']);
    const lastName = getColumn(row, ['last name']);
    const name = `${firstName} ${lastName}`.trim() || 'Unknown Cleaner';

    const driverRaw = getColumn(row, ['driver', 'is driver', 'isdriver']);
    const isDriver = /^\s*yes\s*$/i.test(driverRaw);

    const phone = getColumn(row, ['telephone', 'phone', 'mobile', 'cell']);
    const equipment = getColumn(row, ['equipment #', 'equipment', 'equipment number', 'equip #']);
    const email = getColumn(row, ['email', 'e-mail']);
    const street = getColumn(row, ['address', 'street']);
    const unit = getColumn(row, ['unit #', 'unit', 'unit number', 'apt', 'apartment']);
    const city = getColumn(row, ['city']);
    const province = getColumn(row, ['province', 'state']);
    const notesRaw = getColumn(row, ['notes', 'comments', 'remarks']);
    const startDate = getColumn(row, ['start date', 'startdate', 'hire date']);
    const birthday = getColumn(row, ['birthday', 'birth date', 'dob']);

    const address = [street, unit, city, province].filter(Boolean).join(', ');

    const extraParts = [
      equipment && `Equip: ${equipment}`,
      startDate && `Started: ${startDate}`,
      birthday && `DOB: ${birthday}`,
      notesRaw
    ].filter(Boolean);

    return {
      id: uuidv4(),
      name,
      isDriver,
      canStartAt: '08:00',
      mustBeOffBy: '17:00',
      cannotWorkWith: [],
      active: true,
      phone,
      email: email || undefined,
      address: address || undefined,
      notes: extraParts.join(' | ') || undefined,
    };
  }).filter(c => c.name && c.name !== 'Unknown Cleaner');
};