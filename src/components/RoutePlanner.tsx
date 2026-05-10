import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { loadGoogleMaps, geocodeAddress, calculateRoute } from '../utils/maps';
import { format, parse, addMinutes, isAfter, isBefore } from 'date-fns';
import { Car, MapPin, Clock, Home, Users, X, AlertTriangle, Navigation, Copy, Check } from 'lucide-react';
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
  waitMin?: number;
  actualStartTime?: string;
  visitId?: string;
  teamMemberId?: string;
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
  const [copied, setCopied] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const directionsRenderer = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

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

  const clearMarkers = () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
  };

  const addMarkers = (map: any, stops: RouteStop[], latLngs: any[]) => {
    clearMarkers();
    let cleanCount = 0;
    let pickupCount = 0;
    let dropoffCount = 0;

    latLngs.forEach((loc: any, i: number) => {
      const stop = stops[i];
      if (!loc || !stop) return;

      let labelText = '';
      let color = '#64748b';

      if (stop.type === 'depart') { labelText = 'S'; color = '#2563eb'; }
      else if (stop.type === 'pickup') { labelText = `P${++pickupCount}`; color = '#059669'; }
      else if (stop.type === 'clean') { labelText = `${++cleanCount}`; color = '#7c3aed'; }
      else if (stop.type === 'dropoff') { labelText = `D${++dropoffCount}`; color = '#d97706'; }
      else if (stop.type === 'home') { labelText = 'E'; color = '#64748b'; }

      const marker = new (window as any).google.maps.Marker({
        position: loc,
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
        zIndex: stop.type === 'clean' ? 10 : 5,
      });

      markersRef.current.push(marker);
    });
  };

  const copyPlan = () => {
    if (routeStops.length === 0 || !selectedDriver) return;

    const dateLabel = format(selectedDate, 'EEEE, MMM d, yyyy');
    const teamNames = teamHours.map(t => `${t.name} (${t.hours.toFixed(1)} hrs)`).join(', ');

    let text = `HHCE ROUTE PLAN\n`;
    text += `${dateLabel}\n`;
    text += `Driver: ${selectedDriver.name}\n`;
    if (teamHours.length > 0) text += `Team: ${teamHours.map(t => t.name).join(', ')}\n`;
    text += `═══════════════════════════════════════\n\n`;

    routeStops.forEach((stop, i) => {
      text += `${stop.arrivalTime || '----'} — ${stop.label}\n`;
      text += `${stop.address}\n`;

      if (stop.type === 'clean' && stop.visitId) {
        const v = dayVisits.find(dv => dv.id === stop.visitId);
        if (v) {
          const sched = parse(v.startTime, 'HH:mm', new Date());
          const earliest = format(addMinutes(sched, -15), 'HH:mm');
          const latest = format(addMinutes(sched, 15), 'HH:mm');
          text += `Scheduled: ${v.startTime} | Window: ${earliest}–${latest}\n`;
          if (stop.waitMin && stop.waitMin > 0) {
            text += `WAIT: ${stop.waitMin} min (arrived early, waiting in car)\n`;
          }
          if (stop.isLate && stop.lateMin) {
            text += `LATE: ${stop.lateMin} min past window\n`;
          }
          text += `Clean: ${stop.actualStartTime || stop.arrivalTime} – ${stop.departTime || 'N/A'} (${stop.durationMin} min)\n`;
        }
      } else if (stop.type === 'pickup') {
        text += `Pickup window: 5 min\n`;
      }

      if (i > 0 && stop.legDistanceKm !== undefined) {
        text += `Drive: ${stop.legDistanceKm.toFixed(1)} km (${Math.round(stop.legDurationMin || 0)} min)\n`;
      }
      text += `\n`;
    });

    text += `═══════════════════════════════════════\n`;
    text += `TOTAL DISTANCE: ${totalKm.toFixed(1)} km\n`;
    text += `DRIVER HOURS: ${driverHours.toFixed(1)} hrs (door to door)\n`;
    if (teamHours.length > 0) {
      text += `TEAM HOURS:\n`;
      teamHours.forEach(tm => {
        text += `  ${tm.name}: ${tm.hours.toFixed(1)} hrs (${tm.minutes} min)\n`;
      });
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
    });

    for (const tm of teamMembersWithAddr) {
      stops.push({
        type: 'pickup',
        label: `Pick up ${tm.name}`,
        address: tm.address || 'Unknown',
        arrivalTime: '',
        durationMin: 5,
        teamMemberId: tm.id,
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
      else if (stop.type === 'pickup' || stop.type === 'dropoff') {
        if (stop.teamMemberId) loc = teamLocs[stop.teamMemberId] || null;
      }
      else if (stop.type === 'clean') {
        if (stop.visitId) loc = clientLocs[stop.visitId] || null;
      }
      latLngs.push(loc);
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
        const firstCleanVisit = firstCleanIdx >= 0 ? driverVisits.find(dv => dv.id === stops[firstCleanIdx].visitId) : null;

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
            const v = driverVisits.find(dv => dv.id === stops[i].visitId);
            if (v) {
              const scheduledStart = parse(v.startTime, 'HH:mm', new Date());
              const earliestStart = addMinutes(scheduledStart, -15);
              const latestStart = addMinutes(scheduledStart, 15);

              if (isBefore(runningTime, earliestStart)) {
                stops[i].waitMin = Math.ceil((earliestStart.getTime() - runningTime.getTime()) / 60000);
                stops[i].actualStartTime = format(earliestStart, 'HH:mm');
                runningTime = addMinutes(earliestStart, v.durationMinutes);
                stops[i].departTime = format(runningTime, 'HH:mm');
              } else if (isAfter(runningTime, latestStart)) {
                stops[i].isLate = true;
                stops[i].lateMin = Math.ceil((runningTime.getTime() - latestStart.getTime()) / 60000);
                stops[i].actualStartTime = format(runningTime, 'HH:mm');
                runningTime = addMinutes(runningTime, v.durationMinutes);
                stops[i].departTime = format(runningTime, 'HH:mm');
              } else {
                stops[i].actualStartTime = format(runningTime, 'HH:mm');
                runningTime = addMinutes(runningTime, v.durationMinutes);
                stops[i].departTime = format(runningTime, 'HH:mm');
              }
            }
          } else if (stops[i].durationMin) {
            runningTime = addMinutes(runningTime, stops[i].durationMin || 0);
            stops[i].departTime = format(runningTime, 'HH:mm');
          }
        }

        const driverTotalMinutes = Math.round((runningTime.getTime() - departTime.getTime()) / 60000);
        const driverTotalHours = Math.round((driverTotalMinutes / 60) * 10) / 10;

        const memberHours: TeamMemberHours[] = teamMembersWithAddr.map(tm => {
          const pickupIdx = stops.findIndex(s => s.type === 'pickup' && s.teamMemberId === tm.id);
          const dropoffIdx = stops.findIndex(s => s.type === 'dropoff' && s.teamMemberId === tm.id);
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
              suppressMarkers: true,
            });
          }
          directionsRenderer.current.setDirections(routeResult);
          mapInstance.current.fitBounds(routeResult.routes[0].bounds);
          addMarkers(mapInstance.current, stops, latLngs);
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

              <button
                onClick={copyPlan}
                className={`w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied to Clipboard!' : 'Copy Full Plan'}
              </button>

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
                        {stop.waitMin && stop.waitMin > 0 && (
                          <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            WAIT {stop.waitMin} MIN
                          </span>
                        )}
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