import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatHrsMins } from '../utils/hours';
import {
  BarChart3, Download, Share2, Mail, Phone, Calendar, Clock, MapPin,
  User, Users, ChevronLeft, FileText, TrendingUp, CheckCircle, X
} from 'lucide-react';

type ReportType = 'team-hours' | 'client-history' | 'analytics';

export const Reports: React.FC = () => {
  const { visits, cleaners, clients, teams } = useAppContext();
  const [reportType, setReportType] = useState<ReportType>('team-hours');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [selectedCleanerId, setSelectedCleanerId] = useState<string>('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [shareOpen, setShareOpen] = useState(false);

  const dateRangeVisits = useMemo(() => {
    return visits.filter(v => v.date >= startDate && v.date <= endDate && !v.cancelled);
  }, [visits, startDate, endDate]);

  // ============== TEAM HOURS REPORT ==============
  const teamHoursData = useMemo(() => {
    const data: { cleanerId: string; name: string; totalMinutes: number; cleanMinutes: number; visits: number; days: number }[] = [];
    const cleanersList = selectedCleanerId ? cleaners.filter(c => c.id === selectedCleanerId) : cleaners;
    
    for (const cleaner of cleanersList) {
      const cleanerVisits = dateRangeVisits.filter(v => {
        let ids = v.assignedCleanerIds || [];
        if (ids.length === 0) {
          const team = teams.find(t => t.id === v.assignedTeamId);
          if (team) ids = team.cleanerIds;
        }
        return ids.includes(cleaner.id);
      });
      
      if (cleanerVisits.length === 0) continue;
      
      const cleanMinutes = cleanerVisits.reduce((sum, v) => sum + v.durationMinutes, 0);
      // Estimate travel: 15 min per visit after first
      const travelMinutes = cleanerVisits.length > 1 ? (cleanerVisits.length - 1) * 15 : 0;
      const totalMinutes = cleanMinutes + travelMinutes;
      const uniqueDays = new Set(cleanerVisits.map(v => v.date)).size;
      
      data.push({
        cleanerId: cleaner.id,
        name: cleaner.name,
        totalMinutes,
        cleanMinutes,
        visits: cleanerVisits.length,
        days: uniqueDays,
      });
    }
    return data.sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [dateRangeVisits, cleaners, selectedCleanerId, teams]);

  // ============== CLIENT HISTORY REPORT ==============
  const clientHistoryData = useMemo(() => {
    const clientVisits = selectedClientId
      ? dateRangeVisits.filter(v => v.clientId === selectedClientId)
      : dateRangeVisits;
    
    return clientVisits.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [dateRangeVisits, selectedClientId]);

  // ============== ANALYTICS REPORT ==============
  const analyticsData = useMemo(() => {
    const totalVisits = dateRangeVisits.length;
    const completedVisits = dateRangeVisits.filter(v => (v.finishedCleanerIds || []).length > 0).length;
    const totalCleanMinutes = dateRangeVisits.reduce((sum, v) => sum + v.durationMinutes, 0);
    const avgDuration = totalVisits > 0 ? Math.round(totalCleanMinutes / totalVisits) : 0;
    const uniqueClients = new Set(dateRangeVisits.map(v => v.clientId)).size;
    const uniqueCleaners = new Set(dateRangeVisits.flatMap(v => {
      let ids = v.assignedCleanerIds || [];
      if (ids.length === 0) {
        const team = teams.find(t => t.id === v.assignedTeamId);
        if (team) ids = team.cleanerIds;
      }
      return ids;
    })).size;
    
    // By day
    const byDay: Record<string, number> = {};
    for (const v of dateRangeVisits) {
      byDay[v.date] = (byDay[v.date] || 0) + 1;
    }
    const busiestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    
    return { totalVisits, completedVisits, avgDuration, uniqueClients, uniqueCleaners, busiestDay };
  }, [dateRangeVisits, teams]);

  // ============== CSV EXPORT ==============
  const downloadCSV = (filename: string, rows: string[][]) => {
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTeamHoursCSV = () => {
    const rows = [
      ['Cleaner', 'Total Hours', 'Clean Hours', 'Travel Hours', 'Visits', 'Days Worked'],
      ...teamHoursData.map(d => [
        d.name,
        formatHrsMins(d.totalMinutes),
        formatHrsMins(d.cleanMinutes),
        formatHrsMins(d.totalMinutes - d.cleanMinutes),
        String(d.visits),
        String(d.days),
      ]),
    ];
    downloadCSV(`Team_Hours_${startDate}_to_${endDate}.csv`, rows);
  };

  const exportClientHistoryCSV = () => {
    const rows = [
      ['Date', 'Client', 'Address', 'Time', 'Duration', 'Team', 'Status'],
      ...clientHistoryData.map(v => {
        const client = clients.find(c => c.id === v.clientId);
        const team = teams.find(t => t.id === v.assignedTeamId);
        let cleanerNames = (v.assignedCleanerIds || []).map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ');
        if (!cleanerNames && team) cleanerNames = team.cleanerIds.map(id => cleaners.find(c => c.id === id)?.name).filter(Boolean).join(', ');
        const isDone = (v.finishedCleanerIds || []).length > 0;
        return [
          v.date, v.clientName, v.clientAddress || client?.address || '', v.startTime,
          `${v.durationMinutes} min`, cleanerNames, isDone ? 'Completed' : 'Scheduled',
        ];
      }),
    ];
    downloadCSV(`Client_History_${startDate}_to_${endDate}.csv`, rows);
  };

  const exportAnalyticsCSV = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Visits', String(analyticsData.totalVisits)],
      ['Completed Visits', String(analyticsData.completedVisits)],
      ['Completion Rate', analyticsData.totalVisits > 0 ? `${Math.round((analyticsData.completedVisits / analyticsData.totalVisits) * 100)}%` : 'N/A'],
      ['Average Clean Duration', `${analyticsData.avgDuration} min`],
      ['Unique Clients', String(analyticsData.uniqueClients)],
      ['Unique Cleaners', String(analyticsData.uniqueCleaners)],
      ['Busiest Day', analyticsData.busiestDay ? `${analyticsData.busiestDay[0]} (${analyticsData.busiestDay[1]} visits)` : 'N/A'],
    ];
    downloadCSV(`Analytics_${startDate}_to_${endDate}.csv`, rows);
  };

  // ============== SHARE ==============
  const getShareText = () => {
    if (reportType === 'team-hours') {
      const lines = teamHoursData.map(d => `${d.name}: ${formatHrsMins(d.totalMinutes)} (${d.visits} visits)`);
      return `Team Hours Report (${startDate} to ${endDate})\n\n${lines.join('\n')}`;
    }
    if (reportType === 'analytics') {
      return `Analytics Report (${startDate} to ${endDate})\n\nTotal Visits: ${analyticsData.totalVisits}\nCompleted: ${analyticsData.completedVisits}\nAvg Duration: ${analyticsData.avgDuration} min\nUnique Clients: ${analyticsData.uniqueClients}`;
    }
    return `Client History Report (${startDate} to ${endDate})\n\n${clientHistoryData.length} visits recorded.`;
  };

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent(`HHCE Report: ${startDate} to ${endDate}`);
    const body = encodeURIComponent(getShareText());
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center text-white shadow-md">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">Reports</h1>
            <p className="text-xs text-slate-500 font-medium">Insights, exports, and analytics</p>
          </div>
        </div>

        {/* Report Type Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {([
            { key: 'team-hours' as ReportType, label: 'Team Hours', icon: <Clock size={14} /> },
            { key: 'client-history' as ReportType, label: 'Client History', icon: <FileText size={14} /> },
            { key: 'analytics' as ReportType, label: 'Analytics', icon: <TrendingUp size={14} /> },
          ]).map(rt => (
            <button
              key={rt.key}
              onClick={() => setReportType(rt.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 ${
                reportType === rt.key
                  ? 'bg-green-600 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {rt.icon} {rt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {reportType === 'team-hours' && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cleaner (optional)</label>
            <select
              value={selectedCleanerId}
              onChange={e => setSelectedCleanerId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Cleaners</option>
              {cleaners.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {reportType === 'client-history' && (
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Client (optional)</label>
            <select
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Clients</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              if (reportType === 'team-hours') exportTeamHoursCSV();
              else if (reportType === 'client-history') exportClientHistoryCSV();
              else exportAnalyticsCSV();
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors active:scale-95 shadow-sm"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition-colors active:scale-95 shadow-sm"
          >
            <Share2 size={14} /> Share
          </button>
        </div>
      </div>

      {/* Report Content */}
      {reportType === 'team-hours' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock size={16} className="text-green-600" /> Team Hours
          </h2>
          {teamHoursData.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No visits found in this date range.</p>
          ) : (
            <div className="space-y-2">
              {teamHoursData.map(d => (
                <div key={d.cleanerId} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cleaners.find(c => c.id === d.cleanerId)?.color || '#94a3b8' }} />
                    <span className="text-sm font-bold text-slate-700">{d.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-green-700">{formatHrsMins(d.totalMinutes)}</span>
                    <p className="text-[10px] text-slate-500">
                      {formatHrsMins(d.cleanMinutes)} clean + {formatHrsMins(d.totalMinutes - d.cleanMinutes)} travel | {d.visits} visits
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reportType === 'client-history' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileText size={16} className="text-blue-600" /> Client Visit History
          </h2>
          {clientHistoryData.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No visits found in this date range.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {clientHistoryData.map(v => {
                const client = clients.find(c => c.id === v.clientId);
                const isDone = (v.finishedCleanerIds || []).length > 0;
                return (
                  <div key={v.id} className="flex items-start justify-between p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">{v.date}</span>
                        <span className="text-xs font-bold text-blue-600">{v.startTime}</span>
                        {isDone && <CheckCircle size={12} className="text-green-600" />}
                      </div>
                      <p className="text-sm font-bold text-slate-800 truncate">{v.clientName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{v.clientAddress || client?.address || ''}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-white px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                      {v.durationMinutes}m
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {reportType === 'analytics' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp size={16} className="text-purple-600" /> Visit Analytics
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total Visits</p>
              <p className="text-2xl font-black text-blue-700">{analyticsData.totalVisits}</p>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Completed</p>
              <p className="text-2xl font-black text-green-700">{analyticsData.completedVisits}</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">Avg Duration</p>
              <p className="text-2xl font-black text-purple-700">{analyticsData.avgDuration}m</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Completion Rate</p>
              <p className="text-2xl font-black text-amber-700">
                {analyticsData.totalVisits > 0 ? `${Math.round((analyticsData.completedVisits / analyticsData.totalVisits) * 100)}%` : 'N/A'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unique Clients</p>
              <p className="text-xl font-black text-slate-700">{analyticsData.uniqueClients}</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unique Cleaners</p>
              <p className="text-xl font-black text-slate-700">{analyticsData.uniqueCleaners}</p>
            </div>
          </div>
          {analyticsData.busiestDay && (
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Busiest Day</p>
              <p className="text-lg font-black text-slate-700">{analyticsData.busiestDay[0]} ({analyticsData.busiestDay[1]} visits)</p>
            </div>
          )}
        </div>
      )}

      {/* Share Modal */}
      {shareOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">Share Report</h3>
              <button onClick={() => setShareOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm text-slate-600">Send this report via WhatsApp or Email.</p>
            <div className="space-y-2">
              <button
                onClick={() => { shareViaWhatsApp(); setShareOpen(false); }}
                className="flex items-center gap-3 w-full py-3 bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-colors active:scale-95"
              >
                <Phone size={18} /> Share via WhatsApp
              </button>
              <button
                onClick={() => { shareViaEmail(); setShareOpen(false); }}
                className="flex items-center gap-3 w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors active:scale-95"
              >
                <Mail size={18} /> Share via Email
              </button>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-500 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {getShareText()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
