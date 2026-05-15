import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, Wrench, Phone, AlertCircle, Check, RotateCcw, Bus, ChevronRight, UserX, Clock, CalendarX, CalendarClock, ArrowLeft } from 'lucide-react';
import type { Visit, Cleaner, Client } from '../types';
import { checkConstraints } from '../utils/scheduler';
import { format, parse, addMinutes, isBefore, isAfter } from 'date-fns';

interface FixModalProps {
  onClose: () => void;
}

type IssueType = 'client-cancel' | 'client-earlier' | 'client-later' | 'cleaner-sick' | 'cleaner-late-start' | 'cleaner-early-leave';

interface Proposal {
  id: string;
  title: string;
  subtitle: string;
  changes: string[];
  calls: { type: 'client' | 'cleaner'; name: string; phone?: string; message: string }[];
  visitUpdates: { visitId: string; updates: Partial<Visit> }[];
  cleanerUpdates?: { cleanerId: string; updates: Partial<Cleaner> }[];
  reliefRoute?: { name: string; address: string; date: string; stops: any[] };
  score: number;
}

export const FixModal: React.FC<FixModalProps> = ({ onClose }) => {
  const { visits, setVisits, cleaners, setCleaners, clients, teams, selectedDate } = useAppContext();
  const [step, setStep] = useState<'issue' | 'affected' | 'solutions'>('issue');
  const [issueType, setIssueType] = useState<IssueType | null>(null);
  const [issueTime, setIssueTime] = useState<string>('09:00');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [proposalSet, setProposalSet] = useState(0);
  const [applied, setApplied] = useState(false);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = visits.filter(v => v.date === dateStr && !v.cancelled);
  const activeCleaners = cleaners.filter(c => c.active);

  const affectedVisits = useMemo(() => {
    if (!issueType) return [];
    if (issueType.startsWith('client-')) {
      return dayVisits.filter(v => selectedIds.includes(v.clientId));
    }
    return dayVisits.filter(v => {
      const ids = v.assignedCleanerIds || [];
      return selectedIds.some(sid => ids.includes(sid));
    });
  }, [issueType, selectedIds, dayVisits]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const driverRoutes = useMemo(() => {
    const routes: Record<string, Visit[]> = {};
    dayVisits.forEach(v => {
      const ids = v.assignedCleanerIds || [];
      const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
      if (driver) {
        if (!routes[driver.id]) routes[driver.id] = [];
        routes[driver.id].push(v);
      }
    });
    Object.values(routes).forEach(r => r.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return routes;
  }, [dayVisits, activeCleaners]);

  const durationOf = (visit: Visit) => {
    const c = clients.find(cl => cl.id === visit.clientId);
    return visit.durationMinutes || c?.durationMinutes || 120;
  };

  // ── PROPOSAL ENGINE ──
  const proposals = useMemo((): Proposal[] => {
    if (!issueType || selectedIds.length === 0) return [];
    const props: Proposal[] = [];
    const seed = proposalSet;

    // CLIENT CANCEL
    if (issueType === 'client-cancel') {
      const cancelledVisits = affectedVisits;
      if (cancelledVisits.length === 0) return [];

      const p1: Proposal = { id: `cancel_p1_${seed}`, title: 'Absorb & Rebalance', subtitle: 'Cancel visits and move a nearby tight visit into the freed slot', changes: [], calls: [], visitUpdates: [], score: 90 };
      cancelledVisits.forEach(v => {
        p1.changes.push(`Cancel ${v.clientName} at ${v.startTime}`);
        p1.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `Confirming cancellation for ${dateStr}.` });
        p1.visitUpdates.push({ visitId: v.id, updates: { cancelled: true } });
      });
      const freedDriverIds = new Set<string>();
      cancelledVisits.forEach(v => {
        const ids = v.assignedCleanerIds || [];
        const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
        if (driver) freedDriverIds.add(driver.id);
      });
      let moved = false;
      freedDriverIds.forEach(did => {
        const route = driverRoutes[did] || [];
        route.forEach(rv => {
          if (cancelledVisits.some(cv => cv.id === rv.id) || moved) return;
          const cv = cancelledVisits.find(c => (c.assignedCleanerIds || []).includes(did));
          if (cv) {
            p1.changes.push(`Move ${rv.clientName} to ${cv.startTime} (freed slot)`);
            p1.visitUpdates.push({ visitId: rv.id, updates: { startTime: cv.startTime } });
            p1.calls.push({ type: 'client', name: rv.clientName, phone: clients.find(c => c.id === rv.clientId)?.phone, message: `Can we move your cleaning to ${cv.startTime} today?` });
            moved = true;
          }
        });
      });
      if (!moved) p1.changes.push('Cleaners get a shortened route / break');
      props.push(p1);

      const p2: Proposal = { id: `cancel_p2_${seed}`, title: 'Reassign Teams', subtitle: 'Cancel visits and send freed cleaners to help other busy routes', changes: [], calls: [], visitUpdates: [], score: 70 };
      cancelledVisits.forEach(v => {
        p2.changes.push(`Cancel ${v.clientName}`);
        p2.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `Confirming cancellation for ${dateStr}.` });
        p2.visitUpdates.push({ visitId: v.id, updates: { cancelled: true } });
      });
      p2.changes.push('Freed cleaners available as relief support for other routes');
      props.push(p2);

      const p3: Proposal = { id: `cancel_p3_${seed}`, title: 'Fill-In Opportunity', subtitle: 'Offer the freed slot to a standby client', changes: [], calls: [], visitUpdates: [], score: 50 };
      cancelledVisits.forEach(v => {
        p3.changes.push(`Cancel ${v.clientName} at ${v.startTime}`);
        p3.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `Confirming cancellation.` });
        p3.visitUpdates.push({ visitId: v.id, updates: { cancelled: true } });
      });
      p3.changes.push('Call standby list to fill the freed time slot');
      props.push(p3);
    }

    // CLIENT TIME CHANGE
    else if (issueType === 'client-earlier' || issueType === 'client-later') {
      const direction = issueType === 'client-earlier' ? 'earlier' : 'later';
      const timeShift = issueType === 'client-earlier' ? -60 : 60;

      targetVisits.forEach(targetVisit => {
        const client = clients.find(c => c.id === targetVisit.clientId);
        if (!client) return;
        const dur = durationOf(targetVisit);
        const currentStart = parse(targetVisit.startTime, 'HH:mm', new Date());
        const newStart = addMinutes(currentStart, timeShift);
        const newStartStr = format(newStart, 'HH:mm');

        const ids = targetVisit.assignedCleanerIds || [];
        const driver = activeCleaners.find(c => ids.includes(c.id) && c.isDriver);
        if (driver) {
          const route = driverRoutes[driver.id] || [];
          const idx = route.findIndex(v => v.id === targetVisit.id);
          let canFit = true;
          if (idx > 0) {
            const prev = route[idx - 1];
            const prevEnd = addMinutes(parse(prev.startTime, 'HH:mm', new Date()), durationOf(prev));
            if (isBefore(newStart, addMinutes(prevEnd, 15))) canFit = false;
          }
          if (idx >= 0 && idx < route.length - 1) {
            const next = route[idx + 1];
            const targetEnd = addMinutes(newStart, dur);
            if (isAfter(targetEnd, addMinutes(parse(next.startTime, 'HH:mm', new Date()), -15))) canFit = false;
          }
          if (driver.mustBeOffBy && isAfter(addMinutes(newStart, dur), parse(driver.mustBeOffBy, 'HH:mm', new Date()))) canFit = false;

          if (canFit) {
            const p1: Proposal = { id: `time_p1_${targetVisit.id}_${seed}`, title: `Keep with ${driver.name}`, subtitle: `Same driver at new ${direction} time ${newStartStr}`, changes: [], calls: [], visitUpdates: [], score: 95 };
            p1.changes.push(`${targetVisit.clientName}: ${targetVisit.startTime} → ${newStartStr} with ${driver.name}`);
            p1.calls.push({ type: 'client', name: targetVisit.clientName, phone: client.phone, message: `Confirm moving your clean to ${newStartStr} today.` });
            p1.visitUpdates.push({ visitId: targetVisit.id, updates: { startTime: newStartStr } });
            props.push(p1);
          }
        }

        Object.entries(driverRoutes).forEach(([did, route]) => {
          if (props.length >= 3) return;
          const otherDriver = activeCleaners.find(c => c.id === did);
          if (!otherDriver) return;
          for (let i = 0; i < route.length - 1; i++) {
            const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), durationOf(route[i]));
            const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
            const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
            if (gapMin >= dur + 15) {
              const slotStart = format(addMinutes(curEnd, 15), 'HH:mm');
              const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), dur);
              if (client.notBefore && isBefore(parse(slotStart, 'HH:mm', new Date()), parse(client.notBefore, 'HH:mm', new Date()))) continue;
              if (client.notAfter && isAfter(slotEnd, parse(client.notAfter, 'HH:mm', new Date()))) continue;
              if (otherDriver.mustBeOffBy && isAfter(slotEnd, parse(otherDriver.mustBeOffBy, 'HH:mm', new Date()))) continue;

              const paired = new Set<string>();
              route.forEach(rv => (rv.assignedCleanerIds || []).forEach(id => { if (id !== did) paired.add(id); }));
              const candidates = activeCleaners.filter(c => {
                if (c.id === did) return false;
                if (client.avoidCleaners.includes(c.id)) return false;
                if (c.cannotWorkWith.includes(did) || otherDriver.cannotWorkWith.includes(c.id)) return false;
                return true;
              });
              const partner = candidates.find(c => client.preferredCleaners.includes(c.id) && paired.has(c.id)) || candidates.find(c => paired.has(c.id)) || candidates.find(c => client.preferredCleaners.includes(c.id)) || candidates[0];
              const newIds = partner ? [did, partner.id] : [did];
              const p2: Proposal = { id: `time_p2_${targetVisit.id}_${did}_${seed}`, title: `Switch to ${otherDriver.name}`, subtitle: `Move to ${slotStart} in ${otherDriver.name}'s route`, changes: [], calls: [], visitUpdates: [], score: 75 };
              p2.changes.push(`${targetVisit.clientName}: ${targetVisit.startTime} → ${slotStart} with ${otherDriver.name}`);
              p2.calls.push({ type: 'client', name: targetVisit.clientName, phone: client.phone, message: `Can we move your clean to ${slotStart} today?` });
              p2.calls.push({ type: 'cleaner', name: otherDriver.name, message: `Added: ${targetVisit.clientName} at ${slotStart}.` });
              if (partner) p2.calls.push({ type: 'cleaner', name: partner.name, message: `You're riding with ${otherDriver.name} to ${targetVisit.clientName}.` });
              p2.visitUpdates.push({ visitId: targetVisit.id, updates: { startTime: slotStart, assignedCleanerIds: newIds, assignedTeamId: '' } });
              props.push(p2);
              break;
            }
          }
        });

        if (props.length < 3) {
          const freeDrivers = activeCleaners.filter(c => {
            if (!c.isDriver) return false;
            if (client.avoidCleaners.includes(c.id)) return false;
            return !dayVisits.some(v => (v.assignedCleanerIds || []).includes(c.id));
          });
          if (freeDrivers.length > 0) {
            const bestDriver = freeDrivers.find(d => client.preferredCleaners.includes(d.id)) || freeDrivers[0];
            const p3: Proposal = { id: `time_p3_${targetVisit.id}_${seed}`, title: 'New Driver Route', subtitle: `Assign unscheduled driver ${bestDriver.name}`, changes: [], calls: [], visitUpdates: [], score: 40 };
            p3.changes.push(`${targetVisit.clientName}: ${targetVisit.startTime} → ${newStartStr} with ${bestDriver.name}`);
            p3.calls.push({ type: 'client', name: targetVisit.clientName, phone: client.phone, message: `A new team will handle your clean at ${newStartStr}.` });
            p3.calls.push({ type: 'cleaner', name: bestDriver.name, message: `New assignment: ${targetVisit.clientName} at ${newStartStr}.` });
            p3.visitUpdates.push({ visitId: targetVisit.id, updates: { startTime: newStartStr, assignedCleanerIds: [bestDriver.id], assignedTeamId: '' } });
            props.push(p3);
          } else {
            const p3: Proposal = { id: `time_p3_relief_${targetVisit.id}_${seed}`, title: 'Relief Driver Route', subtitle: 'Create a relief route for the new time', changes: [], calls: [], visitUpdates: [], score: 25 };
            p3.changes.push(`${targetVisit.clientName}: ${targetVisit.startTime} → ${newStartStr} via relief driver`);
            p3.calls.push({ type: 'client', name: targetVisit.clientName, phone: client.phone, message: `A relief driver will handle your clean at ${newStartStr}.` });
            p3.visitUpdates.push({ visitId: targetVisit.id, updates: { startTime: newStartStr, assignedCleanerIds: [], assignedTeamId: '' } });
            p3.reliefRoute = { name: 'Relief Driver', address: '', date: dateStr, stops: [] };
            props.push(p3);
          }
        }
      });
    }

    // CLEANER SICK
    else if (issueType === 'cleaner-sick') {
      selectedIds.forEach(sickId => {
        const sickCleaner = cleaners.find(c => c.id === sickId);
        if (!sickCleaner) return;
        const sickVisits = dayVisits.filter(v => (v.assignedCleanerIds || []).includes(sickId));
        if (sickVisits.length === 0) return;

        const p1: Proposal = { id: `sick_p1_${sickId}_${seed}`, title: `Replace ${sickCleaner.name}`, subtitle: 'Swap with compatible available cleaners, keep all times', changes: [], calls: [], visitUpdates: [], cleanerUpdates: [{ cleanerId: sickId, updates: { active: false } }], score: 90 };
        p1.calls.push({ type: 'cleaner', name: sickCleaner.name, phone: sickCleaner.phone, message: `Confirmed: you're off today. Feel better!` });
        sickVisits.forEach(v => {
          const client = clients.find(c => c.id === v.clientId);
          if (!client) return;
          const currentIds = v.assignedCleanerIds || [];
          const healthyIds = currentIds.filter(id => id !== sickId && cleaners.find(c => c.id === id)?.active);
          const needsDriver = healthyIds.length > 0 && !cleaners.filter(c => healthyIds.includes(c.id)).some(c => c.isDriver);
          const candidates = activeCleaners.filter(c => {
            if (currentIds.includes(c.id)) return false;
            if (client.avoidCleaners.includes(c.id)) return false;
            if (healthyIds.some(hid => {
              const h = cleaners.find(x => x.id === hid);
              return h && (h.cannotWorkWith.includes(c.id) || c.cannotWorkWith.includes(h.id));
            })) return false;
            if (needsDriver && !c.isDriver) return false;
            return true;
          });
          const best = candidates.find(c => client.preferredCleaners.includes(c.id)) || candidates[0];
          if (best) {
            const newIds = [...healthyIds, best.id];
            p1.changes.push(`${v.clientName}: replace ${sickCleaner.name} with ${best.name}`);
            p1.calls.push({ type: 'cleaner', name: best.name, phone: best.phone, message: `New assignment: ${v.clientName} at ${v.startTime} today.` });
            p1.visitUpdates.push({ visitId: v.id, updates: { assignedCleanerIds: newIds, assignedTeamId: '' } });
          }
        });
        if (p1.visitUpdates.length > 0) props.push(p1);

        const p2: Proposal = { id: `sick_p2_${sickId}_${seed}`, title: 'Redistribute Visits', subtitle: 'Move visits to open slots in other driver routes', changes: [], calls: [], visitUpdates: [], cleanerUpdates: [{ cleanerId: sickId, updates: { active: false } }], score: 70 };
        p2.calls.push({ type: 'cleaner', name: sickCleaner.name, message: `Confirmed: you're off today.` });
        sickVisits.forEach(v => {
          const client = clients.find(c => c.id === v.clientId);
          if (!client) return;
          const dur = durationOf(v);
          let placed = false;
          Object.entries(driverRoutes).forEach(([did, route]) => {
            if (placed) return;
            const driver = activeCleaners.find(c => c.id === did);
            if (!driver || did === sickId) return;
            for (let i = 0; i < route.length - 1; i++) {
              const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), durationOf(route[i]));
              const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
              const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
              if (gapMin >= dur + 15) {
                const slotStart = format(addMinutes(curEnd, 15), 'HH:mm');
                const slotEnd = addMinutes(parse(slotStart, 'HH:mm', new Date()), dur);
                if (client.notBefore && isBefore(parse(slotStart, 'HH:mm', new Date()), parse(client.notBefore, 'HH:mm', new Date()))) continue;
                if (client.notAfter && isAfter(slotEnd, parse(client.notAfter, 'HH:mm', new Date()))) continue;
                if (driver.mustBeOffBy && isAfter(slotEnd, parse(driver.mustBeOffBy, 'HH:mm', new Date()))) continue;
                const paired = new Set<string>();
                route.forEach(rv => (rv.assignedCleanerIds || []).forEach(id => { if (id !== did) paired.add(id); }));
                const candidates = activeCleaners.filter(c => {
                  if (c.id === did) return false;
                  if (client.avoidCleaners.includes(c.id)) return false;
                  if (c.cannotWorkWith.includes(did) || driver.cannotWorkWith.includes(c.id)) return false;
                  return true;
                });
                const partner = candidates.find(c => client.preferredCleaners.includes(c.id) && paired.has(c.id)) || candidates.find(c => paired.has(c.id)) || candidates.find(c => client.preferredCleaners.includes(c.id)) || candidates[0];
                const newIds = partner ? [did, partner.id] : [did];
                p2.changes.push(`${v.clientName}: move to ${slotStart} with ${driver.name}`);
                p2.calls.push({ type: 'client', name: v.clientName, phone: client.phone, message: `Can we move your cleaning to ${slotStart} today?` });
                p2.calls.push({ type: 'cleaner', name: driver.name, message: `Added: ${v.clientName} at ${slotStart}.` });
                if (partner) p2.calls.push({ type: 'cleaner', name: partner.name, message: `You're riding with ${driver.name} to ${v.clientName}.` });
                p2.visitUpdates.push({ visitId: v.id, updates: { startTime: slotStart, assignedCleanerIds: newIds, assignedTeamId: '' } });
                placed = true;
                break;
              }
            }
          });
          if (!placed) p2.changes.push(`${v.clientName}: needs relief driver assignment`);
        });
        if (p2.visitUpdates.length > 0) props.push(p2);

        const reliefVisits = sickVisits.filter(v => !props.some(p => p.visitUpdates.some(u => u.visitId === v.id)));
        if (reliefVisits.length > 0 || props.length === 0) {
          const p3: Proposal = { id: `sick_p3_${sickId}_${seed}`, title: 'Relief Driver Route', subtitle: 'Create a new route for unassigned visits', changes: [], calls: [], visitUpdates: [], cleanerUpdates: [{ cleanerId: sickId, updates: { active: false } }], score: 30 };
          p3.calls.push({ type: 'cleaner', name: sickCleaner.name, message: `Confirmed: you're off today.` });
          reliefVisits.forEach(v => {
            p3.changes.push(`${v.clientName}: relief driver at ${v.startTime}`);
            p3.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `A relief driver will handle your cleaning at ${v.startTime} today.` });
            p3.visitUpdates.push({ visitId: v.id, updates: { assignedCleanerIds: [], assignedTeamId: '' } });
          });
          p3.reliefRoute = { name: 'Relief Driver', address: '', date: dateStr, stops: [] };
          props.push(p3);
        }
      });
    }

    // CLEANER LATE START / EARLY LEAVE
    else if (issueType === 'cleaner-late-start' || issueType === 'cleaner-early-leave') {
      selectedIds.forEach(cleanerId => {
        const cleaner = cleaners.find(c => c.id === cleanerId);
        if (!cleaner || !cleaner.isDriver) return;
        const cleanerVisits = dayVisits.filter(v => (v.assignedCleanerIds || []).includes(cleanerId));
        if (cleanerVisits.length === 0) return;

        if (issueType === 'cleaner-late-start') {
          const newStart = issueTime || '10:00';
          const p1: Proposal = { id: `late_p1_${cleanerId}_${seed}`, title: `Delay ${cleaner.name}'s Route`, subtitle: `Push all visits to start after ${newStart}`, changes: [], calls: [], visitUpdates: [], score: 85 };
          p1.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Noted: start at ${newStart} today.` });
          let currentTime = parse(newStart, 'HH:mm', new Date());
          let feasible = true;
          cleanerVisits.sort((a, b) => a.startTime.localeCompare(b.startTime)).forEach((v, idx) => {
            if (!feasible) return;
            const client = clients.find(c => c.id === v.clientId);
            const dur = durationOf(v);
            if (client?.notBefore && isBefore(currentTime, parse(client.notBefore, 'HH:mm', new Date()))) { feasible = false; return; }
            const proposedStart = format(currentTime, 'HH:mm');
            const proposedEnd = addMinutes(currentTime, dur);
            if (idx < cleanerVisits.length - 1) {
              const nextOriginal = cleanerVisits[idx + 1];
              const nextStart = parse(nextOriginal.startTime, 'HH:mm', new Date());
              if (isAfter(proposedEnd, nextStart)) { feasible = false; return; }
            }
            p1.changes.push(`${v.clientName}: ${v.startTime} → ${proposedStart}`);
            p1.calls.push({ type: 'client', name: v.clientName, phone: client?.phone, message: `Can we move your clean to ${proposedStart} today?` });
            p1.visitUpdates.push({ visitId: v.id, updates: { startTime: proposedStart } });
            currentTime = addMinutes(currentTime, dur + 15);
          });
          if (feasible && p1.visitUpdates.length > 0) props.push(p1);

          const p2: Proposal = { id: `late_p2_${cleanerId}_${seed}`, title: 'Split Route', subtitle: 'Move early visits to another driver', changes: [], calls: [], visitUpdates: [], score: 65 };
          p2.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Start at ${newStart}. Early visits reassigned.` });
          const earlyVisits = cleanerVisits.filter(v => v.startTime < newStart);
          earlyVisits.forEach(v => {
            const client = clients.find(c => c.id === v.clientId);
            let placed = false;
            Object.entries(driverRoutes).forEach(([did, route]) => {
              if (placed || did === cleanerId) return;
              const driver = activeCleaners.find(c => c.id === did);
              if (!driver) return;
              for (let i = 0; i < route.length - 1; i++) {
                const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), durationOf(route[i]));
                const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
                const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
                if (gapMin >= durationOf(v) + 15) {
                  const slotStart = format(addMinutes(curEnd, 15), 'HH:mm');
                  p2.changes.push(`${v.clientName}: move to ${slotStart} with ${driver.name}`);
                  p2.calls.push({ type: 'client', name: v.clientName, phone: client?.phone, message: `Can we move your clean to ${slotStart} today?` });
                  p2.calls.push({ type: 'cleaner', name: driver.name, message: `Added: ${v.clientName} at ${slotStart}.` });
                  p2.visitUpdates.push({ visitId: v.id, updates: { startTime: slotStart, assignedCleanerIds: [did], assignedTeamId: '' } });
                  placed = true;
                  break;
                }
              }
            });
            if (!placed) p2.changes.push(`${v.clientName}: needs relief driver`);
          });
          cleanerVisits.filter(v => v.startTime >= newStart).forEach(v => {
            p2.changes.push(`${v.clientName}: stays at ${v.startTime} with ${cleaner.name}`);
          });
          if (p2.visitUpdates.length > 0) props.push(p2);

          const p3: Proposal = { id: `late_p3_${cleanerId}_${seed}`, title: 'Relief Driver Cover', subtitle: 'Relief driver handles all visits until you arrive', changes: [], calls: [], visitUpdates: [], score: 40 };
          p3.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Relief driver covers your route until ${newStart}.` });
          cleanerVisits.forEach(v => {
            p3.changes.push(`${v.clientName}: relief driver at ${v.startTime}`);
            p3.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `A relief driver will cover your clean today.` });
            p3.visitUpdates.push({ visitId: v.id, updates: { assignedCleanerIds: [], assignedTeamId: '' } });
          });
          p3.reliefRoute = { name: `Relief for ${cleaner.name}`, address: '', date: dateStr, stops: [] };
          props.push(p3);
        }

        else if (issueType === 'cleaner-early-leave') {
          const leaveBy = issueTime || '14:00';
          const leaveTime = parse(leaveBy, 'HH:mm', new Date());

          const p1: Proposal = { id: `early_p1_${cleanerId}_${seed}`, title: `Reorder ${cleaner.name}'s Route`, subtitle: `Do heavy visits first, finish by ${leaveBy}`, changes: [], calls: [], visitUpdates: [], score: 85 };
          p1.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Noted: must finish by ${leaveBy}.` });
          const sorted = [...cleanerVisits].sort((a, b) => durationOf(b) - durationOf(a));
          let currentTime = parse(sorted[0]?.startTime || '08:00', 'HH:mm', new Date());
          const dropped: Visit[] = [];
          sorted.forEach(v => {
            const client = clients.find(c => c.id === v.clientId);
            const dur = durationOf(v);
            const endTime = addMinutes(currentTime, dur);
            if (isAfter(endTime, leaveTime)) {
              dropped.push(v);
            } else {
              const newStart = format(currentTime, 'HH:mm');
              if (newStart !== v.startTime) {
                p1.changes.push(`${v.clientName}: ${v.startTime} → ${newStart}`);
                p1.calls.push({ type: 'client', name: v.clientName, phone: client?.phone, message: `Can we move your clean to ${newStart} today?` });
                p1.visitUpdates.push({ visitId: v.id, updates: { startTime: newStart } });
              } else {
                p1.changes.push(`${v.clientName}: stays at ${v.startTime}`);
              }
              currentTime = addMinutes(currentTime, dur + 15);
            }
          });
          dropped.forEach(v => {
            p1.changes.push(`${v.clientName}: move to another route (exceeds ${leaveBy})`);
          });
          if (p1.visitUpdates.length > 0 || dropped.length > 0) props.push(p1);

          const p2: Proposal = { id: `early_p2_${cleanerId}_${seed}`, title: 'Move Tail Visits', subtitle: 'Move visits that fall after cutoff to other drivers', changes: [], calls: [], visitUpdates: [], score: 70 };
          p2.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Finish by ${leaveBy}. Last visits reassigned.` });
          const tailVisits = cleanerVisits.filter(v => {
            const start = parse(v.startTime, 'HH:mm', new Date());
            return isAfter(addMinutes(start, durationOf(v)), leaveTime);
          });
          tailVisits.forEach(v => {
            const client = clients.find(c => c.id === v.clientId);
            let placed = false;
            Object.entries(driverRoutes).forEach(([did, route]) => {
              if (placed || did === cleanerId) return;
              const driver = activeCleaners.find(c => c.id === did);
              if (!driver) return;
              for (let i = 0; i < route.length - 1; i++) {
                const curEnd = addMinutes(parse(route[i].startTime, 'HH:mm', new Date()), durationOf(route[i]));
                const nxtStart = parse(route[i + 1].startTime, 'HH:mm', new Date());
                const gapMin = (nxtStart.getTime() - curEnd.getTime()) / 60000;
                if (gapMin >= durationOf(v) + 15) {
                  const slotStart = format(addMinutes(curEnd, 15), 'HH:mm');
                  p2.changes.push(`${v.clientName}: move to ${slotStart} with ${driver.name}`);
                  p2.calls.push({ type: 'client', name: v.clientName, phone: client?.phone, message: `Can we move your clean to ${slotStart} today?` });
                  p2.calls.push({ type: 'cleaner', name: driver.name, message: `Added: ${v.clientName} at ${slotStart}.` });
                  p2.visitUpdates.push({ visitId: v.id, updates: { startTime: slotStart, assignedCleanerIds: [did], assignedTeamId: '' } });
                  placed = true;
                  break;
                }
              }
            });
            if (!placed) p2.changes.push(`${v.clientName}: needs relief driver`);
          });
          cleanerVisits.filter(v => !tailVisits.includes(v)).forEach(v => {
            p2.changes.push(`${v.clientName}: stays with ${cleaner.name}`);
          });
          if (p2.visitUpdates.length > 0 || tailVisits.length > 0) props.push(p2);

          const p3: Proposal = { id: `early_p3_${cleanerId}_${seed}`, title: 'Relief Takes Tail', subtitle: 'Relief driver handles visits after your cutoff', changes: [], calls: [], visitUpdates: [], score: 45 };
          p3.calls.push({ type: 'cleaner', name: cleaner.name, phone: cleaner.phone, message: `Relief driver covers visits after ${leaveBy}.` });
          const afterVisits = cleanerVisits.filter(v => {
            const start = parse(v.startTime, 'HH:mm', new Date());
            return isAfter(start, leaveTime) || isAfter(addMinutes(start, durationOf(v)), leaveTime);
          });
          afterVisits.forEach(v => {
            p3.changes.push(`${v.clientName}: relief driver after ${leaveBy}`);
            p3.calls.push({ type: 'client', name: v.clientName, phone: clients.find(c => c.id === v.clientId)?.phone, message: `A relief driver will handle your clean after ${leaveBy}.` });
            p3.visitUpdates.push({ visitId: v.id, updates: { assignedCleanerIds: [], assignedTeamId: '' } });
          });
          if (afterVisits.length > 0) {
            p3.reliefRoute = { name: `Relief after ${leaveBy}`, address: '', date: dateStr, stops: [] };
            props.push(p3);
          }
        }
      });
    }

    props.sort((a, b) => b.score - a.score);
    return props.slice(0, 3);
  }, [issueType, selectedIds, dayVisits, activeCleaners, clients, teams, dateStr, proposalSet, issueTime, cleaners, driverRoutes]);

  const applyProposal = (p: Proposal) => {
    let newVisits = [...visits];
    p.visitUpdates.forEach(u => {
      newVisits = newVisits.map(v => v.id === u.visitId ? { ...v, ...u.updates } as Visit : v);
    });
    setVisits(newVisits);

    if (p.cleanerUpdates) {
      p.cleanerUpdates.forEach(u => {
        setCleaners(prev => prev.map(c => c.id === u.cleanerId ? { ...c, ...u.updates } : c));
      });
    }

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
  };  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Wrench size={20} />
            <h2 className="text-lg font-black">FIX Schedule</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl active:scale-95">
            <X size={20} />
          </button>
        </div>

        {applied && (
          <div className="absolute inset-0 bg-green-600/90 z-50 flex flex-col items-center justify-center text-white">
            <Check size={48} className="mb-3" />
            <p className="text-xl font-black">Fix Applied!</p>
            <p className="text-sm font-medium mt-1">Routes recalculated</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 'issue' && (
            <>
              <p className="text-sm font-bold text-slate-700">What happened?</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setIssueType('client-cancel'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-red-300">
                  <CalendarX size={24} className="text-red-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Client Cancel</p>
                  <p className="text-xs text-slate-500">Client can't make their clean</p>
                </button>
                <button onClick={() => { setIssueType('client-earlier'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-amber-300">
                  <CalendarClock size={24} className="text-amber-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Client Earlier</p>
                  <p className="text-xs text-slate-500">Client needs to move earlier</p>
                </button>
                <button onClick={() => { setIssueType('client-later'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-amber-300">
                  <CalendarClock size={24} className="text-amber-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Client Later</p>
                  <p className="text-xs text-slate-500">Client needs to move later</p>
                </button>
                <button onClick={() => { setIssueType('cleaner-sick'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-blue-300">
                  <UserX size={24} className="text-blue-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Cleaner Sick</p>
                  <p className="text-xs text-slate-500">Cleaner can't work today</p>
                </button>
                <button onClick={() => { setIssueType('cleaner-late-start'); setIssueTime('10:00'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-purple-300">
                  <Clock size={24} className="text-purple-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Late Start</p>
                  <p className="text-xs text-slate-500">Cleaner can't start until...</p>
                </button>
                <button onClick={() => { setIssueType('cleaner-early-leave'); setIssueTime('14:00'); setSelectedIds([]); setStep('affected'); }} className="p-4 rounded-xl border-2 text-left transition-all bg-white border-slate-200 hover:border-purple-300">
                  <Clock size={24} className="text-purple-500 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Early Leave</p>
                  <p className="text-xs text-slate-500">Cleaner must leave by...</p>
                </button>
              </div>
            </>
          )}

          {step === 'affected' && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep('issue')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                  <ArrowLeft size={16} />
                </button>
                <p className="text-sm font-bold text-slate-700">
                  {issueType?.startsWith('client') ? 'Which client(s)?' : 'Which cleaner(s)?'}
                </p>
              </div>

              {issueType?.startsWith('client') && (
                <div className="space-y-2">
                  {dayVisits.map(v => (
                    <label key={v.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedIds.includes(v.clientId) ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <input type="checkbox" checked={selectedIds.includes(v.clientId)} onChange={() => toggleSelected(v.clientId)} className="w-5 h-5 rounded border-slate-300 text-red-600" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{v.clientName}</p>
                        <p className="text-xs text-slate-500">{v.startTime} • {v.clientAddress}</p>
                      </div>
                    </label>
                  ))}
                  {dayVisits.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No visits today.</p>}
                </div>
              )}

              {issueType?.startsWith('cleaner') && (
                <div className="space-y-2">
                  {activeCleaners.map(c => (
                    <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedIds.includes(c.id) ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelected(c.id)} className="w-5 h-5 rounded border-slate-300 text-blue-600" />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-800">{c.name} {c.isDriver ? '(Driver)' : ''}</p>
                        <p className="text-xs text-slate-500">{dayVisits.filter(v => (v.assignedCleanerIds || []).includes(c.id)).length} visits today</p>
                      </div>
                    </label>
                  ))}
                  {(issueType === 'cleaner-late-start' || issueType === 'cleaner-early-leave') && selectedIds.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        {issueType === 'cleaner-late-start' ? 'Cannot start before' : 'Must leave by'}
                      </label>
                      <input type="time" value={issueTime} onChange={e => setIssueTime(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold" />
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setStep('solutions')}
                disabled={selectedIds.length === 0}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Wrench size={16} /> Generate Fix Suggestions
              </button>
            </>
          )}

          {step === 'solutions' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-700">{proposals.length} suggestion{proposals.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setStep('affected')} className="text-xs font-bold text-blue-600 hover:underline">Back</button>
              </div>

              {proposals.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                  <AlertCircle size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500 font-medium">No automatic suggestions.</p>
                  <p className="text-xs text-slate-400 mt-1">Try different selections or edit manually.</p>
                </div>
              )}

              {proposals.map((p, idx) => (
                <div key={p.id} className="rounded-xl border-2 border-slate-200 overflow-hidden mb-3">
                  <div className={`p-3 ${idx === 0 ? 'bg-green-50 border-b border-green-200' : idx === 1 ? 'bg-blue-50 border-b border-blue-200' : 'bg-amber-50 border-b border-amber-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white ${idx === 0 ? 'bg-green-500' : idx === 1 ? 'bg-blue-500' : 'bg-amber-500'}`}>{idx + 1}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{p.title}</p>
                          <p className="text-[10px] text-slate-500">{p.subtitle}</p>
                        </div>
                      </div>
                      <button onClick={() => applyProposal(p)} className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-1">
                        <Check size={12} /> Apply
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Changes</p>
                      <div className="space-y-1">
                        {p.changes.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700"><ChevronRight size={10} className="text-blue-500 shrink-0" />{c}</div>
                        ))}
                      </div>
                    </div>
                    {p.calls.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Who to contact</p>
                        <div className="space-y-1">
                          {p.calls.map((call, i) => (
                            <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${call.type === 'client' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
                              <Phone size={10} className="shrink-0" />
                              <span className="font-bold">{call.name}:</span>
                              <span>{call.message}</span>
                              {call.phone && <a href={`tel:${call.phone}`} className="ml-auto text-[10px] font-bold underline">Call</a>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                <button onClick={() => setProposalSet(s => s + 1)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors active:scale-95 flex items-center justify-center gap-2">
                  <RotateCcw size={14} /> Get 3 More Options
                </button>
                <button onClick={() => onClose()} className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-100 transition-colors active:scale-95 flex items-center justify-center gap-2">
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