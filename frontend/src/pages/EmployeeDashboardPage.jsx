import React from 'react';
import { StatusBadge, PriorityBadge, OccurrenceBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/formatters';

export function EmployeeDashboardPage({ dashboardData, onOpenTask }) {
  const { kpis = {}, tasks = [], recent_updates = [] } = dashboardData || {};

  const cards = [
    { label: 'My Pending', value: kpis.my_pending_tasks ?? 0, tone: 'text-[#1a1a1a]' },
    { label: 'In Progress', value: kpis.my_in_progress_tasks ?? 0, tone: 'text-[#1a1a1a]' },
    { label: 'Awaiting Review', value: kpis.awaiting_review_tasks ?? 0, tone: 'text-[#555]' },
    { label: 'Completed', value: kpis.completed_tasks ?? 0, tone: 'text-emerald-600' },
    { label: 'Overdue', value: kpis.overdue_tasks ?? 0, tone: 'text-red-600' },
    { label: 'High / Urgent', value: kpis.urgent_tasks ?? 0, tone: 'text-red-500' }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="ent-card p-4 hover:shadow-md transition-shadow duration-200">
            <div className="text-[11px] font-medium text-[#999] uppercase tracking-wider">{c.label}</div>
            <div className={`mt-2 text-2xl font-bold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="ent-card overflow-hidden">
        <div className="p-4 border-b border-[#e5e5e0] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1a1a1a]">My Assigned Tasks</h3>
        </div>
        <div className="divide-y divide-[#f0f0eb]">
          {tasks.length === 0 && (
            <div className="p-8 text-center text-sm text-[#aaa]">No tasks assigned yet.</div>
          )}
          {tasks.map((task) => (
            <div key={task.occurrence_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#fafaf7] transition-colors">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-[#aaa]">{task.occurrence_id}</span>
                  <OccurrenceBadge type={task.occurrence_type} />
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} isOverdue={task.is_overdue} />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.occurrence_id)}
                  className="text-sm font-semibold text-[#1a1a1a] hover:underline underline-offset-2 text-left"
                >
                  {task.task_name}
                </button>
                <div className="text-xs text-[#999]">
                  Due: {formatDateTime(task.due_at)} • Progress: {task.progress_percentage}%
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenTask(task.occurrence_id)}
                className="ent-btn-secondary self-start sm:self-center"
              >
                Open & Submit Update
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
