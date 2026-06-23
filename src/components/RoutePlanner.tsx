import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import type { Cleaner, Visit } from '../types';
import { loadGoogleMaps, geocodeAddress, calculateRoute, areSameLatLng } from '../utils/maps';
import { format, parse, addMinutes as addMinutesDateFns, isAfter, isBefore } from 'date-fns';
import { formatHrsMins } from '../utils/hours';
import {
  X, MapPin, Clock, Calendar, Phone, FileText, User, Car, Users,
  ChevronLeft, ChevronRight, Navigation, AlertTriangle, Plus, Minus
} from 'lucide-react';

declare const google: any;


const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

interface RouteStop {
  type: 'depart' | 'pickup' | 'clean' | 'dropoff' | 'home' | 'intermediate-pickup' | 'intermediate-dropoff';
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
  afterVisitId?: string; // For manual stops: insert after this visit
}

interface TeamMemberHours {
  name: string;
  minutes: number;
  hours: number;
  isDriver: boolean;
  cleanMinutes?: number;
  travelMinutes?: number;
  travelDistanceKm?: number;
  waitMinutes?: number;
}

interface RouteData {
  driver: Cleaner;
  driverVisits: Visit[];
  teamMembersWithAddr: Cleaner[];
  driverHome: any;
  clientLocs: Record<string, any>;
  teamLocs: Record<string, any>;
}

interface RoutePlannerProps {
  onClose: () => void;
  initialDriver?: Cleaner;
  initialReliefDate?: string;
  initialDate?: string;
}

const formatLocalDate = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const dayName = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

export const RoutePlanner: React.FC<RoutePlannerProps> = ({ onClose, initialDriver, initialReliefDate, initialDate }) => {
  const { visits, clients, teams, cleaners, routeModifications, setRouteModifications } = useAppContext();
  const [selectedDate, setSelectedDate] = useState<string>(initialReliefDate || initialDate || formatLocalDate(new Date()));
  const [selectedDriver] = useState<Cleaner | null>(initialDriver || null);
  const [detailVisit, setDetailVisit] = useState<Visit | null>(null);

  // Route state (mirrors RoutePlanner)
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [totalKm, setTotalKm] = useState(0);
  const [driverTotalMinutes, setDriverTotalMinutes] = useState(0);
  const [cleanTotalMinutes, setCleanTotalMinutes] = useState(0);
  const [actualDriveMinutes, setActualDriveMinutes] = useState(0);
  const [teamHours, setTeamHours] = useState<TeamMemberHours[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [routeUrl, setRouteUrl] = useState('');

  // Manual stop form state
  const [showAddStop, setShowAddStop] = useState(false);
  const [stopType, setStopType] = useState<'intermediate-pickup' | 'intermediate-dropoff'>('intermediate-dropoff');
  const [stopCleanerId, setStopCleanerId] = useState('');
  const [stopAfterVisitId, setStopAfterVisitId] = useState('');
  const [stopAddress, setStopAddress] = useState('');

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);
  const routeDataRef = useRef<RouteData | null>(null);
  const directionsResultRef = useRef<any>(null);

  // Determine role and driver for the day
  const dayVisits = useMemo(() =>
    visits.filter(v => v.date === selectedDate && !v.cancelled).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [visits, selectedDate]);

  const myVisits = useMemo(() => {
    return dayVisits.filter(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      return selectedDriver ? ids.includes(selectedDriver.id) : false;
    });
  }, [dayVisits, selectedDriver?.id, teams]);

  // Find the driver for this cleaner's team today
  const myDriver = useMemo(() => {
    if (selectedDriver?.isDriver) return selectedDriver;
    for (const v of myVisits) {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      for (const cid of ids) {
        const c = cleaners.find(x => x.id === cid);
        if (c?.isDriver) return c;
      }
    }
    return null;
  }, [myVisits, selectedDriver, cleaners, teams]);

  const hasDriverPickup = !!myDriver && !selectedDriver?.isDriver;

  // All visits for the driver (used for manual stop form and route building)
  const driverVisits = useMemo(() => {
    const driver = selectedDriver?.isDriver ? selectedDriver : myDriver;
    if (!driver) return [];
    return dayVisits.filter(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      return ids.includes(driver.id);
    });
  }, [dayVisits, selectedDriver, myDriver, teams]);

  // Build route whenever date, driver, or visits change
  useEffect(() => {
    if (!API_KEY) { setApiError('Google Maps API key not configured'); return; }
    if (myVisits.length === 0) {
      setRouteStops([]);
      setTotalKm(0);
      setDriverTotalMinutes(0);
      setCleanTotalMinutes(0);
      setActualDriveMinutes(0);
      setTeamHours([]);
      setRouteUrl('');
      clearMap();
      return;
    }

    // If solo non-driver (no driver), show simple timeline without map
    if (!selectedDriver?.isDriver && !myDriver) {
      buildSoloRoute();
      return;
    }

    // Otherwise build full Google Maps route (driver or non-driver on team)
    const driver = selectedDriver?.isDriver ? selectedDriver : myDriver!;
    buildFullRoute(driver);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedDriver?.id, myVisits.length, myDriver?.id, JSON.stringify(routeModifications)]);

  // Render map whenever routeStops changes (even with null directionsResult)
  useEffect(() => {
    if (mapRef.current && routeStops.length > 0 && (window as any).google) {
      renderMap(routeStops, directionsResultRef.current);
    }
  }, [routeStops]);

  const clearMap = () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoWindowsRef.current.forEach((iw: any) => iw.close());
    infoWindowsRef.current = [];
    if (directionsRenderer.current) {
      directionsRenderer.current.setDirections({ routes: [] });
    }
    if (!isMapAlive()) {
      mapInstance.current = null;
      directionsRenderer.current = null;
    }
  };

  const isMapAlive = (): boolean => {
    if (!mapInstance.current) return false;
    try {
      const div = mapInstance.current.getDiv();
      return !!div && document.body.contains(div);
    } catch {
      return false;
    }
  };

  const getRouteKey = (driverId: string, date: string) => `${driverId}_${date}`;

  const getManualStopsForRoute = (): RouteStop[] => {
    if (!selectedDriver) return [];
    const driver = selectedDriver.isDriver ? selectedDriver : myDriver;
    if (!driver) return [];
    return routeModifications[getRouteKey(driver.id, selectedDate)] || [];
  };

  const addManualStop = async () => {
    if (!stopCleanerId || !stopAddress) return;
    const cleaner = cleaners.find(c => c.id === stopCleanerId);
    if (!cleaner) return;

    const driver = selectedDriver?.isDriver ? selectedDriver : myDriver;
    if (!driver) return;

    const newStop: RouteStop = {
      type: stopType,
      label: stopType === 'intermediate-pickup' ? `Pick up ${cleaner.name}` : `Drop off ${cleaner.name}`,
      address: stopAddress,
      arrivalTime: '',
      durationMin: 5,
      teamMemberId: cleaner.id,
      afterVisitId: stopAfterVisitId || undefined,
    };

    const key = getRouteKey(driver.id, selectedDate);
    const current = routeModifications[key] || [];
    setRouteModifications({
      ...routeModifications,
      [key]: [...current, newStop],
    });

    resetStopForm();
  };

  const removeManualStop = (idx: number) => {
    const driver = selectedDriver?.isDriver ? selectedDriver : myDriver;
    if (!driver) return;
    const key = getRouteKey(driver.id, selectedDate);
    const current = routeModifications[key] || [];
    const updated = [...current];
    updated.splice(idx, 1);
    if (updated.length === 0) {
      const { [key]: _, ...rest } = routeModifications;
      setRouteModifications(rest);
    } else {
      setRouteModifications({ ...routeModifications, [key]: updated });
    }
  };

  const resetStopForm = () => {
    setShowAddStop(false);
    setStopType('intermediate-dropoff');
    setStopCleanerId('');
    setStopAfterVisitId('');
    setStopAddress('');
  };

  const buildSoloRoute = () => {
    // Non-driver with no driver — just their own visits
    const stops: RouteStop[] = myVisits.map((v) => {
      const client = clients.find(c => c.id === v.clientId);
      return {
        type: 'clean',
        label: `Clean — ${v.clientName}`,
        address: v.clientAddress || client?.address || 'Unknown',
        arrivalTime: v.startTime,
        departTime: format(addMinutesDateFns(parse(v.startTime, 'HH:mm', new Date()), v.durationMinutes), 'HH:mm'),
        durationMin: v.durationMinutes,
        visitId: v.id,
      };
    });

    setRouteStops(stops);
    const first = stops[0];
    const last = stops[stops.length - 1];
    const start = parse(first.arrivalTime, 'HH:mm', new Date());
    const end = parse(last.departTime || last.arrivalTime, 'HH:mm', new Date());
    const mins = Math.round((end.getTime() - start.getTime()) / 60000);
    setDriverTotalMinutes(0);
    setCleanTotalMinutes(mins);
    setActualDriveMinutes(0);
    setTotalKm(0);
    setTeamHours([]);
    setRouteUrl('');
    clearMap();
    setLoading(false);
  };

  const buildFullRoute = async (driver: Cleaner) => {
    setLoading(true);
    setApiError(null);
    clearMap();

    await loadGoogleMaps(API_KEY);

    const currentDriverVisits = driverVisits;

    if (currentDriverVisits.length === 0) {
      setLoading(false);
      return;
    }

    const teamMemberIds = new Set<string>();
    currentDriverVisits.forEach(v => {
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

    for (const v of currentDriverVisits) {
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
    currentDriverVisits.forEach(v => { if (!clientLocs[v.id]) missing.push(v.clientName); });
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
    });

    // Get manual stops for this route
    const manualStops = getManualStopsForRoute();
    const cleanersWithIntermediatePickup = new Set(
      manualStops.filter(s => s.type === 'intermediate-pickup').map(s => s.teamMemberId).filter(Boolean)
    );
    const cleanersWithIntermediateDropoff = new Set(
      manualStops.filter(s => s.type === 'intermediate-dropoff').map(s => s.teamMemberId).filter(Boolean)
    );

    // Add initial pickups for team members who don't have an intermediate-pickup
    for (const tm of teamMembersWithAddr) {
      if (cleanersWithIntermediatePickup.has(tm.id)) continue;
      stops.push({
        type: 'pickup',
        label: `Pick up ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
        teamMemberId: tm.id,
        latLng: teamLocs[tm.id],
      });
    }

    // Insert manual pickups without afterVisitId before first clean
    const beforeFirstCleanStops = manualStops.filter(s => s.type === 'intermediate-pickup' && !s.afterVisitId);
    for (const ms of beforeFirstCleanStops) {
      const cleaner = cleaners.find(c => c.id === ms.teamMemberId);
      if (cleaner) {
        const addr = ms.address || cleaner.address;
        let loc = teamLocs[cleaner.id];
        if (addr && !loc) {
          loc = await geocodeAddress(addr);
        }
        stops.push({
          ...ms,
          label: `Pick up ${cleaner.name}`,
          address: addr || 'Unknown',
          latLng: loc,
        });
      }
    }

    for (const v of currentDriverVisits) {
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
      });

      // Insert any manual stops that should come after this visit
      const afterStops = manualStops.filter(s => s.afterVisitId === v.id);
      for (const ms of afterStops) {
        const cleaner = cleaners.find(c => c.id === ms.teamMemberId);
        if (cleaner) {
          const addr = ms.address || cleaner.address;
          let loc = teamLocs[cleaner.id];
          if (addr && !loc) {
            loc = await geocodeAddress(addr);
          }
          stops.push({
            ...ms,
            label: ms.type === 'intermediate-pickup' ? `Pick up ${cleaner.name}` : `Drop off ${cleaner.name}`,
            address: addr || 'Unknown',
            latLng: loc,
          });
        }
      }
    }

    // Add final dropoffs for team members who don't have an intermediate-dropoff
    [...teamMembersWithAddr].reverse().forEach(tm => {
      if (cleanersWithIntermediateDropoff.has(tm.id)) return;
      stops.push({
        type: 'dropoff',
        label: `Drop off ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
        teamMemberId: tm.id,
        latLng: teamLocs[tm.id],
      });
    });

    stops.push({
      type: 'home',
      label: `Arrive Home — ${driver.name}`,
      address: driver.address || 'Unknown',
      arrivalTime: '',
      durationMin: 0,
      latLng: driverHome,
    });

    routeDataRef.current = {
      driver,
      driverVisits: currentDriverVisits,
      teamMembersWithAddr,
      driverHome,
      clientLocs,
      teamLocs,
    };

    await processRoute(routeDataRef.current, stops);
  };

  const processRoute = useCallback(async (data: RouteData, stops: RouteStop[]) => {
    const latLngs = stops.map(s => s.latLng).filter(Boolean);
    if (latLngs.length < 2) {
      setApiError('Not enough stops to build a route.');
      setLoading(false);
      return;
    }

    const origin = latLngs[0];
    const destination = latLngs[latLngs.length - 1];
    const waypoints = latLngs.slice(1, -1);

    // Build Google Maps URL
    const originStr = `${origin.lat()},${origin.lng()}`;
    const destStr = `${destination.lat()},${destination.lng()}`;
    const waypointsStr = waypoints.map((ll: any) => `${ll.lat()},${ll.lng()}`).join('|');
    const mapsUrl = waypointsStr
      ? `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&waypoints=${waypointsStr}`
      : `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}`;
    setRouteUrl(mapsUrl);

    let routeResult = await calculateRoute(origin, destination, waypoints);
    let legs: any[] = [];
    const expectedLegs = stops.length - 1;

    if (routeResult && routeResult.routes?.[0]?.legs) {
      legs = routeResult.routes[0].legs;
      if (legs.length < expectedLegs) {
        // Pad missing legs for consecutive stops at the same location
        const paddedLegs: any[] = [];
        let legIdx = 0;
        for (let i = 1; i < stops.length; i++) {
          const prev = stops[i - 1];
          const curr = stops[i];
          if (prev.latLng && curr.latLng && areSameLatLng(prev.latLng, curr.latLng)) {
            paddedLegs.push({
              distance: { value: 0, text: '0 m' },
              duration: { value: 0, text: '0 min' },
              steps: [],
              start_location: prev.latLng,
              end_location: curr.latLng,
            });
          } else {
            paddedLegs.push(legs[legIdx] || {
              distance: { value: 0, text: '0 m' },
              duration: { value: 0, text: '0 min' },
              steps: [],
              start_location: prev.latLng,
              end_location: curr.latLng,
            });
            legIdx++;
          }
        }
        legs = paddedLegs;
      }
    } else {
      // Google Maps returned ZERO_RESULTS or failed — build synthetic zero-distance legs
      setApiError(null);
      for (let i = 1; i < stops.length; i++) {
        legs.push({
          distance: { value: 0, text: '0 m' },
          duration: { value: 0, text: '0 min' },
          steps: [],
          start_location: stops[i - 1].latLng,
          end_location: stops[i].latLng,
        });
      }
    }

    let totalDist = 0;

    // Find first clean anchor
    const firstCleanIdx = stops.findIndex(s => s.type === 'clean');
    let firstCleanVisit: Visit | null = null;
    if (firstCleanIdx >= 0) {
      const stop = stops[firstCleanIdx];
      if (stop.visitId) {
        firstCleanVisit = data.driverVisits.find(dv => dv.id === stop.visitId) || null;
      }
    }

    // Work backward from first clean to find home departure time
    let departTime: Date;
    if (firstCleanVisit) {
      departTime = parse(firstCleanVisit.startTime, 'HH:mm', new Date());
      for (let i = firstCleanIdx; i > 0; i--) {
        const leg = legs[i - 1];
        departTime = new Date(departTime.getTime() - (leg.duration.value * 1000));
        if (stops[i - 1].durationMin) {
          departTime = addMinutesDateFns(departTime, -(stops[i - 1].durationMin || 0));
        }
      }
    } else {
      departTime = parse('08:00', 'HH:mm', new Date());
    }

    // Work forward
    let runningTime = new Date(departTime.getTime());
    stops[0].arrivalTime = format(runningTime, 'HH:mm');

    for (let i = 1; i < stops.length; i++) {
      const leg = legs[i - 1];
      totalDist += leg.distance.value;
      const driveMs = leg.duration.value * 1000;
      runningTime = new Date(runningTime.getTime() + driveMs);

      stops[i].legDistanceKm = leg.distance.value / 1000;
      stops[i].legDurationMin = Math.round(leg.duration.value / 60);
      stops[i].arrivalTime = format(runningTime, 'HH:mm');

      if (stops[i].type === 'clean') {
        let v = data.driverVisits.find(dv => dv.id === stops[i].visitId);
        if (v) {
          const scheduledStart = parse(v.startTime, 'HH:mm', new Date());
          const earliestStart = addMinutesDateFns(scheduledStart, -15);
          const latestStart = addMinutesDateFns(scheduledStart, 15);

          if (isBefore(runningTime, earliestStart)) {
            stops[i].waitMin = Math.ceil((earliestStart.getTime() - runningTime.getTime()) / 60000);
            stops[i].actualStartTime = format(earliestStart, 'HH:mm');
            runningTime = addMinutesDateFns(earliestStart, v.durationMinutes);
            stops[i].departTime = format(runningTime, 'HH:mm');
          } else if (isAfter(runningTime, latestStart)) {
            stops[i].isLate = true;
            stops[i].lateMin = Math.ceil((runningTime.getTime() - latestStart.getTime()) / 60000);
            stops[i].actualStartTime = format(runningTime, 'HH:mm');
            runningTime = addMinutesDateFns(runningTime, v.durationMinutes);
            stops[i].departTime = format(runningTime, 'HH:mm');
          } else {
            stops[i].actualStartTime = format(runningTime, 'HH:mm');
            runningTime = addMinutesDateFns(runningTime, v.durationMinutes);
            stops[i].departTime = format(runningTime, 'HH:mm');
          }
        }
      } else if (stops[i].durationMin) {
        runningTime = addMinutesDateFns(runningTime, stops[i].durationMin || 0);
        stops[i].departTime = format(runningTime, 'HH:mm');
      }
    }

    // Stats
    const cleanTotalMinutes = stops.filter(s => s.type === 'clean').reduce((sum, s) => sum + (s.durationMin || 0), 0);
    const actualDriveMin = stops.slice(1).reduce((sum, s) => sum + (s.legDurationMin || 0), 0);
    const driverTotalMinutes = actualDriveMin + cleanTotalMinutes;

    // Team member hours — handle multiple pickup/dropoff segments per cleaner
    const allTeamMemberIds = new Set<string>();
    data.teamMembersWithAddr.forEach(tm => allTeamMemberIds.add(tm.id));

    const memberHours: TeamMemberHours[] = Array.from(allTeamMemberIds).map(id => {
      const tm = cleaners.find(c => c.id === id);
      if (!tm) return null;

      const isMainDriver = tm.id === data.driver.id;

      if (!isMainDriver) {
        // Find all pickup and dropoff events for this cleaner (including intermediate)
        const pickupEvents = stops.filter(s =>
          (s.type === 'pickup' || s.type === 'intermediate-pickup') && s.teamMemberId === id
        );
        const dropoffEvents = stops.filter(s =>
          (s.type === 'dropoff' || s.type === 'intermediate-dropoff') && s.teamMemberId === id
        );

        let totalPaidMinutes = 0;
        let totalCleanMinutes = 0;
        let totalTravelMinutes = 0;
        let totalWaitMinutes = 0;

        // Pair each pickup with the next dropoff
        for (let segIdx = 0; segIdx < pickupEvents.length; segIdx++) {
          const pickup = pickupEvents[segIdx];
          const dropoff = dropoffEvents[segIdx];
          if (!dropoff) continue; // No matching dropoff for this segment

          const pickupIdx = stops.indexOf(pickup);
          const dropoffIdx = stops.indexOf(dropoff);

          // Find cleans between pickup and dropoff that include this cleaner
          const candidateCleans = stops.slice(pickupIdx + 1, dropoffIdx).filter(s => s.type === 'clean');
          let relevantCleans: RouteStop[] = [];
          for (const clean of candidateCleans) {
            if (!clean.visitId) { relevantCleans.push(clean); continue; }
            const visit = data.driverVisits.find(v => v.id === clean.visitId);
            if (visit) {
              let assignedIds = visit.assignedCleanerIds || [];
              if (assignedIds.length === 0) {
                const team = teams.find(t => t.id === visit.assignedTeamId);
                if (team) assignedIds = team.cleanerIds;
              }
              if (assignedIds.includes(id)) relevantCleans.push(clean);
            }
          }

          if (relevantCleans.length === 0) continue;

          const firstClean = relevantCleans[0];
          const lastClean = relevantCleans[relevantCleans.length - 1];
          const firstCleanIdx = stops.indexOf(firstClean);
          const lastCleanIdx = stops.indexOf(lastClean);

          let travelMinutes = 0;
          for (let i = firstCleanIdx + 1; i <= lastCleanIdx; i++) {
            travelMinutes += stops[i].legDurationMin || 0;
          }

          const cleanMinutes = relevantCleans.reduce((sum, c) => sum + (c.durationMin || 0), 0);
          const cleanStart = parse(firstClean.arrivalTime, 'HH:mm', new Date());
          const cleanEnd = parse(lastClean.departTime || lastClean.arrivalTime, 'HH:mm', new Date());
          const segmentMinutes = Math.round((cleanEnd.getTime() - cleanStart.getTime()) / 60000);
          const waitMinutes = Math.max(0, segmentMinutes - cleanMinutes - travelMinutes);
          const paidMinutes = cleanMinutes + travelMinutes;

          totalPaidMinutes += paidMinutes;
          totalCleanMinutes += cleanMinutes;
          totalTravelMinutes += travelMinutes;
          totalWaitMinutes += waitMinutes;
        }

        if (totalPaidMinutes === 0) {
          return { name: tm.name, minutes: 0, hours: 0, isDriver: false, cleanMinutes: 0, travelMinutes: 0, waitMinutes: 0 };
        }

        return {
          name: tm.name,
          minutes: totalPaidMinutes,
          hours: Math.round((totalPaidMinutes / 60) * 10) / 10,
          isDriver: false,
          cleanMinutes: totalCleanMinutes,
          travelMinutes: totalTravelMinutes,
          waitMinutes: totalWaitMinutes
        };
      } else {
        // Main driver: door-to-door
        const cleanMinutes = stops.filter(s => s.type === 'clean').reduce((sum, c) => sum + (c.durationMin || 0), 0);
        const travelMinutes = Math.max(0, driverTotalMinutes - cleanMinutes);

        return {
          name: tm.name,
          minutes: driverTotalMinutes,
          hours: Math.round((driverTotalMinutes / 60) * 10) / 10,
          isDriver: true,
          cleanMinutes,
          travelMinutes,
          waitMinutes: 0
        };
      }
    }).filter(Boolean) as TeamMemberHours[];

    setTotalKm(Math.round(totalDist / 100) / 10);
    setDriverTotalMinutes(driverTotalMinutes);
    setCleanTotalMinutes(cleanTotalMinutes);
    setActualDriveMinutes(actualDriveMin);
    setTeamHours(memberHours);
    setRouteStops(stops);
    setLoading(false);
    directionsResultRef.current = routeResult;
  }, [cleaners, teams]);

  const renderMap = (stops: RouteStop[], routeResult: any) => {
    const included = stops;
    const latLngs = included.map(s => s.latLng).filter(Boolean);
    if (latLngs.length < 2 || !mapRef.current || !(window as any).google) return;

    const origin = latLngs[0];

    if (!isMapAlive()) {
      mapInstance.current = null;
      directionsRenderer.current = null;
    }

    if (!mapInstance.current) {
      mapInstance.current = new (window as any).google.maps.Map(mapRef.current, {
        zoom: 12,
        center: origin,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
    }

    if (routeResult && routeResult.routes?.[0]) {
      if (!directionsRenderer.current) {
        directionsRenderer.current = new (window as any).google.maps.DirectionsRenderer({
          map: mapInstance.current,
          suppressMarkers: true,
        });
      }
      directionsRenderer.current.setDirections(routeResult);
      mapInstance.current.fitBounds(routeResult.routes[0].bounds);
    } else {
      // No valid route result — clear old line and fit to markers only
      if (directionsRenderer.current) {
        directionsRenderer.current.setDirections({ routes: [] });
      }
      const bounds = new (window as any).google.maps.LatLngBounds();
      included.forEach(s => { if (s.latLng) bounds.extend(s.latLng); });
      if (!bounds.isEmpty()) {
        mapInstance.current.fitBounds(bounds);
      }
    }
    addMarkers(mapInstance.current, included);
  };

  const addMarkers = (map: any, stops: RouteStop[]) => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    infoWindowsRef.current.forEach((iw: any) => iw.close());
    infoWindowsRef.current = [];
    let cleanCount = 0;
    let pickupCount = 0;
    let dropoffCount = 0;
    let activeInfoWindow: any = null;

    stops.forEach((stop, i) => {
      if (!stop.latLng) return;

      let labelText = '';
      let color = '#64748b';
      let zIndex = 5;

      if (stop.type === 'depart') { labelText = 'S'; color = '#2563eb'; zIndex = 8; }
      else if (stop.type === 'pickup') { labelText = `P${++pickupCount}`; color = '#059669'; zIndex = 7; }
      else if (stop.type === 'intermediate-pickup') { labelText = `P${++pickupCount}`; color = '#10b981'; zIndex = 7; }
      else if (stop.type === 'clean') { labelText = `${++cleanCount}`; color = '#7c3aed'; zIndex = 10; }
      else if (stop.type === 'dropoff') { labelText = `D${++dropoffCount}`; color = '#d97706'; zIndex = 6; }
      else if (stop.type === 'intermediate-dropoff') { labelText = `D${++dropoffCount}`; color = '#f59e0b'; zIndex = 6; }
      else if (stop.type === 'home') { labelText = 'E'; color = '#64748b'; zIndex = 5; }

      const marker = new (window as any).google.maps.Marker({
        position: stop.latLng,
        map,
        label: { text: labelText, color: 'white', fontSize: '13px', fontWeight: 'bold' },
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
        <div style="font-family: system-ui, sans-serif; padding: 6px; min-width: 200px; line-height: 1.4;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 3px;">${stop.label}</div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 5px; word-wrap: break-word; max-width: 200px;">${stop.address}</div>
          ${stop.arrivalTime ? `<div style="font-size: 11px; color: #475569;"><strong>Arrive:</strong> ${stop.arrivalTime}</div>` : ''}
          ${stop.departTime ? `<div style="font-size: 11px; color: #475569;"><strong>Depart:</strong> ${stop.departTime}</div>` : ''}
          ${stop.durationMin ? `<div style="font-size: 11px; color: #475569;"><strong>Duration:</strong> ${stop.durationMin} min</div>` : ''}
          ${stop.waitMin ? `<div style="font-size: 11px; color: #b45309; font-weight: 600; margin-top: 3px;">Wait ${stop.waitMin} min</div>` : ''}
          ${stop.isLate ? `<div style="font-size: 11px; color: #dc2626; font-weight: 600; margin-top: 3px;">Late ${stop.lateMin} min</div>` : ''}
          ${(i > 0 && stop.legDistanceKm !== undefined) ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 4px;">${stop.legDistanceKm.toFixed(1)} km • ${Math.round(stop.legDurationMin || 0)} min drive</div>` : ''}
        </div>
      `;

      const infoWindow = new (window as any).google.maps.InfoWindow({ content: infoContent, maxWidth: 240 });
      marker.addListener('click', () => {
        if (activeInfoWindow) activeInfoWindow.close();
        infoWindow.open(map, marker);
        activeInfoWindow = infoWindow;
      });

      markersRef.current.push(marker);
      infoWindowsRef.current.push(infoWindow);
    });
  };

  const goPrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatLocalDate(d));
  };

  const goNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(formatLocalDate(d));
  };


  // Find this cleaner's relevant stats from the full route
  const myPickupStop = hasDriverPickup
    ? routeStops.find(s => s.type === 'pickup' && s.teamMemberId === selectedDriver?.id)
    : null;
  const myDropoffStop = hasDriverPickup
    ? routeStops.find(s => s.type === 'dropoff' && s.teamMemberId === selectedDriver?.id)
    : null;

  const myTeamHours = teamHours.find(t => t.name === selectedDriver?.name || 'Driver');
  const myPaidHours = myTeamHours?.hours ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="bg-hhce-dark border-b border-slate-800 sticky top-0 z-30 shadow-lg">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center text-white shadow-md">
              <User size={18} />
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-none">{selectedDriver?.name || 'Driver'}</h1>
              <p className="text-[9px] text-green-400 font-bold uppercase tracking-wider">
                {selectedDriver?.isDriver ? 'Driver' : 'Cleaner'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700 transition-colors active:scale-95"
          >
            <X size={14} /> Close
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-4 space-y-4">
        {/* Date Navigator */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm flex items-center gap-2">
          <button onClick={goPrevDay} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors active:scale-95">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{dayName(selectedDate)}</p>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="w-full text-center text-sm font-bold text-slate-800 bg-transparent focus:outline-none"
            />
          </div>
          <button onClick={goNextDay} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors active:scale-95">
            <ChevronRight size={20} />
          </button>
        </div>

        {loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Calculating route...</p>
          </div>
        )}

        {apiError && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-bold flex items-center gap-2">
            <AlertTriangle size={14} /> {apiError}
          </div>
        )}

        {myVisits.length === 0 && !loading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
            <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-bold text-sm">No cleans scheduled.</p>
            <p className="text-slate-400 text-xs mt-1">Enjoy your day off!</p>
          </div>
        )}

        {myVisits.length > 0 && !loading && (
          <>
            {/* Summary Cards — same as RoutePlanner */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Clock size={16} className="text-blue-600" /> Day Summary
              </h2>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block mb-1">First Clean</span>
                  <span className="text-slate-800 font-black text-xl">
                    {routeStops.find(s => s.type === 'clean')?.actualStartTime || routeStops.find(s => s.type === 'clean')?.arrivalTime || myVisits[0]?.startTime}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block mb-1">Last Clean Ends</span>
                  <span className="text-slate-800 font-black text-xl">
                    {[...routeStops].reverse().find(s => s.type === 'clean')?.departTime || myVisits[myVisits.length - 1]?.startTime}
                  </span>
                </div>
              </div>

              {/* Driver / Pickup info */}
              {selectedDriver?.isDriver && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
                  <p className="text-blue-800 text-xs font-bold flex items-center gap-2">
                    <Car size={14} /> You are driving today
                  </p>
                  {teamHours.length > 0 && (
                    <p className="text-slate-600 text-xs">
                      With: <span className="font-bold">{teamHours.map(t => t.name).join(', ')}</span>
                    </p>
                  )}
                </div>
              )}

              {!selectedDriver?.isDriver && hasDriverPickup && myDriver && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-blue-800 font-bold text-xs">
                    <Car size={14} /> Driver Pickup — {myDriver.name}
                  </div>
                  {myPickupStop && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Pickup time:</span>
                      <span className="font-bold text-slate-800">{myPickupStop.arrivalTime}</span>
                    </div>
                  )}
                  {myDropoffStop && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-600">Dropoff time:</span>
                      <span className="font-bold text-slate-800">{myDropoffStop.arrivalTime}</span>
                    </div>
                  )}
                </div>
              )}

              {!selectedDriver?.isDriver && !hasDriverPickup && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-amber-800 text-xs font-bold flex items-center gap-2">
                    <User size={14} /> Solo Assignment — No driver pickup today
                  </p>
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-green-800 text-xs font-bold uppercase tracking-wider">
                    {selectedDriver?.isDriver ? 'Driver Hours' : 'Paid Hours'}
                  </span>
                  <span className="text-green-700 font-black text-2xl">
                    {formatHrsMins(selectedDriver?.isDriver ? driverTotalMinutes : myPaidHours * 60)}
                  </span>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-purple-800 text-xs font-bold uppercase tracking-wider">Clean Hours</span>
                  <span className="text-purple-700 font-black text-2xl">{formatHrsMins(cleanTotalMinutes)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-blue-800 text-xs font-bold uppercase tracking-wider">Total Distance</span>
                  <span className="text-blue-700 font-black text-xl">{totalKm.toFixed(1)} <span className="text-sm">km</span></span>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-amber-800 text-xs font-bold uppercase tracking-wider">Drive Time</span>
                  <span className="text-amber-700 font-black text-xl">{formatHrsMins(actualDriveMinutes)}</span>
                </div>
              </div>

              {routeUrl && (
                <a
                  href={routeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors active:scale-95"
                >
                  <Navigation size={14} /> Open in Google Maps
                </a>
              )}
            </div>

            {/* Route Timeline — identical to RoutePlanner read-only */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MapPin size={16} className="text-green-600" /> 
                {selectedDriver?.isDriver ? 'Your Route' : myDriver ? `${myDriver.name}'s Route` : 'Your Route'}
                ({routeStops.filter(s => s.type === 'clean').length} {routeStops.filter(s => s.type === 'clean').length === 1 ? 'clean' : 'cleans'})
              </h2>

              <div className="relative pl-6 space-y-4">
                <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-slate-200" />

                {routeStops.map((stop, idx) => {
                  const isMyStop = stop.type === 'clean' && myVisits.some(v => v.id === stop.visitId);
                  const isMyPickup = (stop.type === 'pickup' || stop.type === 'intermediate-pickup') && stop.teamMemberId === selectedDriver?.id;
                  const isMyDropoff = (stop.type === 'dropoff' || stop.type === 'intermediate-dropoff') && stop.teamMemberId === selectedDriver?.id;
                  const isRelevant = isMyStop || isMyPickup || isMyDropoff || selectedDriver?.isDriver || stop.type === 'depart' || stop.type === 'home' || stop.type === 'intermediate-pickup' || stop.type === 'intermediate-dropoff';
                  const isFirst = idx === 0;
                  const isLast = idx === routeStops.length - 1;
                  const isClean = stop.type === 'clean';

                  const markerColor = isFirst ? 'bg-blue-600 border-blue-600 text-white' : 
                    isLast ? 'bg-slate-500 border-slate-500 text-white' :
                    stop.type === 'pickup' ? 'bg-green-600 border-green-600 text-white' :
                    stop.type === 'intermediate-pickup' ? 'bg-emerald-500 border-emerald-500 text-white' :
                    stop.type === 'dropoff' ? 'bg-amber-600 border-amber-600 text-white' :
                    stop.type === 'intermediate-dropoff' ? 'bg-orange-500 border-orange-500 text-white' :
                    stop.type === 'clean' ? 'bg-purple-600 border-purple-600 text-white' :
                    'bg-white border-slate-300 text-slate-500';

                  const markerLabel = isFirst ? 'S' : isLast ? 'E' : 
                    stop.type === 'pickup' || stop.type === 'intermediate-pickup' ? 'P' : 
                    stop.type === 'dropoff' || stop.type === 'intermediate-dropoff' ? 'D' : 
                    stop.type === 'clean' ? 'C' : '';

                  return (
                    <div key={idx}>
                      <div className={`relative ${!selectedDriver?.isDriver && !isRelevant ? 'opacity-40' : ''}`}>
                        <div className={`absolute -left-[25px] top-2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-black shadow-sm ${markerColor}`}>
                          {markerLabel}
                        </div>

                        <div 
                          onClick={() => {
                            if (stop.visitId) {
                              const v = myVisits.find(x => x.id === stop.visitId);
                              if (v) setDetailVisit(v);
                            }
                          }}
                          className={`bg-white rounded-2xl border border-slate-200 p-3 shadow-sm transition-all ${stop.visitId ? 'cursor-pointer hover:shadow-md active:scale-[0.98]' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                                  stop.isLate ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                                }`}>
                                  <Clock size={10} />
                                  {stop.arrivalTime || '----'}
                                  {stop.departTime && stop.departTime !== stop.arrivalTime ? ` – ${stop.departTime}` : ''}
                                </span>
                                {stop.waitMin && stop.waitMin > 0 && (
                                  <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                    WAIT {stop.waitMin}m
                                  </span>
                                )}
                                {stop.isLate && (
                                  <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded">
                                    LATE {stop.lateMin}m
                                  </span>
                                )}
                                {(stop.type === 'intermediate-pickup' || stop.type === 'intermediate-dropoff') && (
                                  <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                    MANUAL
                                  </span>
                                )}
                              </div>
                              <h3 className={`font-bold text-sm mt-0.5 truncate ${selectedDriver?.isDriver || isMyStop || isMyPickup || isMyDropoff ? 'text-slate-800' : 'text-slate-500'}`}>
                                {stop.label}
                              </h3>
                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                                <MapPin size={10} className="shrink-0" /> {stop.address}
                              </p>
                            </div>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-lg font-bold shrink-0">
                              {stop.durationMin || 0}m
                            </span>
                          </div>

                          {idx > 0 && stop.legDistanceKm !== undefined && (
                            <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1">
                              <Navigation size={9} /> {stop.legDistanceKm.toFixed(1)} km • {Math.round(stop.legDurationMin || 0)} min drive
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Add Stop button after each clean stop (for admin/driver view) */}
                      {isClean && selectedDriver?.isDriver && (
                        <div className="pl-6 py-2">
                          <button
                            onClick={() => {
                              setShowAddStop(true);
                              setStopAfterVisitId(stop.visitId || '');
                              const cleaner = cleaners.find(c => c.id === stop.teamMemberId);
                              if (cleaner) setStopAddress(cleaner.address || '');
                            }}
                            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <Plus size={12} /> Add stop after this clean
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Manual Stops Management */}
            {selectedDriver?.isDriver && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Navigation size={16} className="text-orange-600" /> Route Stops
                </h2>

                {/* Existing manual stops */}
                {getManualStopsForRoute().length > 0 && (
                  <div className="bg-orange-50 rounded-2xl border border-orange-200 p-3 space-y-2">
                    <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Custom Stops</p>
                    {getManualStopsForRoute().map((stop, idx) => {
                      const cleaner = cleaners.find(c => c.id === stop.teamMemberId);
                      const afterVisit = driverVisits.find(v => v.id === stop.afterVisitId);
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white rounded-xl border border-orange-100 p-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700">
                              {stop.type === 'intermediate-pickup' ? 'Pick up' : 'Drop off'} {cleaner?.name}
                            </p>
                            <p className="text-[10px] text-slate-500">{stop.address}</p>
                            {afterVisit && (
                              <p className="text-[10px] text-slate-400">After: {afterVisit.clientName}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeManualStop(idx)}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add Stop Form */}
                {showAddStop && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                    <p className="text-xs font-bold text-slate-700">Add Route Stop</p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Type</label>
                        <select
                          value={stopType}
                          onChange={e => setStopType(e.target.value as 'intermediate-pickup' | 'intermediate-dropoff')}
                          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="intermediate-pickup">Pick up cleaner</option>
                          <option value="intermediate-dropoff">Drop off cleaner</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cleaner</label>
                        <select
                          value={stopCleanerId}
                          onChange={e => {
                            setStopCleanerId(e.target.value);
                            const c = cleaners.find(x => x.id === e.target.value);
                            if (c?.address) setStopAddress(c.address);
                          }}
                          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select cleaner...</option>
                          {cleaners.filter(c => c.active && c.id !== selectedDriver.id).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Address</label>
                        <input
                          type="text"
                          value={stopAddress}
                          onChange={e => setStopAddress(e.target.value)}
                          placeholder="Enter address..."
                          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">After Visit</label>
                        <select
                          value={stopAfterVisitId}
                          onChange={e => setStopAfterVisitId(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Before first clean</option>
                          {driverVisits.map(v => (
                            <option key={v.id} value={v.id}>After {v.clientName} ({v.startTime})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addManualStop}
                        disabled={!stopCleanerId || !stopAddress}
                        className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add Stop
                      </button>
                      <button
                        onClick={resetStopForm}
                        className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!showAddStop && (
                  <button
                    onClick={() => setShowAddStop(true)}
                    className="flex items-center gap-2 w-full py-3 bg-orange-50 text-orange-700 rounded-xl text-xs font-bold hover:bg-orange-100 transition-colors border border-orange-200"
                  >
                    <Plus size={14} className="ml-3" /> Add Custom Route Stop
                  </button>
                )}
              </div>
            )}

            {/* Team hours breakdown */}
            {teamHours.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Users size={10} /> Team Hours
                </p>
                <div className="space-y-2">
                  {teamHours.map(tm => (
                    <div key={tm.name} className={`flex items-center justify-between p-3 rounded-xl border ${tm.name === selectedDriver?.name ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tm.isDriver ? '#2563eb' : '#059669' }} />
                        <div>
                          <span className="text-sm font-bold text-slate-700">{tm.name}</span>
                          {tm.name === selectedDriver?.name && <span className="text-[10px] text-green-600 font-bold ml-1.5">(You)</span>}
                          <span className="text-[10px] text-slate-400 ml-1.5 font-medium">
                            {tm.isDriver ? 'Driver' : 'Cleaner'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-slate-800">{formatHrsMins(tm.hours * 60)}</span>
                        <span className="text-xs font-bold text-slate-500 ml-1">hrs</span>
                        <p className="text-[10px] text-slate-400">{tm.minutes} min</p>
                        {!tm.isDriver && tm.cleanMinutes !== undefined && (
                          <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                            <span className="text-green-600 font-bold">{formatHrsMins(tm.cleanMinutes || 0)}</span> clean
                            <span className="mx-1">·</span>
                            <span className="text-amber-600 font-bold">{formatHrsMins(tm.travelMinutes || 0)}</span> travel

                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Google Map */}
            {routeStops.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Navigation size={10} /> Route Map
                </p>
                <div ref={mapRef} className="w-full h-64 rounded-xl bg-slate-100" />
                {!API_KEY && (
                  <p className="text-xs text-slate-400 text-center mt-2">Google Maps API key not configured.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Detail Modal */}
      {detailVisit && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailVisit(null)}
        >
          <div 
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-2xl animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">{detailVisit.clientName}</h3>
              <button onClick={() => setDetailVisit(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">✕</button>
            </div>
            <DetailContent visit={detailVisit} clients={clients} cleaners={cleaners} teams={teams} onClose={() => setDetailVisit(null)} />
          </div>
        </div>
      )}
    </div>
  );
};

function DetailContent({ visit, clients, cleaners, teams, onClose }: {
  visit: Visit;
  clients: import('../types').Client[];
  cleaners: import('../types').Cleaner[];
  teams: import('../types').Team[];
  onClose: () => void;
}) {
  const client = clients.find(c => c.id === visit.clientId);
  const endTime = format(addMinutesDateFns(parse(visit.startTime, 'HH:mm', new Date()), visit.durationMinutes), 'HH:mm');
  let assignedIds = visit.assignedCleanerIds || [];
  if (assignedIds.length === 0) {
    const team = teams.find(t => t.id === visit.assignedTeamId);
    if (team) assignedIds = team.cleanerIds;
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
        <Clock size={18} className="text-blue-500 shrink-0" />
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Scheduled Time</p>
          <p className="font-black text-slate-800">{visit.startTime} – {endTime} <span className="text-slate-400 font-normal">({visit.durationMinutes} min)</span></p>
        </div>
      </div>
      <div className="flex items-start gap-3 text-slate-600">
        <MapPin size={18} className="text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Address</p>
          <p>{visit.clientAddress || client?.address || 'No address on file'}</p>
        </div>
      </div>
      {client?.phone && (
        <div className="flex items-center gap-3 text-slate-600">
          <Phone size={18} className="text-green-500 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Phone</p>
            <p className="font-medium">{client.phone}</p>
          </div>
        </div>
      )}
      {client?.zone && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">Zone: {client.zone}</span>}
      {client?.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
          <p className="font-bold flex items-center gap-1"><FileText size={12} /> House Notes</p>
          <p>{client.notes}</p>
        </div>
      )}
      {visit.teamName && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
          <p className="font-bold flex items-center gap-1"><Users size={12} /> Team: {visit.teamName}</p>
          <p className="text-slate-600">
            Assigned: {assignedIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
          </p>
        </div>
      )}
      <button onClick={onClose} className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 active:scale-[0.98]">
        Close
      </button>
    </div>
  );
}