import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { checkConstraints } from '../utils/scheduler';
import { formatTotalHours, formatOnSiteHours } from '../utils/hours';
import { VisitDetailModal } from './VisitDetailModal';
import { Clock, MapPin, AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Ban, Star, LayoutGrid, CalendarDays, Calendar as CalendarIcon, XCircle, Phone } from 'lucide-react';
import {
  format, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isSameDay, getDay, startOfWeek, endOfWeek
} from 'date-fns';

type ViewMode = 'day' | 'week' | 'month';

export const ScheduleBoard: React.FC = () => {
  const { visits, setVisits, cleaners, setCleaners, clients, teams, selectedDate, setSelectedDate } = useAppContext();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [modalVisitId, setModalVisitId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentMonth(selectedDate);
  }, [selectedDate]);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayVisits = visits
    .filter(v => v.date === dateStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const violations = useMemo(() => checkConstraints(dayVisits, cleaners, clients, teams), [dayVisits, cleaners, clients, teams]);
  const getViolationsForVisit = (visitId: string) => violations.filter(v => v.visitId === visitId);

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const hasMorningIssues = errorCount > 0 || warningCount > 0;

  const goPrev = () => {
    if (viewMode === 'month') {
      setCurrentMonth(subMonths(currentMonth, 1));
    } else {
      setSelectedDate(subDays(selectedDate, 1));
    }
  };

  const goNext = () => {
    if (viewMode === 'month') {
      setCurrentMonth(addMonths(currentMonth, 1));
    } else {
      setSelectedDate(addDays(selectedDate, 1));
    }
  };

  const goToday = () => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentMonth(now);
  };

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayIndex = getDay(monthStart);
  const paddingDays = Array.from({ length: startDayIndex }, () => null);
  const calendarDays = [...paddingDays, ...daysInMonth];

  const getDayVisitCount = (d: Date) => visits.filter(v => v.date === format(d, 'yyyy-MM-dd') && !v.cancelled).length;
  const getDayHasError = (d: Date) => {
    const ds = format(d, 'yyyy-MM-dd');
    const dVisits = visits.filter(v => v.date === ds);
    const vios = checkConstraints(dVisits, cleaners, clients, teams);
    return vios.some(v => v.severity === 'error');
  };

  const stats = {
    total: dayVisits.length,
    cancelled: dayVisits.filter(v => v.cancelled).length,
    errors: errorCount,
    warnings: warningCount,
  };

  const markCleanerSick = (cleanerId: string) => {
    if (confirm('Mark this cleaner as sick/inactive for today?')) {
      setCleaners(cleaners.map(c => c.id === cleanerId ? { ...c, active: false } : c));
    }
  };

  const cancelVisit = (visitId: string) => {
    if (confirm('Cancel this visit?')) {
      setVisits(visits.map(v => v.id === visitId ? { ...v, cancelled: true } : v));
    }
  };

  const modalVisit = modalVisitId ? dayVisits.find(v => v.id === modalVisitId) || null : null;
  const modalViolations = modalVisit ? getViolationsForVisit(modalVisit.id) : [];

  return (
    <div className="space-y-4 animate-slide-up">
      {/* MORNING ALERT BANNER */}
      {isSameDay(selectedDate, new Date()) && hasMorningIssues && (
        <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl p-4 text-white shadow-xl shadow-red-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider">Morning Alert</h2>
              <p className="text-xs text-red-100 font-medium">
                {errorCount} error{errorCount !== 1 ? 's' : ''} • {warningCount} warning{warningCount !== 1 ? 's' : ''} on today's schedule
              </p>
            </div>
          </div>
          <p className="text-xs text-red-100 mb-3 leading-relaxed">
            Tap any visit card below to see details, or use the quick actions to mark sick cleaners or cancel visits.
          </p>
        </div>
      )}

      {/* View Mode Toggle */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-sm flex gap-1">
        {(['day', 'week', 'month'] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
              viewMode === mode
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {mode === 'day' && <CalendarIcon size={14} />}
            {mode === 'week' && <CalendarDays size={14} />}
            {mode === 'month' && <LayoutGrid size={14} />}
            {mode}
          </button>
        ))}
      </div>

      {/* Date Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={goPrev} className="p-2 rounded-xl hover:bg-slate-100 active:scale-95 transition-all">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>

          <div className="text-center">
            {viewMode === 'month' ? (
              <h2 className="text-lg font-black text-slate-800">{format(currentMonth, 'MMMM yyyy')}</h2>
            ) : (
              <>
                <h2 className="text-lg font-black text-slate-800">{format(selectedDate, 'EEEE, MMM d')}</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {dayVisits.length} visit{dayVisits.length !== 1 ? 's' : ''}
                </p>
              </>
            )}
          </div>

          <button onClick={goNext} className="p-2 rounded-xl hover:bg-slate-100 active:scale-95 transition-all">
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>

        {!isSameDay(selectedDate, new Date()) && viewMode !== 'month' && (
          <div className="text-center mb-2">
            <button onClick={goToday} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100 hover:bg-blue-100 transition-colors">
              Jump to Today
            </button>
          </div>
        )}

        {/* DAY VIEW — small horizontal day selector */}
        {viewMode === 'day' && (
          <div className="flex justify-between gap-1">
            {weekDays.map(d => {
              const isSelected = isSameDay(d, selectedDate);
              const ds = format(d, 'yyyy-MM-dd');
              const count = visits.filter(v => v.date === ds && !v.cancelled).length;
              const isToday = isSameDay(d, new Date());
              const hasErr = getDayHasError(d);
              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(d)}
                  className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl flex-1 transition-all active:scale-95 relative ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md'
                      : isToday
                      ? 'bg-blue-50 text-blue-600 border border-blue-200'
                      : hasErr
                      ? 'bg-red-50 text-red-600 border border-red-100'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase">{format(d, 'EEE')}</span>
                  <span className="text-sm font-black">{format(d, 'd')}</span>
                  <span className={`text-[9px] font-bold px-1 rounded ${
                    isSelected ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>{count}</span>
                  {hasErr && !isSelected && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />}
                </button>
              );
            })}
          </div>
        )}

        {/* WEEK VIEW — 7 day cards like month view */}
        {viewMode === 'week' && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                const count = getDayVisitCount(day);
                const hasError = getDayHasError(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setSelectedDate(day); setViewMode('day'); }}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 relative ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : isToday
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : hasError
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>{format(day, 'd')}</span>
                    {count > 0 && (
                      <span className={`text-[9px] font-bold px-1 rounded ${
                        isSelected ? 'bg-white/30 text-white' : hasError ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {count}
                      </span>
                    )}
                    {hasError && !isSelected && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* MONTH VIEW — full calendar grid */}
        {viewMode === 'month' && (
          <>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`pad-${idx}`} className="aspect-square" />;
                const isSelected = isSameDay(day, selectedDate);
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isToday = isSameDay(day, new Date());
                const count = getDayVisitCount(day);
                const hasError = getDayHasError(day);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => { setSelectedDate(day); setViewMode('day'); }}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 relative ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md'
                        : isToday
                        ? 'bg-blue-50 text-blue-600 border border-blue-200'
                        : isCurrentMonth
                        ? 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        : 'bg-transparent text-slate-300'
                    }`}
                  >
                    <span className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>{format(day, 'd')}</span>
                    {count > 0 && (
                      <span className={`text-[9px] font-bold px-1 rounded ${
                        isSelected ? 'bg-white/30 text-white' : hasError ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {count}
                      </span>
                    )}
                    {hasError && !isSelected && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-black text-slate-800">{stats.total}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase">Total</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-black text-red-600">{stats.cancelled}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase">Cancelled</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-black text-red-600">{stats.errors}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase">Errors</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
          <div className="text-lg font-black text-amber-500">{stats.warnings}</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase">Warnings</div>
        </div>
      </div>

      {/* Visit Cards — ONLY in Day view */}
      {viewMode === 'day' && (
        <>
          {dayVisits.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
              <Clock className="mx-auto mb-3 text-slate-300" size={40} />
              <p className="text-slate-500 font-medium">No visits scheduled for this day.</p>
              <p className="text-xs text-slate-400 mt-1">Go to "Build" tab to add visits or import from Jobber.</p>
            </div>
          )}

          <div className="space-y-3">
            {dayVisits.map(visit => {
              const visitViolations = getViolationsForVisit(visit.id);
              const hasError = visitViolations.some(v => v.severity === 'error');
              const hasWarning = visitViolations.some(v => v.severity === 'warning');
              const team = teams.find(t => t.id === visit.assignedTeamId);
              const client = clients.find(c => c.id === visit.clientId);

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
                <div
                  key={visit.id}
                  className={`bg-white rounded-2xl border-2 p-4 transition-all ${
                    visit.cancelled
                      ? 'border-slate-200 opacity-50 grayscale'
                      : hasError
                      ? 'border-red-300 shadow-sm shadow-red-100'
                      : hasWarning
                      ? 'border-amber-300 shadow-sm shadow-amber-100'
                      : 'border-white shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <button
                      onClick={() => setModalVisitId(visit.id)}
                      className="text-left min-w-0 flex-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-bold text-sm ${visit.cancelled ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {visit.clientName}
                        </h3>
                        {client?.preferredCleaners.length ? <Star size={12} className="text-amber-400 shrink-0" /> : null}
                        {client?.avoidCleaners.length ? <Ban size={12} className="text-red-400 shrink-0" /> : null}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{visit.clientAddress}</p>
                    </button>
                    <div className="flex gap-1 shrink-0">
                      {visitViolations.map((v, i) => (
                        v.severity === 'error'
                          ? <AlertCircle key={i} size={18} className="text-red-500" />
                          : <AlertTriangle key={i} size={18} className="text-amber-500" />
                      ))}
                    </div>
                  </div>

                  <button onClick={() => setModalVisitId(visit.id)} className="text-left w-full">
                    <div className="flex items-center gap-3 text-xs text-slate-600 mb-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-slate-400" />
                        <span className="font-bold">{visit.startTime}</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-lg">
                        <span className="text-slate-500 font-medium">{totalHours}</span>
                        <span className="text-slate-300">|</span>
                        <span className="text-purple-600 font-bold">{onSiteHours}</span>
                      </div>
                      {visit.clientZone && (
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400" />
                          <span className="text-slate-500">{visit.clientZone}</span>
                        </div>
                      )}
                    </div>
                  </button>

                  {!visit.cancelled && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {assignedCleaners.map(c => (
                          <button
                            key={c!.id}
                            onClick={() => markCleanerSick(c!.id)}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 flex items-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors active:scale-95 border border-transparent hover:border-red-200"
                            title="Tap to mark sick"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c!.active ? (c!.color || '#94a3b8') : '#ef4444' }} />
                            {c!.name}
                            {!c!.active && <span className="text-red-600 font-black">(SICK)</span>}
                          </button>
                        ))}
                        {assignedCleaners.length === 0 && team && (
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-100 text-red-600">No active cleaners assigned</span>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => cancelVisit(visit.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-amber-200 hover:bg-amber-100 transition-colors active:scale-95"
                        >
                          <XCircle size={12} /> Cancel Visit
                        </button>
                        <button
                          onClick={() => setModalVisitId(visit.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-blue-200 hover:bg-blue-100 transition-colors active:scale-95"
                        >
                          <Phone size={12} /> Details
                        </button>
                      </div>
                    </div>
                  )}

                  {visitViolations.length > 0 && !visit.cancelled && (
                    <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                      {visitViolations.map((v, i) => (
                        <p key={i} className={`text-[11px] font-medium flex items-center gap-1 ${v.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                          {v.severity === 'error' ? <AlertCircle size={10} /> : <AlertTriangle size={10} />}
                          {v.message}
                        </p>
                      ))}
                    </div>
                  )}

                  {visit.cancelled && (
                    <div className="mt-2 text-center">
                      <span className="inline-block px-3 py-1 bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full">Cancelled</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {modalVisit && (
        <VisitDetailModal
          visit={modalVisit}
          cleaners={cleaners}
          clients={clients}
          teams={teams}
          violations={modalViolations}
          onClose={() => setModalVisitId(null)}
        />
      )}
    </div>
  );
};