import React from 'react';
import type { Visit, Cleaner, Client, Team, ConstraintViolation } from '../types';
import { formatTotalHours } from '../utils/hours';
import { X, Phone, MapPin, Clock, Users, AlertCircle, AlertTriangle, FileText, Ban } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface Props {
  visit: Visit;
  cleaners: Cleaner[];
  clients: Client[];
  teams: Team[];
  violations: ConstraintViolation[];
  onClose: () => void;
}

export const VisitDetailModal: React.FC<Props> = ({ visit, cleaners, clients, teams, violations, onClose }) => {
  const client = clients.find(c => c.id === visit.clientId);
  const team = teams.find(t => t.id === visit.assignedTeamId);

  let assignedCleanerIds = visit.assignedCleanerIds || [];
  if (assignedCleanerIds.length === 0 && team) {
    assignedCleanerIds = team.cleanerIds;
  }
  const assignedCleaners = assignedCleanerIds
    .map(id => cleaners.find(c => c.id === id))
    .filter(Boolean);

  const hasError = violations.some(v => v.severity === 'error');
  const hasWarning = violations.some(v => v.severity === 'warning');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Visit Details</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Client Card */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <h3 className="text-sm font-bold text-blue-900 mb-1">{visit.clientName}</h3>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-xs text-blue-800">
                <MapPin size={12} className="mt-0.5 shrink-0" />
                <span>{visit.clientAddress}</span>
              </div>
              {visit.clientZone && (
                <div className="flex items-center gap-2 text-xs text-blue-700 font-medium">
                  <span className="bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold">Zone</span>
                  {visit.clientZone}
                </div>
              )}
              {client?.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-xs text-blue-700 font-bold hover:underline">
                  <Phone size={12} /> {client.phone}
                </a>
              )}
              {client?.notes && (
                <div className="flex items-start gap-2 text-xs text-blue-700 mt-1">
                  <FileText size={12} className="mt-0.5 shrink-0" />
                  <span className="italic">{client.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Visit Info Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date</div>
              <div className="text-sm font-bold text-slate-700">
                {visit.date ? format(parseISO(visit.date), 'EEE, MMM d, yyyy') : '—'}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Time</div>
              <div className="text-sm font-bold text-slate-700">{visit.startTime}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Duration</div>
              <div className="text-sm font-bold text-slate-700">{formatTotalHours(visit.durationMinutes)}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Team</div>
              <div className="text-sm font-bold text-slate-700">{team?.name || 'Unassigned'}</div>
            </div>
          </div>

          {/* Cleaners */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Users size={12} /> Assigned Cleaners
            </div>
            <div className="space-y-2">
              {assignedCleaners.map(c => (
                <div key={c!.id} className={`flex items-center justify-between p-2 rounded-xl border ${c!.active ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c!.color || '#94a3b8' }} />
                    <span className={`text-xs font-bold ${c!.active ? 'text-slate-700' : 'text-red-700 line-through'}`}>{c!.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c!.phone && (
                      <a href={`tel:${c!.phone}`} className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Phone size={12} />
                      </a>
                    )}
                    {!c!.active && <span className="text-[10px] font-black text-red-600 uppercase">Sick</span>}
                  </div>
                </div>
              ))}
              {assignedCleaners.length === 0 && (
                <p className="text-xs text-slate-400 italic">No cleaners assigned</p>
              )}
            </div>
          </div>

          {/* Violations */}
          {violations.length > 0 && (
            <div className={`rounded-xl p-3 border ${hasError ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                {hasError ? <AlertCircle size={12} className="text-red-600" /> : <AlertTriangle size={12} className="text-amber-600" />}
                <span className={hasError ? 'text-red-700' : 'text-amber-700'}>Schedule Issues</span>
              </div>
              <div className="space-y-1">
                {violations.map((v, i) => (
                  <p key={i} className={`text-xs font-medium ${v.severity === 'error' ? 'text-red-600' : 'text-amber-700'}`}>
                    • {v.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Cancelled Badge */}
          {visit.cancelled && (
            <div className="bg-slate-100 rounded-xl p-3 text-center">
              <span className="inline-flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest">
                <Ban size={12} /> Visit Cancelled
              </span>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4 flex gap-2 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};