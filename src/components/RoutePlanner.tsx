declare global {
  interface Window {
    google: any;
  }
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { loadGoogleMaps, geocodeAddress, calculateRoute } from '../utils/maps';
import { format, parse, addMinutes, isAfter, isBefore } from 'date-fns';
import { Car, X, AlertTriangle, Navigation, Copy, Check, Plus, Bus, CircleDot, RotateCcw, Save } from 'lucide-react';
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
  targetTime?: string;
}

interface TeamMemberHours {
  name: string;
  minutes: number;
  hours: number;
  isDriver: boolean;
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

interface RoutePlannerProps {
  onClose: () => void;
  initialDriver?: Cleaner;
  initialReliefDate?: string;
}

export const RoutePlanner: React.FC<RoutePlannerProps> = ({ onClose, initialDriver, initialReliefDate }) => {
  const { visits, cleaners, clients, teams, selectedDate } = useAppContext();
  const [selectedDriver, setSelectedDriver] = useState<Cleaner | null>(initialDriver || null);
  const [reliefMode, setReliefMode] = useState(!!initialReliefDate);
  const [reliefName, setReliefName] = useState('Relief Driver');
  const [route, setRoute] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAddStop, setShowAddStop] = useState(false);
  const [newStopAddress, setNewStopAddress] = useState('');
  const [newStopLabel, setNewStopLabel] = useState('');
  const [newStopDuration, setNewStopDuration] = useState(30);
  const [teamHours, setTeamHours] = useState<TeamMemberHours[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [editedRoute, setEditedRoute] = useState<RouteStop[] | null>(null);
  const [reliefSaved, setReliefSaved] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  // Load Google Maps
  useEffect(() => {
    if (!API_KEY) {
      setError('Google Maps API key not configured. Add VITE_GOOGLE_MAPS_API_KEY to your .env file.');
      return;
    }
    loadGoogleMaps(API_KEY)
      .then(() => setMapsReady(true))
      .catch((err: any) => setError('Failed to load Google Maps: ' + (err?.message || err)));
  }, []);

  // If initialReliefDate provided, load saved relief route
  useEffect(() => {
    if (initialReliefDate) {
      const saved = getSavedRelief(initialReliefDate);
      if (saved) {
        setRoute(saved);
        setEditedRoute(saved);
        setReliefSaved(true);
        const name = saved[0]?.label?.replace('Leave Home — ', '') || 'Relief Driver';
        setReliefName(name);
      }
    }
  }, [initialReliefDate]);

  // If initialDriver provided, auto-calculate their route
  useEffect(() => {
    if (initialDriver && mapsReady) {
      handleCalculateRoute(initialDriver);
    }
  }, [initialDriver, mapsReady]);

  const dayVisits = useMemo(() => {
    return visits
      .filter(v => v.date === dateStr && !v.cancelled)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [visits, dateStr]);

  const drivers = useMemo(() => {
    return cleaners.filter(c => c.isDriver && c.active);
  }, [cleaners]);

  const getDriverVisits = useCallback((driver: Cleaner) => {
    return dayVisits.filter(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      return ids.includes(driver.id);
    });
  }, [dayVisits, teams]);

  const geocode = useCallback(async (address: string) => {
    if (!address) return null;
    try {
      return await geocodeAddress(address);
    } catch {
      return null;
    }
  }, []);

  const handleCalculateRoute = async (driver: Cleaner | null = selectedDriver) => {
    if (!driver && !reliefMode) {
      setError('Please select a driver first');
      return;
    }
    setLoading(true);
    setError(null);
    setRoute([]);
    setTeamHours([]);

    try {
      const isRelief = reliefMode || !!initialReliefDate;
      const driverVisits = driver ? getDriverVisits(driver) : [];

      // Geocode driver home
      let driverHome = null;
      if (driver?.address) {
        driverHome = await geocode(driver.address);
      }

      // Geocode client addresses
      const clientLocs: Record<string, any> = {};
      for (const visit of driverVisits) {
        const client = clients.find(c => c.id === visit.clientId);
        if (client?.address && !clientLocs[client.id]) {
          clientLocs[client.id] = await geocode(client.address);
        }
      }

      // Geocode team member addresses
      const teamMembersWithAddr: Cleaner[] = [];
      const teamLocs: Record<string, any> = {};
      for (const visit of driverVisits) {
        let ids = visit.assignedCleanerIds || [];
        if (ids.length === 0) {
          const team = teams.find(t => t.id === visit.assignedTeamId);
          if (team) ids = team.cleanerIds;
        }
        for (const cid of ids) {
          const cleaner = cleaners.find(c => c.id === cid);
          if (cleaner && cleaner.id !== driver?.id && cleaner.address && !teamLocs[cleaner.id]) {
            teamLocs[cleaner.id] = await geocode(cleaner.address);
            if (teamLocs[cleaner.id]) teamMembersWithAddr.push(cleaner);
          }
        }
      }

      // Build stops
      const stops: RouteStop[] = [];
      let currentTime = parse(driverVisits[0]?.startTime || '08:00', 'HH:mm', selectedDate);

      // Depart from home
      if (driverHome) {
        stops.push({
          type: 'depart',
          label: `Leave Home — ${driver?.name || reliefName}`,
          address: driver?.address || 'Home',
          arrivalTime: format(currentTime, 'h:mm a'),
          latLng: driverHome,
          included: true,
        });
      }

      // Pickup team members
      for (const tm of teamMembersWithAddr) {
        if (teamLocs[tm.id] && driverHome) {
          const leg = await calculateRoute(driverHome, teamLocs[tm.id]);
          if (leg) {
            const travelMin = Math.ceil((leg.duration.value || 0) / 60);
            currentTime = addMinutes(currentTime, travelMin);
            stops.push({
              type: 'pickup',
              label: `Pickup ${tm.name}`,
              address: tm.address || '',
              arrivalTime: format(currentTime, 'h:mm a'),
              legDistanceKm: Math.round((leg.distance.value || 0) / 100) / 10,
              legDurationMin: travelMin,
              latLng: teamLocs[tm.id],
              teamMemberId: tm.id,
              included: true,
            });
          }
        }
      }

      // Visit stops
      for (let i = 0; i < driverVisits.length; i++) {
        const visit = driverVisits[i];
        const client = clients.find(c => c.id === visit.clientId);
        const clientLoc = client ? clientLocs[client.id] : null;
        const prevLoc = i === 0
          ? (teamMembersWithAddr.length > 0 ? teamLocs[teamMembersWithAddr[teamMembersWithAddr.length - 1].id] : driverHome)
          : clientLocs[clients.find(c => c.id === driverVisits[i - 1].clientId)?.id || ''];

        if (clientLoc && prevLoc) {
          const leg = await calculateRoute(prevLoc, clientLoc);
          if (leg) {
            const travelMin = Math.ceil((leg.duration.value || 0) / 60);
            currentTime = addMinutes(currentTime, travelMin);
          }
        }

        const targetTime = parse(visit.startTime, 'HH:mm', selectedDate);
        const isLate = isAfter(currentTime, addMinutes(targetTime, 5));
        const lateMin = isLate ? Math.ceil((currentTime.getTime() - targetTime.getTime()) / 60000) : 0;
        const waitMin = isBefore(currentTime, targetTime) ? Math.ceil((targetTime.getTime() - currentTime.getTime()) / 60000) : 0;
        if (waitMin > 0) currentTime = targetTime;

        const duration = visit.durationMinutes || 60;
        const departTime = addMinutes(currentTime, duration);

        let legDistanceKm: number | undefined;
        let legDurationMin: number | undefined;
        if (clientLoc && prevLoc) {
          const leg = await calculateRoute(prevLoc, clientLoc);
          if (leg) {
            legDistanceKm = Math.round((leg.distance.value || 0) / 100) / 10;
            legDurationMin = Math.ceil((leg.duration.value || 0) / 60);
          }
        }

        stops.push({
          type: 'clean',
          label: `${client?.name || visit.clientName} — ${visit.jobType || 'Clean'}`,
          address: client?.address || visit.clientAddress || '',
          arrivalTime: format(currentTime, 'h:mm a'),
          departTime: format(departTime, 'h:mm a'),
          durationMin: duration,
          legDistanceKm,
          legDurationMin,
          isLate,
          lateMin: lateMin > 0 ? lateMin : undefined,
          waitMin: waitMin > 0 ? waitMin : undefined,
          actualStartTime: format(currentTime, 'h:mm a'),
          targetTime: visit.startTime,
          visitId: visit.id,
          latLng: clientLoc,
          included: true,
        });

        currentTime = departTime;
      }

      // Return home
      const lastVisit = driverVisits[driverVisits.length - 1];
      const lastClient = lastVisit ? clients.find(c => c.id === lastVisit.clientId) : null;
      const lastLoc = lastClient ? clientLocs[lastClient.id] : null;
      if (lastLoc && driverHome) {
        const leg = await calculateRoute(lastLoc, driverHome);
        if (leg) {
          const travelMin = Math.ceil((leg.duration.value || 0) / 60);
          currentTime = addMinutes(currentTime, travelMin);
          stops.push({
            type: 'home',
            label: 'Return Home',
            address: driver?.address || 'Home',
            arrivalTime: format(currentTime, 'h:mm a'),
            legDistanceKm: Math.round((leg.distance.value || 0) / 100) / 10,
            legDurationMin: travelMin,
            latLng: driverHome,
            included: true,
          });
        }
      }

      // Calculate team hours
      const hoursMap: Record<string, TeamMemberHours> = {};
      for (const visit of driverVisits) {
        let ids = visit.assignedCleanerIds || [];
        if (ids.length === 0) {
          const team = teams.find(t => t.id === visit.assignedTeamId);
          if (team) ids = team.cleanerIds;
        }
        for (const cid of ids) {
          const cleaner = cleaners.find(c => c.id === cid);
          if (!cleaner) continue;
          if (!hoursMap[cid]) {
            hoursMap[cid] = { name: cleaner.name, minutes: 0, hours: 0, isDriver: cleaner.isDriver };
          }
          hoursMap[cid].minutes += visit.durationMinutes || 60;
        }
      }
      for (const key of Object.keys(hoursMap)) {
        hoursMap[key].hours = Math.round((hoursMap[key].minutes / 60) * 10) / 10;
      }
      setTeamHours(Object.values(hoursMap));

      setRoute(stops);
      setEditedRoute(stops);
      if (isRelief) {
        saveRelief(dateStr, stops);
        setReliefSaved(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to calculate route');
    } finally {
      setLoading(false);
    }
  };

  // Initialize map when route is ready
  useEffect(() => {
    if (!mapsReady || !window.google || !mapRef.current || route.length === 0) return;

    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 12,
      center: route[0]?.latLng || { lat: 43.45, lng: -80.49 },
      mapTypeControl: false,
      streetViewControl: false,
    });
    mapInstanceRef.current = map;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    // Add markers
    route.forEach((stop, idx) => {
      if (!stop.latLng) return;
      const marker = new window.google.maps.Marker({
        position: stop.latLng,
        map,
        label: { text: String(idx + 1), color: '#fff' },
        title: stop.label,
      });
      markersRef.current.push(marker);
    });

    // Draw route line
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
    }
    const directionsRenderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#2563eb',
        strokeWeight: 4,
        strokeOpacity: 0.8,
      },
    });
    directionsRendererRef.current = directionsRenderer;

    if (route.length > 1) {
      const directionsService = new window.google.maps.DirectionsService();
      const waypoints = route.slice(1, -1).filter(s => s.latLng).map(s => ({
        location: s.latLng,
        stopover: true,
      }));
      directionsService.route(
        {
          origin: route[0].latLng,
          destination: route[route.length - 1].latLng || route[0].latLng,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false,
        },
        (result: any, status: any) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
          }
        }
      );
    }
  }, [route, mapsReady]);

  const handleCopyRoute = () => {
    const lines = route.map((s, i) => `${i + 1}. ${s.type.toUpperCase()} — ${s.label} @ ${s.arrivalTime}${s.departTime ? ' – ' + s.departTime : ''} | ${s.address}`);
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAddCustomStop = () => {
    if (!newStopAddress || !newStopLabel) return;
    const newStop: RouteStop = {
      type: 'other',
      label: newStopLabel,
      address: newStopAddress,
      arrivalTime: '',
      durationMin: newStopDuration,
      isCustom: true,
      included: true,
    };
    const updated = [...(editedRoute || route), newStop];
    setEditedRoute(updated);
    setRoute(updated);
    setNewStopAddress('');
    setNewStopLabel('');
    setNewStopDuration(30);
    setShowAddStop(false);
    if (reliefMode) {
      saveRelief(dateStr, updated);
      setReliefSaved(true);
    }
  };

  const toggleStop = (idx: number) => {
    const updated = [...(editedRoute || route)];
    updated[idx] = { ...updated[idx], included: !updated[idx].included };
    setEditedRoute(updated);
    setRoute(updated);
    if (reliefMode) {
      saveRelief(dateStr, updated);
      setReliefSaved(true);
    }
  };

  const handleSaveRelief = () => {
    if (editedRoute) {
      saveRelief(dateStr, editedRoute);
      setReliefSaved(true);
    }
  };

  const handleClearRelief = () => {
    if (confirm('Delete saved relief route for this day?')) {
      clearRelief(dateStr);
      setRoute([]);
      setEditedRoute(null);
      setReliefSaved(false);
    }
  };

  const totalDistance = useMemo(() => {
    return route.filter(s => s.included !== false).reduce((sum, s) => sum + (s.legDistanceKm || 0), 0);
  }, [route]);

  const totalDriveTime = useMemo(() => {
    return route.filter(s => s.included !== false).reduce((sum, s) => sum + (s.legDurationMin || 0), 0);
  }, [route]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-2xl max-h-[95vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              {reliefMode ? <Bus size={20} className="text-blue-600" /> : <Car size={20} className="text-blue-600" />}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800">
                {reliefMode ? reliefName : selectedDriver?.name || 'Route Planner'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {format(selectedDate, 'EEEE, MMM d')} • {route.filter(s => s.type === 'clean' && s.included !== false).length} stops
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 active:scale-95 transition-all">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-medium">{error}</p>
            </div>
          )}

          {/* Driver selector (only if no initial driver/relief) */}
          {!initialDriver && !initialReliefDate && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => { setReliefMode(false); setRoute([]); setEditedRoute(null); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${!reliefMode ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  Regular Driver
                </button>
                <button
                  onClick={() => { setReliefMode(true); setRoute([]); setEditedRoute(null); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${reliefMode ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  Relief Route
                </button>
              </div>

              {!reliefMode && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {drivers.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDriver(d)}
                      className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${selectedDriver?.id === d.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}

              {reliefMode && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                  <label className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Relief Driver Name</label>
                  <input
                    type="text"
                    value={reliefName}
                    onChange={e => setReliefName(e.target.value)}
                    placeholder="Enter relief driver name"
                    className="w-full px-3 py-2 rounded-lg border border-amber-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
              )}

              <button
                onClick={() => handleCalculateRoute()}
                disabled={loading || (!reliefMode && !selectedDriver)}
                className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {loading ? 'Calculating...' : 'Calculate Route'}
              </button>
            </div>
          )}

          {/* Map */}
          {route.length > 0 && (
            <div ref={mapRef} className="w-full h-64 rounded-xl border border-slate-200 bg-slate-100" />
          )}

          {/* Route stops */}
          {route.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Route Stops</p>
                <div className="flex gap-1">
                  <button
                    onClick={handleCopyRoute}
                    className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors active:scale-95"
                    title="Copy route to clipboard"
                  >
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                  {reliefMode && (
                    <>
                      <button
                        onClick={() => setShowAddStop(!showAddStop)}
                        className="p-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors active:scale-95"
                        title="Add custom stop"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        onClick={handleClearRelief}
                        className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors active:scale-95"
                        title="Clear relief route"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showAddStop && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <input
                    type="text"
                    value={newStopLabel}
                    onChange={e => setNewStopLabel(e.target.value)}
                    placeholder="Stop label (e.g. Supply Store)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <input
                    type="text"
                    value={newStopAddress}
                    onChange={e => setNewStopAddress(e.target.value)}
                    placeholder="Address"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-500">Duration (min):</label>
                    <input
                      type="number"
                      value={newStopDuration}
                      onChange={e => setNewStopDuration(Number(e.target.value))}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-sm font-medium"
                    />
                    <button
                      onClick={handleAddCustomStop}
                      className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                    >
                      Add Stop
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {route.map((stop, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${stop.included === false ? 'opacity-40 bg-slate-50 border-slate-200' : stop.isLate ? 'bg-red-50 border-red-200' : stop.type === 'clean' ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <button
                      onClick={() => toggleStop(idx)}
                      className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border transition-all ${stop.included !== false ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-300'}`}
                    >
                      {stop.included !== false ? idx + 1 : <CircleDot size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-xs font-bold ${stop.included === false ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {stop.label}
                        </p>
                        {stop.isLate && <span className="text-[9px] font-black text-red-600 bg-red-100 px-1.5 py-0.5 rounded">+{stop.lateMin}m LATE</span>}
                        {stop.waitMin && stop.waitMin > 0 && <span className="text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">wait {stop.waitMin}m</span>}
                        {stop.isCustom && <span className="text-[9px] font-bold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">CUSTOM</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{stop.address}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-700">{stop.arrivalTime}</span>
                        {stop.departTime && <span className="text-[10px] text-slate-400">→ {stop.departTime}</span>}
                        {stop.legDistanceKm !== undefined && (
                          <span className="text-[9px] text-slate-400">{stop.legDistanceKm}km drive</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Drive Distance</span>
                  <span className="font-bold text-slate-800">{totalDistance.toFixed(1)} km</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Drive Time</span>
                  <span className="font-bold text-slate-800">{Math.ceil(totalDriveTime)} min</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 font-medium">Clean Stops</span>
                  <span className="font-bold text-slate-800">{route.filter(s => s.type === 'clean' && s.included !== false).length}</span>
                </div>
              </div>

              {/* Team hours */}
              {teamHours.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Team Hours</p>
                  <div className="grid grid-cols-2 gap-2">
                    {teamHours.map(tm => (
                      <div key={tm.name} className={`bg-white rounded-xl border p-2.5 ${tm.isDriver ? 'border-blue-200 bg-blue-50' : 'border-slate-200'}`}>
                        <p className="text-xs font-bold text-slate-800">{tm.name}</p>
                        <p className="text-[10px] text-slate-500">{tm.hours} hrs • {tm.minutes} min</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reliefMode && (
                <button
                  onClick={handleSaveRelief}
                  disabled={reliefSaved}
                  className="w-full py-2.5 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-600 transition-colors disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Save size={14} /> {reliefSaved ? 'Route Saved' : 'Save Relief Route'}
                </button>
              )}
            </div>
          )}

          {route.length === 0 && !loading && !error && !initialDriver && !initialReliefDate && (
            <div className="text-center py-12">
              <Navigation size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Select a driver and calculate to see the route</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};