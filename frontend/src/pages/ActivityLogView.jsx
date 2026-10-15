import React, { useState, useEffect, useCallback } from 'react';
import { Activity, ShieldCheck, Clock, User, Calendar } from 'lucide-react';
import { callBackendApi } from '../services/api';
import { formatDateTime } from '../utils/formatters';

export function ActivityLogView({ showToast }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callBackendApi('getActivityLog', { limit: 50 });
      setLogs(res.activities || []);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to load activity log' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#111111] tracking-tight">Audit & Activity Log</h2>
          <p className="text-xs text-[#777770]">
            Immutable chronological record of logins, task delegations, updates, and reviews.
          </p>
        </div>
      </div>

      <div className="ent-card overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="spinner-lg" />
            <p className="text-xs text-[#888880]">Retrieving audit trail...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-sm text-[#888880]">No recorded actions yet.</div>
        ) : (
          <div className="divide-y divide-[#f0f0eb]">
            {logs.map((log, idx) => (
              <div key={log.log_id || idx} className="p-4 flex items-start gap-3.5 hover:bg-[#fafaf8] transition-colors">
                <div className="w-8 h-8 rounded-lg bg-[#111111] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#111111]">{log.action_type || 'SYSTEM_ACTION'}</span>
                    <span className="text-[11px] text-[#888880] flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(log.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[#444440] mt-1 leading-relaxed">
                    {log.description || log.message || JSON.stringify(log.details || {})}
                  </p>
                  <div className="text-[11px] text-[#888880] mt-1 flex items-center gap-2">
                    <span>By: {log.performer_name || log.user_id || 'System'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
