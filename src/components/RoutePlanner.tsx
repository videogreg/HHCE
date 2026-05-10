import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { loadGoogleMaps, geocodeAddress, calculateRoute } from '../utils/maps';
import { format, parse, addMinutes, isAfter } from 'date-fns';
import { Car, MapPin, Clock, Home, Users, X, AlertTriangle, Navigation } from 'lucide-react';
import type { Cleaner } from '../types';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

interface RouteStop {
  type: 'depart' | 'pickup' | 'clean' | 'dropoff' | 'home';
  label: string;
  address: string;
  arrivalTime: string;
  departTime?: string;
  durationMin?: number;
  legDistanceKm?: number;
  legDurationMin?: number;
  isLate?: boolean;
  lateMin?: number;
}

interface TeamMemberHours {
  name: string;
  minutes: number;
  hours: number;
}

export const RoutePlanner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { visits, cleaners, clients, teams, selectedDate } = useAppContext();
  const [selectedDriver, setSelectedDriver] = useState<Cleaner | null>(null);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [totalKm, setTotalKm] = useState(0);
  const [driverHours, setDriverHours] = useState(0);
  const [teamHours, setTeamHours] = useState<TeamMemberHours[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const dayVisits = useMemo(() =>
    visits.filter(v => v.date === dateStr && !v.cancelled).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  [visits, dateStr]);

  const drivers = useMemo(() => {
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

  useEffect(() => {
    if (API_KEY) loadGoogleMaps(API_KEY).catch(() => setApiError('Failed to load Google Maps'));
  }, []);

  const buildRoute = async (driver: Cleaner) => {
    if (!API_KEY) { setApiError('Add VITE_GOOGLE_MAPS_API_KEY to your .env file'); return; }
    setLoading(true);
    setSelectedDriver(driver);
    setApiError(null);

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

    const driverHome = driver.address ? await geocodeAddress(driver.address) : null;
    const clientLocs: Record<string, any> = {};
    const teamLocs: Record<string, any> = {};

    for (const v of driverVisits) {
      const client = clients.find(c => c.id === v.clientId);
      if (client?.address) {
        const loc = await geocodeAddress(client.address);
        if (loc) clientLocs[v.id] = loc;
      }
    }
    for (const tm of teamMembers) {
      if (tm.address) {
        const loc = await geocodeAddress(tm.address);
        if (loc) teamLocs[tm.id] = loc;
      }
    }

    const stops: RouteStop[] = [];

    stops.push({
      type: 'depart',
      label: `Leave Home — ${driver.name}`,
      address: driver.address || 'Unknown',
      arrivalTime: '',
      durationMin: 0,
    });

    for (const tm of teamMembers) {
      stops.push({
        type: 'pickup',
        label: `Pick up ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
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
      });
    }

    [...teamMembers].reverse().forEach(tm => {
      stops.push({
        type: 'dropoff',
        label: `Drop off ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
      });
    });

    stops.push({
      type: 'home',
      label: `Arrive Home — ${driver.name}`,
      address: driver.address || 'Unknown',
      arrivalTime: '',
      durationMin: 0,
    });

    const latLngs: any[] = [];
    stops.forEach((stop) => {
      let loc: any = null;
      if (stop.type === 'depart' || stop.type === 'home') loc = driverHome;
      if (stop.type === 'pickup' || stop.type === 'dropoff') {
        const tm = teamMembers.find(t => stop.label.includes(t.name));
        if (tm) loc = teamLocs[tm.id] || null;
      }
      if (stop.type === 'clean') {
        const v = driverVisits.find(dv => stop.label.includes(dv.clientName));
        if (v) loc = clientLocs[v.id] || null;
      }
      if (loc) latLngs.push(loc);
    });

    if (latLngs.length >= 2) {
      const origin = latLngs[0];
      const destination = latLngs[latLngs.length - 1];
      const waypoints = latLngs.slice(1, -1);

      const routeResult = await calculateRoute(origin, destination, waypoints);
      if (routeResult) {
        const legs = routeResult.routes[0].legs;
        let totalDist = 0;

        const firstCleanIdx = stops.findIndex(s => s.type === 'clean');
        const firstCleanVisit = firstCleanIdx >= 0 ? driverVisits.find(dv => stops[firstCleanIdx].label.includes(dv.clientName)) : null;

        let departTime: Date;
        if (firstCleanVisit) {
          departTime = parse(firstCleanVisit.startTime, 'HH:mm', new Date());
          for (let i = firstCleanIdx; i > 0; i--) {
            const leg = legs[i - 1];
            departTime = new Date(departTime.getTime() - (leg.duration.value * 1000));
            const prevStop = stops[i - 1];
            if (prevStop.durationMin) {
              departTime = addMinutes(departTime, -prevStop.durationMin);
            }
          }
        } else {
          departTime = parse('08:00', 'HH:mm', new Date());
        }

        let runningTime = new Date(departTime.getTime());
        stops[0].arrivalTime = format(runningTime, 'HH:mm');

        for (let i = 1; i < stops.length; i++) {
          const leg = legs[i - 1];
          totalDist += leg.distance.value;
          const driveMs = leg.duration.value * 1000;
          runningTime = new Date(runningTime.getTime() + driveMs);

          stops[i].legDistanceKm = leg.distance.value / 1000;
          stops[i].legDurationMin = Math.ceil(leg.duration.value / 60);
          stops[i].arrivalTime = format(runningTime, 'HH:mm');

          if (stops[i].type === 'clean') {
            const v = driverVisits.find(dv => stops[i].label.includes(dv.clientName));
            if (v) {
              const scheduledStart = parse(v.startTime, 'HH:mm', new Date());
              if (isAfter(runningTime, scheduledStart)) {
                stops[i].isLate = true;
                stops[i].lateMin = Math.ceil((runningTime.getTime() - scheduledStart.getTime()) / 60000);
              }
              runningTime = addMinutes(runningTime, v.durationMinutes);
              stops[i].departTime = format(runningTime, 'HH:mm');
            }
          } else if (stops[i].durationMin) {
            runningTime = addMinutes(runningTime, stops[i].durationMin || 0);
          }
        }

        const driverTotalMinutes = Math.round((runningTime.getTime() - departTime.getTime()) / 60000);
        const driverTotalHours = Math.round((driverTotalMinutes / 60) * 10) / 10;

        const memberHours: TeamMemberHours[] = teamMembers.map(tm => {
          const pickupIdx = stops.findIndex(s => s.type === 'pickup' && s.label.includes(tm.name));
          const dropoffIdx = stops.findIndex(s => s.type === 'dropoff' && s.label.includes(tm.name));
          let minutes = 0;
          if (pickupIdx >= 0 && dropoffIdx >= 0) {
            const pickupTime = parse(stops[pickupIdx].arrivalTime, 'HH:mm', new Date());
            const dropoffTime = parse(stops[dropoffIdx].arrivalTime, 'HH:mm', new Date());
            minutes = Math.round((dropoffTime.getTime() - pickupTime.getTime()) / 60000);
          }
          return { name: tm.name, minutes, hours: Math.round((minutes / 60) * 10) / 10 };
        });

        setTotalKm(Math.round(totalDist / 100) / 10);
        setDriverHours(driverTotalHours);
        setTeamHours(memberHours);

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
              suppressMarkers: false,
            });
          }
          directionsRenderer.current.setDirections(routeResult);
          mapInstance.current.fitBounds(routeResult.routes[0].bounds);
        }
      } else {
        setApiError('Could not calculate route. Check addresses.');
      }
    } else {
      setApiError('Not enough valid addresses to build a route.');
    }

    setRouteStops(stops);
    setLoading(false);
  };

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
          {drivers.map(d => (
            <button
              key={d.id}
              onClick={() => buildRoute(d)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                selectedDriver?.id === d.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-blue-300'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color || '#94a3b8' }} />
              {d.name}
            </button>
          ))}
          {drivers.length === 0 && (
            <span className="text-sm text-slate-400 font-medium">No drivers scheduled today.</span>
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

          {loading && (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">Calculating optimal route...</p>
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
              </div>

              <div className="space-y-0 mb-4">
                {routeStops.map((stop, i) => (
                  <div key={i} className="flex gap-3 relative">
                    {i < routeStops.length - 1 && (
                      <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200" />
                    )}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 ${
                      stop.type === 'depart' ? 'bg-blue-100 text-blue-600' :
                      stop.type === 'pickup' ? 'bg-green-100 text-green-600' :
                      stop.type === 'clean' ? 'bg-purple-100 text-purple-600' :
                      stop.type === 'dropoff' ? 'bg-amber-100 text-amber-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {stop.type === 'depart' && <Home size={18} />}
                      {stop.type === 'pickup' && <Users size={18} />}
                      {stop.type === 'clean' && <MapPin size={18} />}
                      {stop.type === 'dropoff' && <Users size={18} />}
                      {stop.type === 'home' && <Home size={18} />}
                    </div>

                    <div className="pb-5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{stop.label}</span>
                        <span className={`text-xs font-black px-1.5 py-0.5 rounded ${
                          stop.isLate ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          <Clock size={10} className="inline mr-0.5" />
                          {stop.arrivalTime}
                          {stop.departTime && ` – ${stop.departTime}`}
                        </span>
                        {stop.isLate && (
                          <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded">
                            {stop.lateMin} MIN LATE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{stop.address}</p>
                      {stop.type === 'clean' && stop.durationMin && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {stop.durationMin} min estimated clean
                        </p>
                      )}
                      {stop.type === 'pickup' && (
                        <p className="text-[10px] text-slate-400 mt-0.5">5 min pickup window</p>
                      )}
                      {i > 0 && stop.legDistanceKm !== undefined && (
                        <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Navigation size={9} /> {stop.legDistanceKm.toFixed(1)} km drive • {Math.round(stop.legDurationMin || 0)} min
                          {(stop.legDurationMin || 0) > 30 && (
                            <span className="text-amber-600 font-bold ml-1">(tight)</span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {teamHours.length > 0 && (
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                    <Users size={10} /> Team Member Hours (Door to Door)
                  </p>
                  <div className="space-y-2">
                    {teamHours.map(tm => (
                      <div key={tm.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-sm font-bold text-slate-700">{tm.name}</span>
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

          {!loading && !selectedDriver && !apiError && (
            <div className="p-8 text-center">
              <Car className="mx-auto mb-3 text-slate-300" size={40} />
              <p className="text-sm text-slate-500 font-medium">Select a driver to calculate their route.</p>
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