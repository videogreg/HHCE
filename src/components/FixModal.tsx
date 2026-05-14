import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Wrench, Phone, AlertCircle, Check, RotateCcw, Bus, Car, Clock, MapPin, User, ChevronRight, Star, Ban } from 'lucide-react';
import type { Visit, Cleaner, Client } from '../types';
import { checkConstraints } from '../utils/scheduler';
import { format, parse, addMinutes, isBefore, isAfter } from 'date-fns';

interface FixModalProps {
  onClose: () => void;
}

interface Problem {
  id: string;
  type: 'client_cancel' | 'client_time_change' | 'cleaner_sick' | 'cleaner_unavailable';
  visitId?: string;
  cleanerId?: string;
  label: string;
  description: string;
}

interface Proposal {
  id: string;
  title: string;
  subtitle: string;
  changes: string[];
  calls: { type: 'client' | 'cleaner'; name: string; message: string }[];
  visitUpdates: { visitId: string; updates: Partial<Visit> }[];
  reliefRoute?: { name: string; address: string; date: string };
  score: number;
}

export const FixModal: React.FC<FixModalProps> = ({ onClose }) => {
  const { visits, setVisits, cleaners, clients, teams, selectedDate } = useAppContext();
  const [step, setStep] = useState<'problems' | 'solutions'>('problems');
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [proposalSet, setProposalSet] = useState(0);
  const [applied, setApplied] = useState(false);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = visits.filter(v => v.date === dateStr && !v.cancelled);
  const activeCleaners = cleaners.filter(c => c.active);

  // ── AUTO-DETECT PROBLEMS ──
  const detectedProblems = useMemo((): Problem[] => {
    const problems: Problem[] = [];

    // Check for visits with inactive cleaners
    dayVisits.forEach(v => {
      const ids = v.assignedCleanerIds || [];
      const inactive = ids.filter(id => !cleaners.find(c => c.id === id)?.active);
      if (inactive.length > 0) {
        const names = inactive.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ');
        problems.push({
          id: `inactive_${v.id}`,
          type: 'cleaner_sick',
          visitId: v.id,
          label: `${v.clientName} — cleaner(s) inactive`,
          description: `Assigned cleaner(s) ${names} are marked inactive/sick.`
        });
      }
    });

    // Check for constraint violations
    const vios = checkConstraints(dayVisits, cleaners, clients, teams);
    const errorVios = vios.filter(v => v.severity === 'error');
    errorVios.forEach(v => {
      const visit = dayVisits.find(dv => dv.id === v.visitId);
      if (visit && !problems.some(p => p.visitId === visit.id && p.type === 'cleaner_sick')) {
        problems.push({
          id: `error_${v.id}`,
          type: 'cleaner_unavailable',
          visitId: visit.id,
          label: `${visit.clientName} — ${v.message}`,
          description: v.message
        });
      }
    });

    return problems;
  }, [dayVisits, cleaners, clients, teams]);

  const toggleProblem = (id: string) => {
    setSelectedProblems(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── PROPOSAL ENGINE ──
  const proposals = useMemo((): Proposal[] => {
    const affectedVisits = dayVisits.filter(v =>
      selectedProblems.some(pid => pid.includes(v.id))
    );
    if (affectedVisits.length === 0) return [];

    const props: Proposal[] = [];
    const duration = visit => {
      const c = clients.find(cl => cl.id === visit.clientId);
      return visit.durationMinutes || c?.durationMinutes || 120;
    };

    // Build driver routes for today
    const driverRoutes: Record<string, Visit[]> = {};
    dayVisits.forEach(v => {
      const ids = v.assignedCleanerIds || [];
      const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
      if (driver) {
        if (!driverRoutes[driver.id]) driverRoutes[driver.id] = [];
        driverRoutes[driver.id].push(v);
      }
    });
    Object.values(driverRoutes).forEach(r => r.sort((a, b) => a.startTime.localeCompare(b.startTime)));

    // PROPOSAL 1: Swap sick cleaner with replacement, keep times
    const swapProposal: Proposal = {
      id: `swap_${proposalSet}`,
      title: 'Swap Cleaners',
      subtitle: 'Replace sick/unavailable cleaners with available ones',
      changes: [],
      calls: [],
      visitUpdates: [],
      score: 0
    };

    affectedVisits.forEach(v => {
      const client = clients.find(c => c.id === v.clientId);
      if (!client) return;

      const currentIds = v.assignedCleanerIds || [];
      const healthyIds = currentIds.filter(id => cleaners.find(c => c.id === id)?.active);
      const needsDriver = healthyIds.length > 0 && !cleaners.filter(c => healthyIds.includes(c.id)).some(c => c.isDriver);

      const candidates = activeCleaners.filter(c => {
        if (currentIds.includes(c.id)) return false;
        if (client.avoidCleaners.includes(c.id)) return false;
        if (healthyIds.some(hid => {
          const h = cleaners.find(x => x.id === hid);
          return h && (h.cannotWorkWith.includes(c.id) || c.cannotWorkWith.includes(h.id));
        })) return false;
        const visitDay = new Date(dateStr + 'T00:00:00');
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
        const dayName = dayNames[visitDay.getDay()];
        if (c.unavailableDays?.includes(dayName)) return false;
        if (needsDriver && !c.isDriver) return false;
        return true;
      });

      const best = candidates.find(c => client.preferredCleaners.includes(c.id)) || candidates[0];
      if (best) {
        const newIds = [...healthyIds, best.id];
        swapProposal.changes.push(`${v.clientName}: replace with ${best.name}${best.isDriver ? ' (Driver)' : ''}`);
        swapProposal.calls.push({
          type: 'cleaner',
          name: best.name,
          message: `New assignment: ${v.clientName} at ${v.startTime} on ${dateStr}. Please confirm.`
        });
        swapProposal.visitUpdates.push({
          visitId: v.id,
          updates: { assignedCleanerIds: newIds, assignedTeamId: '' }
        });
        swapProposal.score += 80;
      }
    });

    if (swapProposal.visitUpdates.length > 0) props.push(swapProposal);

    // PROPOSAL 2: Move affected visits to gaps in existing routes
    const moveProposal: Proposal = {
      id: `move_${proposalSet}`,
      title: 'Reschedule Times',
      subtitle: 'Move affected cleans to open slots in existing driver routes',
      changes: [],
      calls: [],
      visitUpdates: [],
      score: 0
    };

    affectedVisits.forEach(v => {
      const client = clients.find(c => c.id === v.clientId);
      if (!client) return;
      const dur = duration(v);

      let bestSlot: { driver: Cleaner; startTime: string; partner?: Cleaner } | null = null;
      let bestScore = 0;

      Object.entries(driverRoutes).forEach(([driverId, route]) => {
        const driver = activeCleaners.find(c => c.id === driverId);
        if (!driver) return;

        const gaps: { start: string; gapMin: number }[] = [];
        for (let i = 0; i < route.length - 1; i++) {
          const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), route[i].durationMinutes);
          const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
          const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
          if (gapMin >= dur + 15) gaps.push({ start: format(addMinutes(curEnd, 15), 'HH:mm'), gapMin });
        }
        if (route.length > 0) {
          const last = route[route.length - 1];
          const lastEnd = addMinutes(parse(last.startTime, 'HH:mm', new Date()), last.durationMinutes);
          gaps.push({ start: format(addMinutes(lastEnd, 15), 'HH:mm'), gapMin: 999 });
        }

        gaps.forEach(gap => {
          const slotEnd = addMinutes(parse(gap.start, 'HH:mm', new Date()), dur);
          if (client.notBefore && isBefore(parse(gap.start, 'HH:mm', new Date()), parse(client.notBefore, 'HH:mm', new Date()))) return;
          if (client.notAfter && isAfter(slotEnd, parse(client.notAfter, 'HH:mm', new Date()))) return;
          if (driver.mustBeOffBy && isAfter(slotEnd, parse(driver.mustBeOffBy, 'HH:mm', new Date()))) return;

          const paired = new Set<string>();
          route.forEach(rv => (rv.assignedCleanerIds || []).forEach(id => { if (id !== driverId) paired.add(id); }));
          const partners = activeCleaners.filter(c => {
            if (c.id === driverId) return false;
            if (client.avoidCleaners.includes(c.id)) return false;
            if (c.cannotWorkWith.includes(driverId) || driver.cannotWorkWith.includes(c.id)) return false;
            const visitDay = new Date(dateStr + 'T00:00:00');
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
            const dayName = dayNames[visitDay.getDay()];
            if (c.unavailableDays?.includes(dayName)) return false;
            return true;
          });
          const partner = partners.find(c => client.preferredCleaners.includes(c.id) && paired.has(c.id))
            || partners.find(c => paired.has(c.id))
            || partners.find(c => client.preferredCleaners.includes(c.id))
            || partners[0];

          const hasPref = [driver.id, partner?.id].some(id => id && client.preferredCleaners.includes(id));
          const score = 60 + (hasPref ? 30 : 0) + (partner ? 15 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestSlot = { driver, startTime: gap.start, partner };
          }
        });
      });

      if (bestSlot) {
        const ids = bestSlot.partner ? [bestSlot.driver.id, bestSlot.partner.id] : [bestSlot.driver.id];
        moveProposal.changes.push(`${v.clientName}: move to ${bestSlot.startTime} with ${bestSlot.driver.name}`);
        moveProposal.calls.push(
          { type: 'client', name: v.clientName, message: `Can we move your cleaning to ${bestSlot.startTime} today?` },
          { type: 'cleaner', name: bestSlot.driver.name, message: `Added: ${v.clientName} at ${bestSlot.startTime}.` }
        );
        if (bestSlot.partner) {
          moveProposal.calls.push({ type: 'cleaner', name: bestSlot.partner.name, message: `You're riding with ${bestSlot.driver.name} to ${v.clientName}.` });
        }
        moveProposal.visitUpdates.push({
          visitId: v.id,
          updates: { startTime: bestSlot.startTime, assignedCleanerIds: ids, assignedTeamId: '' }
        });
        moveProposal.score += bestScore;
      }
    });

    if (moveProposal.visitUpdates.length > 0) props.push(moveProposal);

    // PROPOSAL 3: Relief driver for remaining affected visits
    const reliefVisits = affectedVisits.filter(v =>
      !swapProposal.visitUpdates.some(u => u.visitId === v.id) &&
      !moveProposal.visitUpdates.some(u => u.visitId === v.id)
    );

    if (reliefVisits.length > 0) {
      const reliefProposal: Proposal = {
        id: `relief_${proposalSet}`,
        title: 'Relief Driver Route',
        subtitle: 'Create a new driver route for unassigned cleans',
        changes: reliefVisits.map(v => `${v.clientName}: new relief route at ${v.startTime}`),
        calls: reliefVisits.map(v => ({ type: 'client', name: v.clientName, message: `A relief driver will handle your cleaning at ${v.startTime} today.` })),        visitUpdates: reliefVisits.map(v => ({
          visitId: v.id,
          updates: { assignedCleanerIds: [], assignedTeamId: '' }
        })),
        reliefRoute: { name: 'Relief Driver', address: '', date: dateStr },
        score: 20
      };
      props.push(reliefProposal);
    }

    // Sort by score
    props.sort((a, b) => b.score - a.score);
    return props.slice(0, 3);
  }, [selectedProblems, dayVisits, activeCleaners, clients, teams, dateStr, proposalSet]);

  const applyProposal = (p: Proposal) => {
    let newVisits = [...visits];
    p.visitUpdates.forEach(u => {
      newVisits = newVisits.map(v => v.id === u.visitId ? { ...v, ...u.updates } as Visit : v);
    });
    setVisits(newVisits);

    if (p.reliefRoute) {
      try {
        const raw = localStorage.getItem('hhce_relief_routes');
        const all = raw ? JSON.parse(raw) : {};
        const reliefStops = [
          { type: 'depart', label: `Leave Home — ${p.reliefRoute.name}`, address: p.reliefRoute.address || 'TBD', arrivalTime: '', durationMin: 0, latLng: null, included: true },
          ...p.visitUpdates.map(u => {
            const v = visits.find(vv => vv.id === u.visitId);
            return {
              type: 'clean',
              label: `Clean — ${v?.clientName || 'Unknown'}`,
              address: v?.clientAddress || 'TBD',
              arrivalTime: '',
              durationMin: v?.durationMinutes || 120,
              targetTime: v?.startTime || '09:00',
              latLng: null,
              included: true
            };
          }),
          { type: 'home', label: `Arrive Home — ${p.reliefRoute.name}`, address: p.reliefRoute.address || 'TBD', arrivalTime: '', durationMin: 0, latLng: null, included: true }
        ];
        all[dateStr] = reliefStops;
        localStorage.setItem('hhce_relief_routes', JSON.stringify(all));
      } catch { /* ignore */ }
    }

    setApplied(true);
    setTimeout(() => {
      setApplied(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Wrench size={20} />
            <h2 className="text-lg font-black">FIX Schedule</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl active:scale-95">
            <X size={20} />
          </button>
        </div>

        {/* Applied overlay */}
        {applied && (
          <div className="absolute inset-0 bg-green-600/90 z-50 flex flex-col items-center justify-center text-white">
            <Check size={48} className="mb-3" />
            <p className="text-xl font-black">Fix Applied!</p>
            <p className="text-sm font-medium mt-1">Routes recalculated</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'problems' && (
            <>
              <p className="text-sm font-bold text-slate-700">
                Select the problems that need fixing today:
              </p>

              {detectedProblems.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500 font-medium">No problems detected automatically.</p>
                  <p className="text-xs text-slate-400 mt-1">Check the boxes below to manually flag issues.</p>
                </div>
              )}

              {/* Auto-detected problems */}
              {detectedProblems.map(p => (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedProblems.includes(p.id)
                      ? 'bg-red-50 border-red-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedProblems.includes(p.id)}
                    onChange={() => toggleProblem(p.id)}
                    className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{p.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                  </div>
                </label>
              ))}

              {/* Manual problem options */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Or flag manually</p>
                <div className="grid grid-cols-2 gap-2">
                  {dayVisits.map(v => (
                    <label
                      key={`manual_${v.id}`}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                        selectedProblems.includes(`manual_${v.id}`)
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProblems.includes(`manual_${v.id}`)}
                        onChange={() => toggleProblem(`manual_${v.id}`)}
                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-slate-700">{v.clientName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep('solutions')}
                disabled={selectedProblems.length === 0}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Wrench size={16} /> Generate Fix Suggestions
              </button>
            </>
          )}

          {step === 'solutions' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-700">
                  {proposals.length} solution{proposals.length !== 1 ? 's' : ''} found
                </p>
                <button
                  onClick={() => setStep('problems')}
                  className="text-xs font-bold text-blue-600 hover:underline"
                >
                  Back to problems
                </button>
              </div>

              {proposals.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500 font-medium">No solutions could be generated.</p>
                  <p className="text-xs text-slate-400 mt-1">Try selecting different problems or edit manually.</p>
                </div>
              )}

              {proposals.map((p, idx) => (
                <div key={p.id} className="rounded-xl border-2 border-slate-200 overflow-hidden">
                  <div className={`p-3 ${
                    idx === 0 ? 'bg-green-50 border-b border-green-200' :
                    idx === 1 ? 'bg-blue-50 border-b border-blue-200' :
                    'bg-amber-50 border-b border-amber-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${
                          idx === 0 ? 'bg-green-500' : idx === 1 ? 'bg-blue-500' : 'bg-amber-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{p.title}</p>
                          <p className="text-[10px] text-slate-500">{p.subtitle}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => applyProposal(p)}
                        className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1"
                      >
                        <Check size={12} /> Apply
                      </button>
                    </div>
                  </div>

                  <div className="p-3 space-y-2">
                    {/* Changes */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Changes</p>
                      <div className="space-y-1">
                        {p.changes.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <ChevronRight size={10} className="text-blue-500 shrink-0" />
                            {c}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Who to call */}
                    {p.calls.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Who to contact</p>
                        <div className="space-y-1">
                          {p.calls.map((call, i) => (
                            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                              call.type === 'client' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                            }`}>
                              <Phone size={10} className="shrink-0" />
                              <span className="font-bold">{call.name}:</span>
                              <span>{call.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Relief driver note */}
                    {p.reliefRoute && (
                      <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-lg text-xs text-slate-600">
                        <Bus size={12} className="text-slate-500" />
                        <span className="font-bold">Relief driver needed.</span>
                        <span>Set up in Route Planner after applying.</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => setProposalSet(s => s + 1)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors active:scale-95 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={14} /> Get 3 More Options
                </button>
                <button
                  onClick={() => { onClose(); }}
                  className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-100 transition-colors active:scale-95 flex items-center justify-center gap-2"
                >
                  <Wrench size={14} /> Edit Manually
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};