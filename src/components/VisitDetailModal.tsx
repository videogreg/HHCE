import React from 'react';
import type { Visit, Cleaner, Client, Team } from '../types';
import { formatTotalHours, formatOnSiteHours } from '../utils/hours';
import { X, Clock, MapPin, Users, Phone, FileText, Star, Ban, AlertCircle, AlertTriangle, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface VisitDetailModalProps {
  visit: Visit;
  cleaners: Cleaner[];
  clients: Client[];
  teams: Team[];
  violations: { severity: 'error' | 'warning'; message: string }[];
  onClose: () => void;
}

export const VisitDetailModal: React.FC<VisitDetailModalProps> = ({
  visit, cleaners, clients, teams, violations, onClose
}) => {
  const client = clients.find(c => c.id === visit.clientId);
  const team = teams.find(t => t.id === visit.assignedTeamId);

  let assignedCleanerIds = visit.assignedCleanerIds || [];
  if (assignedCleanerIds.length === 0 && team) {
    assignedCleanerIds = team.cleanerIds;
  }
  const assignedCleaners = assignedCleanerIds
    .map(id => cleaners.find(c => c.id === id))
    .filter(Boolean);

  const cleanerCount = assignedCleaners.length;
  const totalHours = formatTotalHours(visit.durationMinutes);
  const onSiteHours = formatOnSiteHours(visit.durationMinutes, cleanerCount);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-start justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-slate-800">{visit.clientName}</h2>
            <p className="text-xs text-slate-400 font-medium">{format(parseISO(visit.date), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Time & Hours */}
          <div className="bg-slate-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Clock size={16} className="text-blue-500" />
                <span className="font-bold">{visit.startTime}</span>
              </div>
              <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200">
                {totalHours} total hrs
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Users size={16} className="text-purple-500" />
                <span className="font-medium">{cleanerCount} cleaner{cleanerCount !== 1 ? 's' : ''}</span>
              </div>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded-lg border border-purple-200">
                {onSiteHours} hrs on-site
              </span>
            </div>
            {visit.clientZone && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={14} className="text-slate-400" />
                {visit.clientZone}
              </div>
            )}
          </div>

          {/* Address */}
          <div className="flex items-start gap-2 text-sm text-slate-600">
            <MapPin size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <span>{visit.clientAddress || 'No address on file'}</span>
          </div>

          {/* Client Details */}
          {client && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client Preferences</h3>
              {client.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone size={14} className="text-slate-400" />
                  {client.phone}
                </div>
              )}
              {client.preferredDays.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Calendar size={14} className="text-slate-400" />
                  Prefers: {client.preferredDays.join(', ')}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Clock size={14} className="text-slate-400" />
                Window: {client.notBefore || 'Any'} - {client.notAfter || 'Any'}
              </div>
              {client.notes && (
                <div className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-100 rounded-lg p-2">
                  <FileText size={14} className="text-amber-500 shrink-0 mt-0.5" />
                  {client.notes}
                </div>
              )}
              {client.preferredCleaners.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <Star size={14} className="text-amber-400" />
                  Prefers: {client.preferredCleaners.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                </div>
              )}
              {client.avoidCleaners.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-700">
                  <Ban size={14} className="text-red-400" />
                  Avoids: {client.avoidCleaners.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Assigned Cleaners */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Assigned Cleaners ({cleanerCount})
            </h3>
            <div className="space-y-2">
              {assignedCleaners.map(c => (
                <div key={c!.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: c!.color || '#94a3b8' }}>
                    {c!.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{c!.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {c!.isDriver ? 'Driver' : 'Non-driver'} • {c!.canStartAt || 'Any'} - {c!.mustBeOffBy || 'Any'}
                    </p>
                  </div>
                  {c!.phone && (
                    <a href={`tel:${c!.phone}`} className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100">
                      Call
                    </a>
                  )}
                </div>
              ))}
              {assignedCleaners.length === 0 && (
                <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl p-3">
                  No cleaners assigned to this visit.
                </p>
              )}
            </div>
          </div>

          {/* Team */}
          {team && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Users size={14} />
              Team: <span className="font-bold" style={{ color: team.color || '#64748b' }}>{team.name}</span>
            </div>
          )}

          {/* Violations */}
          {violations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle size={12} /> Issues
              </h3>
              {violations.map((v, i) => (
                <div key={i} className={`text-xs font-medium flex items-start gap-1.5 p-2 rounded-lg ${
                  v.severity === 'error' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                }`}>
                  {v.severity === 'error' ? <AlertCircle size={12} className="shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
                  {v.message}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer close */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 p-4">
          <button
            onClick={onClose}
            className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-colors active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
