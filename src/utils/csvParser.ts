import Papa from 'papaparse';
import type { Client, Visit, Team, Cleaner } from '../types';
import { v4 as uuidv4 } from 'uuid';

export interface ParseClientsResult {
  clients: Partial<Client>[];
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
    if (meridian === 'PM' && hours !== 12