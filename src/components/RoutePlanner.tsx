import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { loadGoogleMaps, geocodeAddress, calculateRoute } from '../utils/maps';
import { format, parse, addMinutes, isAfter, isBefore } from 'date-fns';
import { Car, MapPin, Clock, Home, Users, X, AlertTriangle, Navigation, Copy, Check, ExternalLink, Plus, Bus, CircleDot, RotateCcw, Save } from 'lucide-react';
import type { Cleaner, Visit } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

interface RouteStop {
  type: 'depart' | 'pickup' | 'clean' | 'dropoff' | 'home' | 'wait' | 'other';
  label: string;
  address: string;
  arrivalTime: string;
  departTime?: string;
  durationMin?: number;
  legDistanceKm?: number;
  legDurationMin?: number;
  isLate?: boolean;
  lateMin?: number;
  waitMin?: number;
  actualStartTime?: string;
  visitId?: string;
  teamMemberId?: string;
  latLng?: any;
  included?: boolean;
  isCustom?: boolean;
  targetTime?: string; // HH:mm - backtime constraint
}

interface TeamMemberHours {
  name: string;
  minutes: number;
  hours: number;
  isDriver: boolean;
}

interface RouteData {
  driver: Cleaner | null;
  driverVisits: Visit[];
  teamMembersWithAddr: Cleaner[];
  driverHome: any;
  clientLocs: Record<string, any>;
  teamLocs: Record<string, any>;
  isRelief: boolean;
  reliefName: string;
}

const RELIEF_STORAGE_KEY = 'hhce_relief_routes';

const getSavedRelief = (date: string): RouteStop[] | null => {
  try {
    const raw = localStorage.getItem(RELIEF_STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    return all[date] || null;
  } catch {
    return null;
  }
};

const saveRelief = (date: string, stops: RouteStop[]) => {
  try {
    const raw = localStorage.getItem(RELIEF_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[date] = stops;
    localStorage.setItem(RELIEF_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

const clearRelief = (date: string) => {
  try {
    const raw = localStorage.getItem(RELIEF_STORAGE_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[date];
    localStorage.setItem(RELIEF_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

export const RoutePlanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { visits, cleaners, clients, teams, selectedDate } = useAppContext();
  const [selectedDriver, setSelectedDriver] = useState<Cleaner | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [totalKm, setTotalKm] = useState(0);
  const [driverHours, setDriverHours] = useState(0);
  const [cleanHours, setCleanHours] = useState(0);
  const [actualDriveMinutes, setActualDriveMinutes] = useState(0);
  const [teamHours, setTeamHours] = useState<TeamMemberHours[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [routeUrl, setRouteUrl] = useState<string>('');
  const [showAddFormAt, setShowAddFormAt] = useState<number | null>(null);
  const [formType, setFormType] = useState<'pickup' | 'dropoff' | 'wait' | 'other'>('pickup');
  const [formAddress, setFormAddress] = useState('');
  const [formDuration, setFormDuration] = useState(15);
  const [formLabel, setFormLabel] = useState('');
  const [formTeamMember, setFormTeamMember] = useState('');
  const [formTargetTime, setFormTargetTime] = useState('');
  const [isReliefMode, setIsReliefMode] = useState(false);
  const [reliefName, setReliefName] = useState('');
  const [reliefAddress, setReliefAddress] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);
  const routeDataRef = useRef<RouteData | null>(null);
  const debounceRef = useRef<any>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const dayVisits = useMemo(() =>
    visits.filter(v => v.date === dateStr && !v.cancelled).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [visits, dateStr]);

  const regularDrivers = useMemo(() => {
    const driverIds = new Set<string>();
    dayVisits.forEach(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      ids.forEach(id => {
        const c = cleaners.find(x => x.id === id);
        if (c?.isDriver && c.active) driverIds.add(id);
      });
    });
    return cleaners.filter(c => driverIds.has(c.id));
  }, [dayVisits, cleaners, teams]);

  // Restore saved relief route when date changes
  useEffect(() => {
    const saved = getSavedRelief(dateStr);
    if (saved && saved.length > 0) {
      setIsReliefMode(true);
      setSelectedDriver(null);
      setRouteStops(saved);
      // Re-geocode and recalculate
      setTimeout(() => {
        if (saved[0]?.address) setReliefAddress(saved[0].address);
        if (saved[0]?.label) {
          const name = saved[0].label.replace('Leave Home — ', '');
          setReliefName(name);
        }
        // We need to re-run processRoute but latLng objects aren't serializable.
        // So we'll rebuild from addresses.
        rebuildSavedRelief(saved);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr]);

  const rebuildSavedRelief = async (saved: RouteStop[]) => {
    if (!API_KEY) return;
    setLoading(true);
    await loadGoogleMaps(API_KEY);

    const stops: RouteStop[] = [];
    for (const s of saved) {
      if (s.latLng) {
        stops.push({ ...s, latLng: s.latLng });
      } else if (s.address) {
        const loc = await geocodeAddress(s.address);
        stops.push({ ...s, latLng: loc });
      }
    }

    const homeLoc = stops[0]?.latLng;
    routeDataRef.current = {
      driver: null,
      driverVisits: [],
      teamMembersWithAddr: [],
      driverHome: homeLoc,
      clientLocs: {},
      teamLocs: {},
      isRelief: true,
      reliefName: reliefName || 'Relief Driver',
    };

    await processRoute(routeDataRef.current, stops);
  };

  useEffect(() => {
    if (API_KEY) loadGoogleMaps(API_KEY).catch(() => setApiError('Failed to load Google Maps'));
  }, []);

  const clearMarkers = () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoWindowsRef.current.forEach((iw: any) => iw.close());
    infoWindowsRef.current = [];
  };

  const addMarkers = (map: any, stops: RouteStop[]) => {
    clearMarkers();
    let cleanCount = 0;
    let pickupCount = 0;
    let dropoffCount = 0;
    let otherCount = 0;
    let activeInfoWindow: any = null;

    stops.forEach((stop, i) => {
      if (!stop.latLng) return;

      let labelText = '';
      let color = '#64748b';
      let zIndex = 5;

      if (stop.type === 'depart') { labelText = 'S'; color = '#2563eb'; zIndex = 8; }
      else if (stop.type === 'pickup') { labelText = `P${++pickupCount}`; color = '#059669'; zIndex = 7; }
      else if (stop.type === 'clean') { labelText = `${++cleanCount}`; color = '#7c3aed'; zIndex = 10; }
      else if (stop.type === 'dropoff') { labelText = `D${++dropoffCount}`; color = '#d97706'; zIndex = 6; }
      else if (stop.type === 'home') { labelText = 'E'; color = '#64748b'; zIndex = 5; }
      else if (stop.type === 'wait') { labelText = 'W'; color = '#0891b2'; zIndex = 9; }
      else if (stop.type === 'other') { labelText = `O${++otherCount}`; color = '#be185d'; zIndex = 9; }

      const marker = new (window as any).google.maps.Marker({
        position: stop.latLng,
        map,
        label: {
          text: labelText,
          color: 'white',
          fontSize: '13px',
          fontWeight: 'bold',
        },
        icon: {
          path: (window as any).google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
          scale: 16,
        },
        zIndex,
      });

      const infoContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; min-width: 200px; line-height: 1.4;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 3px;">
            ${stop.label.replace(/—/g, '-')}
          </div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 5px; word-wrap: break-word; max-width: 200px;">
            ${stop.address}
          </div>
          ${stop.targetTime ? `<div style="font-size: 11px; color: #2563eb; font-weight: 600;">🎯 Target: ${stop.targetTime}</div>` : ''}
          ${stop.arrivalTime ? `<div style="font-size: 11px; color: #475569;"><strong>Arrive:</strong> ${stop.arrivalTime}</div>` : ''}
          ${stop.departTime ? `<div style="font-size: 11px; color: #475569;"><strong>Depart:</strong> ${stop.departTime}</div>` : ''}
          ${stop.durationMin ? `<div style="font-size: 11px; color: #475569;"><strong>Duration:</strong> ${stop.durationMin} min</div>` : ''}
          ${stop.waitMin ? `<div style="font-size: 11px; color: #b45309; font-weight: 600; margin-top: 3px;">⏳ Wait ${stop.waitMin} min (possible break)</div>` : ''}
          ${stop.isLate ? `<div style="font-size: 11px; color: #dc2626; font-weight: 600; margin-top: 3px;">⚠️ Late ${stop.lateMin} min past target</div>` : ''}
          ${(i > 0 && stop.legDistanceKm !== undefined) ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 4px;">🚗 ${stop.legDistanceKm.toFixed(1)} km • ${Math.round(stop.legDurationMin || 0)} min drive</div>` : ''}
        </div>
      `;

      const infoWindow = new (window as any).google.maps.InfoWindow({
        content: infoContent,
        maxWidth: 240,
      });

      marker.addListener('click', () => {
        if (activeInfoWindow) activeInfoWindow.close();
        infoWindow.open(map, marker);
        activeInfoWindow = infoWindow;
      });

      markersRef.current.push(marker);
      infoWindowsRef.current.push(infoWindow);
    });
  };

  const processRoute = useCallback(async (data: RouteData, stops: RouteStop[]) => {
    const includedStops = stops.filter(s => s.included !== false);
    const latLngs = includedStops.map(s => s.latLng).filter(Boolean);

    if (latLngs.length < 2) {
      setApiError('Not enough stops to build a route. Please include at least 2 stops.');
      setRouteStops(stops);
      setLoading(false);
      return;
    }

    const origin = latLngs[0];
    const destination = latLngs[latLngs.length - 1];
    const waypoints = latLngs.slice(1, -1);

    const originStr = `${origin.lat()},${origin.lng()}`;
    const destStr = `${destination.lat()},${destination.lng()}`;
    const waypointsStr = waypoints.map((ll: any) => `${ll.lat()},${ll.lng()}`).join('|');
    const mapsUrl = waypointsStr
      ? `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&waypoints=${waypointsStr}`
      : `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}`;
    setRouteUrl(mapsUrl);

    const routeResult = await calculateRoute(origin, destination, waypoints);
    if (!routeResult) {
      setApiError('Could not calculate route. Check addresses.');
      setRouteStops(stops);
      setLoading(false);
      return;
    }

    const legs = routeResult.routes[0].legs;
    let totalDist = 0;
    let actualDriveSeconds = 0;

    // Store leg durations for backtiming
    const legDurationsMin: number[] = legs.map((leg: any) => Math.ceil(leg.duration.value / 60));

    // --- BACKTIMING LOGIC ---
    // Find if any stop has a targetTime constraint
    const constrainedIndices = includedStops
      .map((s, idx) => ({ idx, target: s.targetTime }))
      .filter(x => x.target);

    let departTime: Date;

    if (constrainedIndices.length > 0) {
      // For each constraint, calculate required home departure
      let earliestHomeDep = new Date(8640000000000000); // max date

      for (const { idx, target } of constrainedIndices) {
        const targetDate = parse(target!, 'HH:mm', new Date());
        // Work backwards from constraint to home
        let neededArrivalAtPrev = targetDate;
        for (let i = idx; i > 0; i--) {
          // Subtract duration at previous stop
          const prevStop = includedStops[i - 1];
          const prevDuration = prevStop.durationMin || 0;
          neededArrivalAtPrev = addMinutes(neededArrivalAtPrev, -prevDuration);
          // Subtract drive time from prev to current
          const driveMin = legDurationsMin[i - 1] || 0;
          neededArrivalAtPrev = addMinutes(neededArrivalAtPrev, -driveMin);
        }
        if (neededArrivalAtPrev < earliestHomeDep) {
          earliestHomeDep = neededArrivalAtPrev;
        }
      }

      departTime = earliestHomeDep;
    } else {
      // No constraints - default to 08:00 or first clean time
      const firstCleanIdx = includedStops.findIndex(s => s.type === 'clean');
      const firstCleanVisit = firstCleanIdx >= 0
        ? data.driverVisits.find(dv => dv.id === includedStops[firstCleanIdx].visitId)
        : null;

      if (firstCleanVisit) {
        departTime = parse(firstCleanVisit.startTime, 'HH:mm', new Date());
        for (let i = firstCleanIdx; i > 0; i--) {
          const leg = legs[i - 1];
          departTime = new Date(departTime.getTime() - (leg.duration.value * 1000));
          const prevStop = includedStops[i - 1];
          if (prevStop.durationMin) {
            departTime = addMinutes(departTime, -prevStop.durationMin);
          }
        }
      } else {
        departTime = parse('08:00', 'HH:mm', new Date());
      }
    }

    let runningTime = new Date(departTime.getTime());
    includedStops[0].arrivalTime = format(runningTime, 'HH:mm');

    for (let i = 1; i < includedStops.length; i++) {
      const leg = legs[i - 1];
      totalDist += leg.distance.value;
      actualDriveSeconds += leg.duration.value;
      const driveMs = leg.duration.value * 1000;
      runningTime = new Date(runningTime.getTime() + driveMs);

      includedStops[i].legDistanceKm = leg.distance.value / 1000;
      includedStops[i].legDurationMin = Math.ceil(leg.duration.value / 60);
      includedStops[i].arrivalTime = format(runningTime, 'HH:mm');

      // Check against targetTime
      if (includedStops[i].targetTime) {
        const target = parse(includedStops[i].targetTime!, 'HH:mm', new Date());
        if (isAfter(runningTime, addMinutes(target, 15))) {
          includedStops[i].isLate = true;
          includedStops[i].lateMin = Math.ceil((runningTime.getTime() - target.getTime()) / 60000);
        }
      }

      if (includedStops[i].type === 'clean') {
        const v = data.driverVisits.find(dv => dv.id === includedStops[i].visitId);
        if (v) {
          const scheduledStart = parse(v.startTime, 'HH:mm', new Date());
          const earliestStart = addMinutes(scheduledStart, -15);
          const latestStart = addMinutes(scheduledStart, 15);

          if (isBefore(runningTime, earliestStart)) {
            includedStops[i].waitMin = Math.ceil((earliestStart.getTime() - runningTime.getTime()) / 60000);
            includedStops[i].actualStartTime = format(earliestStart, 'HH:mm');
            runningTime = addMinutes(earliestStart, v.durationMinutes);
            includedStops[i].departTime = format(runningTime, 'HH:mm');
          } else if (isAfter(runningTime, latestStart)) {
            includedStops[i].isLate = true;
            includedStops[i].lateMin = Math.ceil((runningTime.getTime() - latestStart.getTime()) / 60000);
            includedStops[i].actualStartTime = format(runningTime, 'HH:mm');
            runningTime = addMinutes(runningTime, v.durationMinutes);
            includedStops[i].departTime = format(runningTime, 'HH:mm');
          } else {
            includedStops[i].actualStartTime = format(runningTime, 'HH:mm');
            runningTime = addMinutes(runningTime, v.durationMinutes);
            includedStops[i].departTime = format(runningTime, 'HH:mm');
          }
        }
      } else if (includedStops[i].durationMin) {
        runningTime = addMinutes(runningTime, includedStops[i].durationMin || 0);
        includedStops[i].departTime = format(runningTime, 'HH:mm');
      }
    }

    const totalWaitMin = includedStops
      .filter(s => s.type === 'clean')
      .reduce((sum, s) => sum + (s.waitMin || 0), 0);

    const firstIncluded = includedStops[0];
    const lastIncluded = includedStops[includedStops.length - 1];
    const startTime = parse(firstIncluded.arrivalTime, 'HH:mm', new Date());
    const endTime = parse(lastIncluded.departTime || lastIncluded.arrivalTime, 'HH:mm', new Date());
    const rawDriverMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    const driverTotalMinutes = rawDriverMinutes - totalWaitMin;
    const driverTotalHours = Math.round((driverTotalMinutes / 60) * 10) / 10;

    const cleanTotalMinutes = includedStops
      .filter(s => s.type === 'clean')
      .reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const cleanTotalHours = Math.round((cleanTotalMinutes / 60) * 10) / 10;

    const actualDriveMin = Math.round(actualDriveSeconds / 60);

    const memberHours: TeamMemberHours[] = data.teamMembersWithAddr.map(tm => {
      const includedPickup = includedStops.find(s => s.type === 'pickup' && s.teamMemberId === tm.id);
      const includedDropoff = includedStops.find(s => s.type === 'dropoff' && s.teamMemberId === tm.id);
      const includedCleans = includedStops.filter(s => s.type === 'clean');

      if (!tm.isDriver) {
        if (includedCleans.length === 0) {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: false };
        }
        const firstClean = includedCleans[0];
        const lastClean = includedCleans[includedCleans.length - 1];
        const cleanStart = parse(firstClean.actualStartTime || firstClean.arrivalTime, 'HH:mm', new Date());
        const cleanEnd = parse(lastClean.departTime || lastClean.arrivalTime, 'HH:mm', new Date());
        const minutes = Math.round((cleanEnd.getTime() - cleanStart.getTime()) / 60000);
        return { name: tm.name, minutes, hours: Math.round((minutes / 60) * 10) / 10, isDriver: false };
      } else {
        let startTime: Date;
        let endTime: Date;

        if (includedPickup) {
          startTime = parse(includedPickup.arrivalTime, 'HH:mm', new Date());
        } else if (includedCleans.length > 0) {
          startTime = parse(includedCleans[0].actualStartTime || includedCleans[0].arrivalTime, 'HH:mm', new Date());
        } else {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: true };
        }

        if (includedDropoff) {
          endTime = parse(includedDropoff.arrivalTime, 'HH:mm', new Date());
        } else if (includedCleans.length > 0) {
          endTime = parse(includedCleans[includedCleans.length - 1].departTime || includedCleans[includedCleans.length - 1].arrivalTime, 'HH:mm', new Date());
        } else {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: true };
        }

        const rawMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
        const minutes = rawMinutes - totalWaitMin;
        return { name: tm.name, minutes, hours: Math.round((minutes / 60) * 10) / 10, isDriver: true };
      }
    });

    setTotalKm(Math.round(totalDist / 100) / 10);
    setDriverHours(driverTotalHours);
    setCleanHours(cleanTotalHours);
    setActualDriveMinutes(actualDriveMin);
    setTeamHours(memberHours);
    setRouteStops(stops);

    if (mapRef.current) {
      if (!mapInstance.current) {
        mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
          zoom: 12,
          center: origin,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
      }
      if (!directionsRenderer.current) {
        directionsRenderer.current = new (window as any).google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true,
        });
      }
      directionsRenderer.current.setDirections(routeResult);
      mapInstance.current.fitBounds(routeResult.routes[0].bounds);
      addMarkers(mapInstance.current, includedStops);
    }

    setLoading(false);
  }, []);

  const toggleStop = (index: number) => {
    const newStops = routeStops.map((s, i) =>
      i === index ? { ...s, included: s.included === false ? true : false } : s
    );
    setRouteStops(newStops);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (routeDataRef.current) {
        setLoading(true);
        setApiError(null);
        processRoute(routeDataRef.current, newStops);
      }
    }, 400);
  };

  const insertCustomStop = async (afterIndex: number) => {
    if (!formAddress.trim()) return;

    const loc = await geocodeAddress(formAddress);
    if (!loc) {
      setApiError(`Could not locate: ${formAddress}`);
      return;
    }

    const selectedCleaner = cleaners.find(c => c.id === formTeamMember);
    const autoLabel = formLabel.trim() || (
      formType === 'pickup' ? `Pick up ${selectedCleaner?.name || ''}` :
      formType === 'dropoff' ? `Drop off ${selectedCleaner?.name || ''}` :
      formType === 'wait' ? 'Wait / Task' :
      formType === 'other' ? 'Other Stop' : 'Stop'
    );

    const newStop: RouteStop = {
      type: formType === 'wait' ? 'wait' : formType === 'other' ? 'other' : formType,
      label: autoLabel,
      address: formAddress,
      arrivalTime: '',
      durationMin: formType === 'pickup' || formType === 'dropoff' ? 5 : formDuration,
      latLng: loc,
      included: true,
      isCustom: true,
      teamMemberId: formTeamMember || undefined,
      targetTime: formTargetTime || undefined,
    };

    const newStops = [...routeStops];
    newStops.splice(afterIndex + 1, 0, newStop);
    setRouteStops(newStops);
    setShowAddFormAt(null);
    setFormAddress('');
    setFormLabel('');
    setFormTeamMember('');
    setFormDuration(15);
    setFormTargetTime('');

    if (routeDataRef.current) {
      setLoading(true);
      setApiError(null);
      processRoute(routeDataRef.current, newStops);
    }
  };

  const addReliefStop = async () => {
    if (!formAddress.trim()) return;

    const loc = await geocodeAddress(formAddress);
    if (!loc) {
      setApiError(`Could not locate: ${formAddress}`);
      return;
    }

    const selectedCleaner = cleaners.find(c => c.id === formTeamMember);
    const autoLabel = formLabel.trim() || (
      formType === 'pickup' ? `Pick up ${selectedCleaner?.name || ''}` :
      formType === 'dropoff' ? `Drop off ${selectedCleaner?.name || ''}` :
      formType === 'wait' ? 'Wait / Task' :
      formType === 'other' ? 'Other Stop' : 'Stop'
    );

    const newStop: RouteStop = {
      type: formType === 'wait' ? 'wait' : formType === 'other' ? 'other' : formType,
      label: autoLabel,
      address: formAddress,
      arrivalTime: '',
      durationMin: formType === 'pickup' || formType === 'dropoff' ? 5 : formDuration,
      latLng: loc,
      included: true,
      isCustom: true,
      teamMemberId: formTeamMember || undefined,
      targetTime: formTargetTime || undefined,
    };

    const withoutHome = routeStops.filter(s => s.type !== 'home');
    const homeStop = routeStops.find(s => s.type === 'home');
    const newStops = homeStop
      ? [...withoutHome, newStop, homeStop]
      : [...routeStops, newStop];

    setRouteStops(newStops);
    setFormAddress('');
    setFormLabel('');
    setFormTeamMember('');
    setFormDuration(15);
    setFormTargetTime('');

    if (routeDataRef.current && newStops.length >= 2) {
      setLoading(true);
      setApiError(null);
      processRoute(routeDataRef.current, newStops);
    }
  };

  const addReliefHomeStop = async () => {
    if (!reliefAddress) return;
    const loc = await geocodeAddress(reliefAddress);
    if (!loc) return;

    const homeStop: RouteStop = {
      type: 'home',
      label: `Arrive Home — ${reliefName || 'Relief Driver'}`,
      address: reliefAddress,
      arrivalTime: '',
      durationMin: 0,
      latLng: loc,
      included: true,
    };

    const newStops = [...routeStops, homeStop];
    setRouteStops(newStops);

    if (routeDataRef.current && newStops.length >= 2) {
      setLoading(true);
      setApiError(null);
      processRoute(routeDataRef.current, newStops);
    }
  };

  const cancelReliefRoute = () => {
    setRouteStops([]);
    setRouteUrl('');
    setTotalKm(0);
    setDriverHours(0);
    setActualDriveMinutes(0);
    setApiError(null);
    clearRelief(dateStr);
  };

  const saveCurrentReliefRoute = () => {
    if (routeStops.length === 0) return;
    // Strip latLng before saving (not serializable)
    const serializable = routeStops.map(s => {
      const { latLng, ...rest } = s;
      return rest;
    });
    saveRelief(dateStr, serializable);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const startReliefRoute = async () => {
    if (!reliefAddress.trim()) {
      setApiError('Please enter the relief driver home address.');
      return;
    }
    if (!API_KEY) { setApiError('Add VITE_GOOGLE_MAPS_API_KEY to your .env file'); return; }

    setLoading(true);
    setApiError(null);
    setCopied(false);
    setRouteUrl('');
    setShowAddFormAt(null);
    setIsReliefMode(true);
    setSelectedDriver(null);

    await loadGoogleMaps(API_KEY);

    const homeLoc = await geocodeAddress(reliefAddress);
    if (!homeLoc) {
      setApiError('Could not locate relief driver home address.');
      setLoading(false);
      return;
    }

    const stops: RouteStop[] = [{
      type: 'depart',
      label: `Leave Home — ${reliefName || 'Relief Driver'}`,
      address: reliefAddress,
      arrivalTime: '',
      durationMin: 0,
      latLng: homeLoc,
      included: true,
    }];

    routeDataRef.current = {
      driver: null,
      driverVisits: [],
      teamMembersWithAddr: [],
      driverHome: homeLoc,
      clientLocs: {},
      teamLocs: {},
      isRelief: true,
      reliefName: reliefName || 'Relief Driver',
    };

    setRouteStops(stops);
    setLoading(false);
  };

  const copyPlan = () => {
    if (routeStops.length === 0) return;
    const includedStops = routeStops.filter(s => s.included !== false);
    const isRelief = isReliefMode;

    const dateLabel = format(selectedDate, 'EEEE, MMM d, yyyy');
    const driverLabel = isRelief
      ? (reliefName || 'Relief Driver')
      : (selectedDriver?.name || 'Driver');

    let text = `HHCE ROUTE PLAN\n`;
    text += `${dateLabel}\n`;
    text += `Driver: ${driverLabel}${isRelief ? ' (Relief / Shuttle)' : ''}\n`;
    if (!isRelief && teamHours.length > 0) {
      const teamList = teamHours.map(t => `${t.name}${t.isDriver ? ' (Driver)' : ' (Cleaner)'}`).join(', ');
      text += `Team: ${teamList}\n`;
    }
    text += `═══════════════════════════════════════\n\n`;

    includedStops.forEach((stop, i) => {
      text += `${stop.arrivalTime || '----'} — ${stop.label}\n`;
      text += `${stop.address}\n`;
      if (stop.targetTime) {
        text += `Target: ${stop.targetTime}\n`;
      }

      if (stop.type === 'clean' && stop.visitId) {
        const v = dayVisits.find(dv => dv.id === stop.visitId);
        if (v) {
          const sched = parse(v.startTime, 'HH:mm', new Date());
          const earliest = format(addMinutes(sched, -15), 'HH:mm');
          const latest = format(addMinutes(sched, 15), 'HH:mm');
          text += `Scheduled: ${v.startTime} | Window: ${earliest}–${latest}\n`;
          if (stop.waitMin && stop.waitMin > 0) {
            text += `WAIT: ${stop.waitMin} min (possible break)\n`;
          }
          if (stop.isLate && stop.lateMin) {
            text += `LATE: ${stop.lateMin} min past window\n`;
          }
          text += `Clean: ${stop.actualStartTime || stop.arrivalTime} – ${stop.departTime || 'N/A'} (${stop.durationMin} min)\n`;
        }
      } else if (stop.type === 'pickup') {
        text += `Pickup window: 5 min\n`;
      } else if (stop.type === 'wait') {
        text += `Wait / Task: ${stop.durationMin} min\n`;
      } else if (stop.type === 'other') {
        text += `Stop duration: ${stop.durationMin} min\n`;
      }

      if (i > 0 && stop.legDistanceKm !== undefined) {
        text += `Drive: ${stop.legDistanceKm.toFixed(1)} km (${Math.round(stop.legDurationMin || 0)} min)\n`;
      }
      text += `\n`;
    });

    const skippedStops = routeStops.filter(s => s.included === false);
    if (skippedStops.length > 0) {
      text += `--- SKIPPED STOPS ---\n`;
      skippedStops.forEach(s => {
        text += `☐ ${s.label} — ${s.address}\n`;
      });
      text += `\n`;
    }

    text += `═══════════════════════════════════════\n`;
    text += `TOTAL DISTANCE: ${totalKm.toFixed(1)} km\n`;
    text += `TOTAL DRIVER HOURS: ${driverHours.toFixed(1)} hrs (door to door)\n`;
    if (!isRelief) {
      text += `BILLABLE CLEAN HOURS: ${cleanHours.toFixed(1)} hrs (revenue)\n`;
    }
    text += `ACTUAL DRIVING MINUTES: ${actualDriveMinutes} min (Google Maps)\n`;
    if (!isRelief && teamHours.length > 0) {
      text += `TEAM HOURS:\n`;
      teamHours.forEach(tm => {
        const payType = tm.isDriver ? 'door-to-door' : 'clean-to-clean';
        text += `  ${tm.name}: ${tm.hours.toFixed(1)} hrs (${tm.minutes} min) [${payType}]\n`;
      });
    }
    if (routeUrl) {
      text += `\n📍 GOOGLE MAPS ROUTE:\n${routeUrl}\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const buildRoute = async (driver: Cleaner) => {
    if (!API_KEY) { setApiError('Add VITE_GOOGLE_MAPS_API_KEY to your .env file'); return; }
    setLoading(true);
    setSelectedDriver(driver);
    setApiError(null);
    setCopied(false);
    setRouteUrl('');
    setShowAddFormAt(null);
    setIsReliefMode(false);

    await loadGoogleMaps(API_KEY);

    const driverVisits = dayVisits.filter(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      return ids.includes(driver.id);
    });

    if (driverVisits.length === 0) { setLoading(false); return; }

    const teamMemberIds = new Set<string>();
    driverVisits.forEach(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      ids.forEach(id => { if (id !== driver.id) teamMemberIds.add(id); });
    });
    const teamMembers = cleaners.filter(c => teamMemberIds.has(c.id) && c.active);
    const teamMembersWithAddr = teamMembers.filter(tm => tm.address && tm.address.trim() !== '');

    const driverHome = driver.address ? await geocodeAddress(driver.address) : null;
    const clientLocs: Record<string, any> = {};
    const teamLocs: Record<string, any> = {};

    for (const v of driverVisits) {
      const client = clients.find(c => c.id === v.clientId);
      const addr = v.clientAddress || client?.address;
      if (addr) {
        const loc = await geocodeAddress(addr);
        if (loc) clientLocs[v.id] = loc;
      }
    }
    for (const tm of teamMembersWithAddr) {
      const loc = await geocodeAddress(tm.address!);
      if (loc) teamLocs[tm.id] = loc;
    }

    const missing: string[] = [];
    if (!driverHome) missing.push(`${driver.name} home`);
    driverVisits.forEach(v => { if (!clientLocs[v.id]) missing.push(v.clientName); });
    teamMembersWithAddr.forEach(tm => { if (!teamLocs[tm.id]) missing.push(`${tm.name} pickup`); });

    if (missing.length > 0) {
      setApiError(`Could not locate: ${missing.join(', ')}. Please check addresses.`);
      setLoading(false);
      return;
    }

    const stops: RouteStop[] = [];

    stops.push({
      type: 'depart',
      label: `Leave Home — ${driver.name}`,
      address: driver.address || 'Unknown',
      arrivalTime: '',
      durationMin: 0,
      latLng: driverHome,
      included: true,
    });

    for (const tm of teamMembersWithAddr) {
      stops.push({
        type: 'pickup',
        label: `Pick up ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
        teamMemberId: tm.id,
        latLng: teamLocs[tm.id],
        included: true,
      });
    }

    for (const v of driverVisits) {
      const client = clients.find(c => c.id === v.clientId);
      stops.push({
        type: 'clean',
        label: `Clean — ${v.clientName}`,
        address: v.clientAddress || client?.address || 'Unknown',
        arrivalTime: '',
        departTime: '',
        durationMin: v.durationMinutes,
        visitId: v.id,
        latLng: clientLocs[v.id],
        included: true,
      });
    }

    [...teamMembersWithAddr].reverse().forEach(tm => {
      stops.push({
        type: 'dropoff',
        label: `Drop off ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
        teamMemberId: tm.id,
        latLng: teamLocs[tm.id],
        included: true,
      });
    });

    stops.push({
      type: 'home',
      label: `Arrive Home — ${driver.name}`,
      address: driver.address || 'Unknown',
      arrivalTime: '',
      durationMin: 0,
      latLng: driverHome,
      included: true,
    });

    routeDataRef.current = {
      driver,
      driverVisits,
      teamMembersWithAddr,
      driverHome,
      clientLocs,
      teamLocs,
      isRelief: false,
      reliefName: '',
    };

    await processRoute(routeDataRef.current, stops);
  };

  const handleTeamMemberChange = (value: string) => {
    setFormTeamMember(value);
    const cleaner = cleaners.find(c => c.id === value);
    if (cleaner && cleaner.address && (formType === 'pickup' || formType === 'dropoff')) {
      setFormAddress(cleaner.address);
    }
  };

  const handleFormTypeChange = (value: 'pickup' | 'dropoff' | 'wait' | 'other') => {
    setFormType(value);
    const cleaner = cleaners.find(c => c.id === formTeamMember);
    if (cleaner && cleaner.address && (value === 'pickup' || value === 'dropoff')) {
      setFormAddress(cleaner.address);
    }
  };

  const renderAddForm = (isRelief: boolean, insertIndex?: number) => (
    <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <Plus size={14} className="text-blue-600" />
        <span className="text-xs font-bold text-slate-700">Add Stop</span>
      </div>
      <select
        value={formType}
        onChange={e => handleFormTypeChange(e.target.value as 'pickup' | 'dropoff' | 'wait' | 'other')}
        className="w-full text-xs rounded-lg border-slate-300 p-2 bg-white"
      >
        <option value="pickup">Pick up</option>
        <option value="dropoff">Drop off</option>
        <option value="wait">Wait / Task</option>
        <option value="other">Other Stop</option>
      </select>
      <select
        value={formTeamMember}
        onChange={e => handleTeamMemberChange(e.target.value)}
        className="w-full text-xs rounded-lg border-slate-300 p-2 bg-white"
      >
        <option value="">— Select Cleaner (optional) —</option>
        {cleaners.filter(c => c.active).map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Address"
        value={formAddress}
        onChange={e => setFormAddress(e.target.value)}
        className="w-full text-xs rounded-lg border-slate-300 p-2"
      />
      <input
        type="time"
        placeholder="Must arrive by (HH:mm)"
        value={formTargetTime}
        onChange={e => setFormTargetTime(e.target.value)}
        className="w-full text-xs rounded-lg border-slate-300 p-2"
      />
      <p className="text-[10px] text-slate-400 -mt-1">Target time for backtiming (optional)</p>
      {formType !== 'pickup' && formType !== 'dropoff' && (
        <input
          type="number"
          placeholder="Duration (minutes)"
          value={formDuration}
          onChange={e => setFormDuration(Number(e.target.value))}
          className="w-full text-xs rounded-lg border-slate-300 p-2"
        />
      )}
      <input
        type="text"
        placeholder="Label (optional)"
        value={formLabel}
        onChange={e => setFormLabel(e.target.value)}
        className="w-full text-xs rounded-lg border-slate-300 p-2"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => isRelief ? addReliefStop() : insertCustomStop(insertIndex ?? -1)}
          className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
        >
          Add Stop
        </button>
        {!isRelief && (
          <button
            onClick={() => setShowAddFormAt(null)}
            className="px-3 bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-lg hover:bg-slate-300 active:scale-95 transition-all"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <h2 className="text-lg font-black flex items-center gap-2">
          <Navigation size={20} /> Route Planner
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl active:scale-95">
          <X size={20} />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Drivers on {format(selectedDate, 'EEEE, MMM d')}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {regularDrivers.map(d => (
            <button
              key={d.id}
              onClick={() => buildRoute(d)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedDriver?.id === d.id && !isReliefMode
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color || '#94a3b8' }} />
              {d.name}
            </button>
          ))}
          {regularDrivers.length === 0 && (
            <span className="text-sm text-slate-400 font-medium">No drivers scheduled today.</span>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <button
            onClick={() => {
              setIsReliefMode(!isReliefMode);
              if (!isReliefMode) {
                setSelectedDriver(null);
                setRouteStops([]);
                setRouteUrl('');
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              isReliefMode
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-white text-amber-700 border border-amber-200 hover:border-amber-400'
            }`}
          >
            <Bus size={16} />
            {isReliefMode ? 'Close Relief Mode' : 'Relief Driver Shuttle'}
          </button>

          {isReliefMode && (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                placeholder="Relief driver name"
                value={reliefName}
                onChange={e => setReliefName(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 p-2"
              />
              <input
                type="text"
                placeholder="Relief driver home address"
                value={reliefAddress}
                onChange={e => setReliefAddress(e.target.value)}
                className="w-full text-xs rounded-lg border-slate-300 p-2"
              />
              <button
                onClick={startReliefRoute}
                className="w-full bg-amber-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-amber-700 active:scale-95 transition-all"
              >
                Start Relief Route
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        <div className="sm:w-[420px] sm:border-r border-slate-200 overflow-y-auto bg-white">
          {apiError && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-bold flex items-center gap-2">
              <AlertTriangle size={14} /> {apiError}
            </div>
          )}

          {savedNotice && (
            <div className="m-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-bold flex items-center gap-2">
              <Check size={14} /> Route saved for {format(selectedDate, 'MMM d')}
            </div>
          )}

          {loading && (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">Calculating route...</p>
            </div>
          )}

          {!loading && routeStops.length > 0 && (
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Distance</p>
                  <p className="text-2xl font-black text-blue-700">{totalKm.toFixed(1)} <span className="text-sm font-bold">km</span></p>
                </div>
                <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Driver Hours</p>
                  <p className="text-2xl font-black text-green-700">{driverHours.toFixed(1)} <span className="text-sm font-bold">hrs</span></p>
                  <p className="text-[10px] text-green-600 font-medium mt-0.5">Door to door</p>
                </div>
                {!isReliefMode && (
                  <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                    <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Clean Hours</p>
                    <p className="text-2xl font-black text-purple-700">{cleanHours.toFixed(1)} <span className="text-sm font-bold">hrs</span></p>
                    <p className="text-[10px] text-purple-600 font-medium mt-0.5">Billable to clients</p>
                  </div>
                )}
                <div className={`p-3 bg-amber-50 rounded-xl border border-amber-100 ${isReliefMode ? 'col-span-2' : ''}`}>
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Actual Drive</p>
                  <p className="text-2xl font-black text-amber-700">{actualDriveMinutes} <span className="text-sm font-bold">min</span></p>
                  <p className="text-[10px] text-amber-600 font-medium mt-0.5">Google Maps directions</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={copyPlan}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy Plan'}
                </button>

                {routeUrl && (
                  <a
                    href={routeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-sm bg-blue-600 text-white hover:bg-blue-700 transition-all active:scale-95"
                  >
                    <ExternalLink size={16} />
                    Open in Maps
                  </a>
                )}
              </div>

              {isReliefMode && routeStops.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={saveCurrentReliefRoute}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all"
                  >
                    <Save size={14} /> Save for {format(selectedDate, 'MMM d')}
                  </button>
                  <button
                    onClick={cancelReliefRoute}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 active:scale-95 transition-all"
                  >
                    <RotateCcw size={14} /> Cancel Route
                  </button>
                </div>
              )}

              <div className="space-y-0 mb-4">
                {routeStops.map((stop, i) => {
                  const isExcluded = stop.included === false;
                  const isLast = i === routeStops.length - 1;
                  return (
                    <React.Fragment key={i}>
                      <div className={`flex gap-3 relative ${isExcluded ? 'opacity-50' : ''}`}>
                        {i < routeStops.length - 1 && (
                          <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200" />
                        )}
                        <div className="flex flex-col items-center shrink-0 z-10 pt-1">
                          <input
                            type="checkbox"
                            checked={stop.included !== false}
                            onChange={() => toggleStop(i)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </div>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 ${
                          stop.type === 'depart' ? 'bg-blue-100 text-blue-600' :
                          stop.type === 'pickup' ? 'bg-green-100 text-green-600' :
                          stop.type === 'clean' ? 'bg-purple-100 text-purple-600' :
                          stop.type === 'dropoff' ? 'bg-amber-100 text-amber-600' :
                          stop.type === 'wait' ? 'bg-cyan-100 text-cyan-600' :
                          stop.type === 'other' ? 'bg-pink-100 text-pink-600' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {stop.type === 'depart' && <Home size={18} />}
                          {stop.type === 'pickup' && <Users size={18} />}
                          {stop.type === 'clean' && <MapPin size={18} />}
                          {stop.type === 'dropoff' && <Users size={18} />}
                          {stop.type === 'wait' && <Clock size={18} />}
                          {stop.type === 'other' && <CircleDot size={18} />}
                          {stop.type === 'home' && <Home size={18} />}
                        </div>

                        <div className="pb-5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className={`text-sm font-bold ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                              {stop.label}
                            </span>
                            {!isExcluded && (
                              <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                                stop.isLate ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                              }`}>
                                <Clock size={10} className="inline mr-0.5" />
                                {stop.arrivalTime}
                                {stop.departTime && ` – ${stop.departTime}`}
                              </span>
                            )}
                            {!isExcluded && stop.waitMin && stop.waitMin > 0 && (
                              <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                WAIT {stop.waitMin} MIN
                              </span>
                            )}
                            {!isExcluded && stop.isLate && (
                              <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded">
                                {stop.lateMin} MIN LATE
                              </span>
                            )}
                            {isExcluded && (
                              <span className="text-[10px] font-black bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                                SKIPPED
                              </span>
                            )}
                            {stop.isCustom && !isExcluded && (
                              <span className="text-[10px] font-black bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">
                                CUSTOM
                              </span>
                            )}
                            {stop.targetTime && !isExcluded && (
                              <span className="text-[10px] font-black bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                                🎯 {stop.targetTime}
                              </span>
                            )}
                          </div>
                          <p className={`text-xs truncate ${isExcluded ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                            {stop.address}
                          </p>
                          {!isExcluded && stop.type === 'clean' && stop.durationMin && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {stop.durationMin} min estimated clean
                            </p>
                          )}
                          {!isExcluded && stop.type === 'pickup' && (
                            <p className="text-[10px] text-slate-400 mt-0.5">5 min pickup window</p>
                          )}
                          {!isExcluded && (stop.type === 'wait' || stop.type === 'other') && stop.durationMin && (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {stop.durationMin} min stop duration
                            </p>
                          )}
                          {!isExcluded && i > 0 && stop.legDistanceKm !== undefined && (
                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <Navigation size={9} /> {stop.legDistanceKm.toFixed(1)} km drive • {Math.round(stop.legDurationMin || 0)} min
                              {(stop.legDurationMin || 0) > 30 && (
                                <span className="text-amber-600 font-bold ml-1">(tight)</span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>

                      {!isLast && showAddFormAt === i && (
                        <div className="pl-14 py-1">
                          {renderAddForm(false, i)}
                        </div>
                      )}

                      {!isLast && (
                        <div className="pl-14 py-1">
                          <button
                            onClick={() => setShowAddFormAt(showAddFormAt === i ? null : i)}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                          >
                            <Plus size={12} /> Add Stop
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Relief driver add form at bottom */}
              {isReliefMode && (
                <div className="mt-2 space-y-2">
                  {renderAddForm(true)}
                  <button
                    onClick={addReliefHomeStop}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    <Home size={14} /> Add Home / End Route
                  </button>
                </div>
              )}

              {!isReliefMode && teamHours.length > 0 && (
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                    <Users size={10} /> Team Member Hours
                  </p>
                  <div className="space-y-2">
                    {teamHours.map(tm => (
                      <div key={tm.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tm.isDriver ? '#2563eb' : '#059669' }} />
                          <div>
                            <span className="text-sm font-bold text-slate-700">{tm.name}</span>
                            <span className="text-[10px] text-slate-400 ml-1.5 font-medium">
                              {tm.isDriver ? '(Driver — door to door)' : '(Cleaner — clean to clean)'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black text-slate-800">{tm.hours.toFixed(1)}</span>
                          <span className="text-xs font-bold text-slate-500 ml-1">hrs</span>
                          <p className="text-[10px] text-slate-400">{tm.minutes} min total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !selectedDriver && !isReliefMode && !apiError && (
            <div className="p-8 text-center">
              <Car className="mx-auto mb-3 text-slate-300" size={40} />
              <p className="text-sm text-slate-500 font-medium">Select a driver to calculate their route.</p>
              <p className="text-xs text-slate-400 mt-1">Use Relief Driver Shuttle for non-cleaning shuttle runs.</p>
            </div>
          )}

          {!loading && isReliefMode && routeStops.length === 0 && !apiError && (
            <div className="p-8 text-center">
              <Bus className="mx-auto mb-3 text-amber-300" size={40} />
              <p className="text-sm text-slate-500 font-medium">Enter relief driver info and click Start Relief Route.</p>
            </div>
          )}
        </div>

        <div className="flex-1 bg-slate-100 relative min-h-[300px]">
          <div ref={mapRef} className="absolute inset-0" />
          {!API_KEY && !mapInstance.current && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center p-6">
                <MapPin className="mx-auto mb-3 text-slate-300" size={40} />
                <p className="text-sm text-slate-500 font-medium">Google Maps API key required.</p>
                <p className="text-xs text-slate-400 mt-1">Add VITE_GOOGLE_MAPS_API_KEY to .env</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};