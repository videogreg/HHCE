import Papa from 'papaparse';
import type { Client, Visit, Team, Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface ParseClientsResult {
  clients: Partial<<Client>[];
  stats: {
    totalRows: number;
    imported: number;
    skipped: number;
    skippedRows: { row: number; reason: string }[];
    errors: string[];
  };
}

const normalizeHeader = (h: string): string => {
  return h
    .toLowerCase()
    .replace(/[#\[\]\(\)\{\}\*\!\?\@\$\%\^\&\*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const getColumn = (row: Record<string, string>, candidates: string[]): string => {
  const keys = Object.keys(row);
  const normalizedKeys = keys.map(normalizeHeader);
  
  for (const candidate of candidates) {
    const normCandidate = normalizeHeader(candidate);
    const idx = normalizedKeys.indexOf(normCandidate);
    if (idx !== -1) {
      const val = row[keys[idx]];
      if (val && val.trim()) return val.trim();
    }
    for (let i = 0; i < normalizedKeys.length; i++) {
      if (normalizedKeys[i].includes(normCandidate) || normCandidate.includes(normalizedKeys[i])) {
        const val = row[keys[i]];
        if (val && val.trim()) return val.trim();
      }
    }
  }
  return '';
};

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

const buildZone = (row: Record<string, string>): string => {
  const serviceCity = getColumn(row, ['service city']);
  if (serviceCity) return serviceCity;

  const billingCity = getColumn(row, ['billing city']);
  if (billingCity) return billingCity;

  return '';
};

const extractDurationFromName = (name: string): { cleanName: string; durationMinutes: number } => {
  if (!name) return { cleanName: '', durationMinutes: 120 };

  let cleanName = name.trim();
  let durationMinutes = 120;

  const patterns = [
    { regex: /\(\s*(\d+(?:\.\d+)?)\s*[hH]\s*\+?T?\s*\)/, clean: true },
    { regex: /\(\s*(\d+(?:\.\d+)?)\s*hr\s*\)/i, clean: true },
    { regex: /\(\s*(\d+(?:\.\d+)?)\s*\)/, clean: true },
    { regex: /\(\s*(\d+)\s*\/\s*(\d+)\s*[hH]\s*\)/, isFraction: true, clean: true },
    { regex: /\(\s*(\d+(?:\.\d+)?)\s*\+T\s*\)/, clean: true },
    { regex: /[a-zA-Z]\s*(\d+(?:\.\d+)?)\s*[hH]\b/, clean: false },
    { regex: /\b(\d+(?:\.\d+)?)\s*[hH]\b/, clean: false },
    { regex: /\(\s*(\d+(?:\.\d+)?)\s*[hH]/, clean: false },
  ];

  for (const pattern of patterns) {
    const match = cleanName.match(pattern.regex);
    if (match) {
      let hours: number;
      if (pattern.isFraction) {
        hours = parseFloat(match[1]) / parseFloat(match[2]);
      } else {
        hours = parseFloat(match[1]);
      }

      if (!isNaN(hours) && hours > 0 && hours <= 24) {
        durationMinutes = Math.round(hours * 60);

        if (pattern.clean) {
          cleanName = cleanName.replace(match[0], '').trim().replace(/\s+/g, ' ');
        }
        break;
      }
    }
  }

  cleanName = cleanName
    .replace(/\(\s*[oOnN]\s*\)/gi, '')
    .replace(/\(\s*#\d+\s*\)/g, '')
    .replace(/\(\s*\d+[wW]\s*\)/g, '')
    .replace(/\(\s*\d+[xX]\s*\w+\s*\)/gi, '')
    .replace(/\(\s*[cC]\s*\)/g, '')
    .replace(/\(\s*\w+\s*\)/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  return { cleanName, durationMinutes };
};

const parseFlexibleDate = (raw: string): string => {
  if (!raw) return '';
  raw = raw.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

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

const parseStartTime = (raw: string): string => {
  if (!raw) return '09:00';
  raw = raw.trim();

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

export const parseClientsCSV = (csvContent: string): ParseClientsResult => {
  const stats: ParseClientsResult['stats'] = {
    totalRows: 0,
    imported: 0,
    skipped: 0,
    skippedRows: [],
    errors: [],
  };

  try {
    const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    if (parseResult.errors && parseResult.errors.length > 0) {
      console.error('CSV parse errors:', parseResult.errors);
      stats.errors.push(...parseResult.errors.map((e: any) => e.message || String(e)));
    }

    const rows = parseResult.data as Record<string, string>[];
    stats.totalRows = rows.length;
    
    const headers = Object.keys(rows[0] || {});
    console.log(`[csvParser] Parsed ${rows.length} rows. Headers found:`, headers);
    console.log(`[csvParser] Looking for 'display name' in normalized headers:`, headers.map(normalizeHeader));

    const clients: Partial<<Client>[] = [];

    rows.forEach((row, idx) => {
      const rawDisplayName = getColumn(row, ['display name', 'displayname', 'name', 'client name', 'customer name']);
      let name = '';
      let durationMinutes = 120;

      console.log(`[csvParser] Row ${idx}: raw displayName="${rawDisplayName}"`);

      if (rawDisplayName) {
        const extracted = extractDurationFromName(rawDisplayName);
        name = extracted.cleanName;
        durationMinutes = extracted.durationMinutes;
        console.log(`[csvParser] Row ${idx}: EXTRACTED name="${name}", duration=${durationMinutes}min`);
      } else {
        console.warn(`[csvParser] Row ${idx}: No display name found`);
      }

      if (!name) {
        name = buildName(row);
        console.log(`[csvParser] Row ${idx}: Fallback name="${name}"`);
      }

      if (!name || name === 'Unknown Client') {
        stats.skipped++;
        stats.skippedRows.push({ row: idx, reason: !name ? 'No name found' : 'Unknown Client' });
        return;
      }

      const address = buildAddress(row);
      const phone = buildPhone(row);
      const notes = buildNotes(row);
      const zone = buildZone(row);

      clients.push({
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
      });

      stats.imported++;
    });

    console.log(`[csvParser] IMPORT COMPLETE: ${stats.imported} clients imported, ${stats.skipped} rows skipped (out of ${stats.totalRows} total)`);
    if (stats.skippedRows.length > 0) {
      console.log(`[csvParser] Skipped rows:`, stats.skippedRows);
    }

    return { clients, stats };
  } catch (err) {
    console.error('[csvParser] Fatal CSV parse error:', err);
    stats.errors.push(err instanceof Error ? err.message : String(err));
    return { clients: [], stats };
  }
};

export const parseVisitsCSV = (csvContent: string, clients: Client[], teams: Team[], cleaners: Cleaner[]): Partial<<Visit>[] => {
  const { data } = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = data as Record<string, string>[];

  return rows.map(row => {
    const dateRaw = getColumn(row, ['date', 'visit date', 'scheduled date', 'service date']);
    const date = parseFlexibleDate(dateRaw);

    const timesRaw = getColumn(row, ['times', 'time', 'scheduled time', 'start time', 'time range']);
    const startTime = parseStartTime(timesRaw);

    const clientName = getColumn(row, ['client name', 'customer name', 'name', 'client']);
    const client = clients.find(c => c.name.toLowerCase().trim() === clientName.toLowerCase().trim());

    const serviceStreet = getColumn(row, ['service street', 'street', 'address', 'service address']);
    const serviceCity = getColumn(row, ['service city', 'city']);
    const address = [serviceStreet, serviceCity].filter(Boolean).join(', ');

    const zone = serviceCity || client?.zone || '';

    const durationRaw = getColumn(row, ['schedule duration', 'duration', 'estimated duration', 'hours', 'job duration']);
    let durationMinutes = 120;
    if (durationRaw) {
      if (/min/i.test(durationRaw)) {
        const num = parseFloat(durationRaw.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) durationMinutes = Math.round(num);
      } else {
        const num = parseFloat(durationRaw.replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) {
          durationMinutes = num < 24 ? Math.round(num * 60) : Math.round(num);
        }
      }
    }

    const assignedToRaw = getColumn(row, ['assigned to', 'assigned', 'cleaner', 'team', 'team name', 'staff']);

    let assignedCleanerIds: string[] = [];
    if (assignedToRaw && cleaners.length > 0) {
      const fragments = assignedToRaw
        .split(/,|&|\band\b|\+|\/|\|/i)
        .map(f => f.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim())
        .filter(Boolean);

      const matchedIds = new Set<string>();
      const sortedCleaners = [...cleaners].sort((a, b) => b.name.length - a.name.length);

      for (const fragment of fragments) {
        const fragLower = fragment.toLowerCase();
        if (!fragLower) continue;

        for (const cleaner of sortedCleaners) {
          const cNameLower = cleaner.name.toLowerCase();
          const cParts = cNameLower.split(/\s+/).filter(p => p.length > 1);

          const isMatch =
            cNameLower === fragLower ||
            cNameLower.includes(fragLower) ||
            fragLower.includes(cNameLower) ||
            cParts.some(part => part === fragLower) ||
            cParts.some(part => fragLower.includes(part) && part.length > 2);

          if (isMatch) {
            matchedIds.add(cleaner.id);
            break;
          }
        }
      }

      assignedCleanerIds = Array.from(matchedIds);
    }

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