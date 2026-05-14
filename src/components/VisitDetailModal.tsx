import React, { useState } from 'react';
import { X, Clock, MapPin, Phone, Mail, Calendar, FileText, User, AlertCircle, AlertTriangle, Pencil, Save, RotateCcw, Car, Ban, Star } from 'lucide-react';
import type { Visit, Cleaner, Client, ConstraintViolation } from '../types';
import { checkConstraints } from '../utils/scheduler';
import { format, parse } from 'date-fns';

interface VisitDetailModalProps {
  visit: Visit;
  cleaners: Cleaner[];
  clients: Client[];
  teams: any[];
  violations: ConstraintViolation[];
  onClose: () => void;
  onSave?: (updatedVisit: Visit) => void;
}

export const VisitDetailModal: React.FC<VisitDetailModalProps> = ({
  visit,
  cleaners,
  clients,
  teams,
  violations: originalViolations,
  onClose,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState(visit.date);
  const [editTime, setEditTime] = useState(visit.startTime);
  const [editCleanerIds, setEditCleanerIds] = useState<string[]>(visit.assignedCleanerIds || []);

  const client = clients.find(c => c.id === visit.clientId);
  const assignedCleaners = (visit.assignedCleanerIds || [])
    .map(id => cleaners.find(c => c.id === id))
    .filter(Boolean);

  const totalHours = ((visit.durationMinutes || 0) / 60).toFixed(1);

  // Preview violations for the edited visit
  const previewViolations = (() => {
    if (!isEditing) return [];
    const previewVisit: Visit = {
      ...visit,
      date: editDate,
      startTime: editTime,
      assignedCleanerIds: editCleanerIds,
    };
    return checkConstraints([previewVisit], cleaners, clients, teams);
  })();

  const handleSave = () => {
    if (!onSave) return;
    const updated: Visit = {
      ...visit,
      date: editDate,
      startTime: editTime,
      assignedCleanerIds: editCleanerIds,
    };
    onSave(updated);
    setIsEditing(false);
  };

  const toggleCleaner = (id: string) => {
    setEditCleanerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const activeCleaners = cleaners.filter(c => c.active);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-black text-slate-800">{visit.clientName}</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {visit.jobType || 'Cleaning Visit'}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!isEditing && onSave && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 rounded-xl hover:bg-blue-50 text-blue-600 active:scale-95 transition-all"
                title="Edit visit"
              >
                <Pencil size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 active:scale-95 transition-all"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Original violations (read-only) */}
          {!isEditing && originalViolations.length > 0 && (
            <div className="space-y-2">
              {originalViolations.map(v => (
                <div
                  key={v.id}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-xs font-medium ${
                    v.severity === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {v.severity === 'error'
                    ? <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    : <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  }
                  {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Preview violations while editing */}
          {isEditing && previewViolations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Preview Conflicts</p>
              {previewViolations.map(v => (
                <div key={v.id} className={`flex items-start gap-2 text-xs font-medium ${v.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                  {v.severity === 'error' ? <AlertCircle size={12} className="shrink-0 mt-0.5" /> : <AlertTriangle size={12} className="shrink-0 mt-0.5" />}
                  {v.message}
                </div>
              ))}
            </div>
          )}

          {/* Info Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</span>
              </div>
              {isEditing ? (
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-xs font-bold text-slate-800">{visit.date}</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Start Time</span>
              </div>
              {isEditing ? (
                <input
                  type="time"
                  value={editTime}
                  onChange={e => setEditTime(e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <p className="text-xs font-bold text-slate-800">{visit.startTime}</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Duration</span>
              </div>
              <p className="text-xs font-bold text-slate-800">{totalHours} hrs ({visit.durationMinutes || 0} min)</p>
            </div>
          </div>

          {/* Address */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={12} className="text-slate-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Address</span>
            </div>
            <p className="text-xs font-medium text-slate-700">{visit.clientAddress || client?.address || 'No address on file'}</p>
            {visit.clientZone && (
              <p className="text-[10px] text-slate-500 mt-1">Zone: {visit.clientZone}</p>
            )}
          </div>

          {/* Assigned Cleaners */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <User size={12} className="text-slate-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                {isEditing ? `Select Cleaners (${editCleanerIds.length})` : 'Assigned Cleaners'}
              </span>
            </div>
            {isEditing ? (
              <div className="flex flex-wrap gap-1.5">
                {activeCleaners.map(c => {
                  const isSelected = editCleanerIds.includes(c.id);
                  const isAvoided = client?.avoidCleaners.includes(c.id);
                  const isPreferred = client?.preferredCleaners.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => { if (!isAvoided) toggleCleaner(c.id); }}
                      disabled={isAvoided}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all active:scale-95 flex items-center gap-1 ${
                        isAvoided
                          ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed opacity-60'
                          : isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSelected ? 'white' : (c.color || '#94a3b8') }} />
                      {c.isDriver && <Car size={8} className={isSelected ? 'text-white' : 'text-blue-500'} />}
                      {isPreferred && <Star size={8} className={isSelected ? 'text-yellow-200' : 'text-amber-500'} />}
                      {isAvoided && <Ban size={8} className="text-red-500" />}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assignedCleaners.length > 0 ? (
                  assignedCleaners.map(c => (
                    <span
                      key={c!.id}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c!.color || '#94a3b8' }} />
                      {c!.name}
                      {c!.isDriver && <span className="text-blue-600">(Driver)</span>}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">No cleaners assigned</span>
                )}
              </div>
            )}
          </div>

          {/* Client notes */}
          {client?.notes && (
            <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-amber-500" />
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">House Notes</span>
              </div>
              <p className="text-xs text-amber-800 font-medium">{client.notes}</p>
            </div>
          )}

          {/* Visit notes */}
          {visit.notes && (
            <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-blue-500" />
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Visit Notes</span>
              </div>
              <p className="text-xs text-blue-800 font-medium">{visit.notes}</p>
            </div>
          )}

          {/* Edit action buttons */}
          {isEditing && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={editCleanerIds.length === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors disabled:opacity-40 active:scale-95 flex items-center justify-center gap-2"
              >
                <Save size={14} /> Save Changes
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditDate(visit.date);
                  setEditTime(visit.startTime);
                  setEditCleanerIds(visit.assignedCleanerIds || []);
                }}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors active:scale-95 flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Cancel
              </button>
            </div>
          )}

          {/* Contact */}
          {!isEditing && (client?.phone || client?.email) && (
            <div className="flex gap-2">
              {client?.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors active:scale-95"
                >
                  <Phone size={14} /> Call
                </a>
              )}
              {client?.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-colors active:scale-95"
                >
                  <Mail size={14} /> Email
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};