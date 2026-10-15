import React from 'react';
import { STATUS_STYLES, STATUS_LABELS, PRIORITY_STYLES } from '../utils/formatters';
import { AlertTriangle, Clock } from 'lucide-react';

export function StatusBadge({ status, isOverdue = false }) {
  const cls = STATUS_STYLES[status] || 'bg-[#f5f5f0] text-[#555] border-[#d4d4d4]';
  const label = STATUS_LABELS[status] || status;
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
        {label}
      </span>
      {isOverdue && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-600 text-white shadow-sm">
          <AlertTriangle className="w-3 h-3" /> Overdue
        </span>
      )}
    </div>
  );
}

export function PriorityBadge({ priority }) {
  const cls = PRIORITY_STYLES[priority] || PRIORITY_STYLES.MEDIUM;
  const label = priority ? priority.charAt(0).toUpperCase() + priority.slice(1).toLowerCase() : 'Medium';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${cls}`}>
      {label}
    </span>
  );
}

export function OccurrenceBadge({ type }) {
  const labels = {
    ONE_TIME: 'One-Time',
    DAILY: 'Daily',
    WEEKLY: 'Weekly',
    MONTHLY: 'Monthly',
    RECURRING_DAILY: 'Daily',
    RECURRING_WEEKLY: 'Weekly',
    RECURRING_MONTHLY: 'Monthly'
  };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#f5f5f0] text-[#555] border border-[#d4d4d4]">
      <Clock className="w-3 h-3" />
      {labels[type] || type || 'One-Time'}
    </span>
  );
}
