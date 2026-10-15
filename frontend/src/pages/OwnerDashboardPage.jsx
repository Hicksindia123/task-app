import React from 'react';
import { StatusBadge, PriorityBadge, OccurrenceBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/formatters';

export function OwnerDashboardPage({ dashboardData, onOpenTask, onQuickCreateTask }) {
  const { kpis = {}, employee_workload = [], recent_employee_updates = [], overdue_alerts = [] } =
    dashboardData || {};

  const kpiCards = [
    { label: 'Total Active Tasks', value: kpis.total_active_tasks ?? 0, tone: 'text-[#1a1a1a]' },
    { label: 'Pending (Assigned)', value: kpis.pending_tasks ?? 0, tone: 'text-[#555]' },
    { label: 'In Progress', value: kpis.in_progress_tasks ?? 0, tone: 'text-[#1a1a1a]' },
    { label: 'Awaiting Review', value: kpis.awaiting_review_tasks ?? 0, tone: 'text-[#555]' },
    { label: 'Completed', value: kpis.completed_tasks ?? 0, tone: 'text-emerald-600' },
    { label: 'Overdue Tasks', value: kpis.overdue_tasks ?? 0, tone: 'text-red-600' },
    { label: 'Blocked Tasks', value: kpis.blocked_tasks ?? 0, tone: 'text-red-500' },
    { label: 'Active Employees', value: kpis.active_employees ?? 0, tone: 'text-[#1a1a1a]' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1a1a1a] tracking-tight">Operations Overview</h2>
          <p className="text-sm text-[#888]">Real-time task status, bottlenecks, and staff workload.</p>
        </div>
        <button type="button" onClick={onQuickCreateTask} className="ent-btn-primary">
          + Delegate New Task
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="ent-card p-4 hover:shadow-md transition-shadow duration-200">
            <div className="text-[11px] font-medium text-[#999] uppercase tracking-wider">{card.label}</div>
            <div className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Overdue & Blocked Alerts */}
      {overdue_alerts.length > 0 && (
        <div className="ent-card p-5 border-l-4 border-l-red-500">
          <h3 className="text-sm font-bold text-[#1a1a1a] mb-3">Immediate Attention Required</h3>
          <div className="divide-y divide-[#f0f0eb]">
            {overdue_alerts.map((task) => (
              <div key={task.occurrence_id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.occurrence_id)}
                    className="text-sm font-semibold text-[#1a1a1a] hover:underline underline-offset-2 text-left"
                  >
                    {task.task_name}
                  </button>
                  <div className="text-xs text-[#999] mt-0.5">
                    Assigned to {task.assigned_user_name} • Due {formatDateTime(task.due_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} isOverdue={task.is_overdue} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee Workload Table */}
      <div className="ent-card overflow-hidden">
        <div className="p-4 border-b border-[#e5e5e0]">
          <h3 className="text-sm font-bold text-[#1a1a1a]">Employee Workload & Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#fafaf7] text-[#888] text-[11px] uppercase tracking-wider border-b border-[#e5e5e0]">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-3 text-right">Assigned</th>
                <th className="py-3 px-3 text-right">In Progress</th>
                <th className="py-3 px-3 text-right">Review</th>
                <th className="py-3 px-3 text-right">Blocked</th>
                <th className="py-3 px-3 text-right">Overdue</th>
                <th className="py-3 px-3 text-right">Done</th>
                <th className="py-3 px-4 text-right">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0eb]">
              {employee_workload.map((emp) => (
                <tr key={emp.user_id} className="hover:bg-[#fafaf7] transition-colors">
                  <td className="py-3 px-4 font-medium text-[#1a1a1a]">
                    {emp.full_name}
                    <div className="text-[11px] text-[#aaa]">{emp.department}</div>
                  </td>
                  <td className="py-3 px-3 text-right text-[#555]">{emp.total_assigned}</td>
                  <td className="py-3 px-3 text-right text-[#1a1a1a] font-medium">{emp.in_progress}</td>
                  <td className="py-3 px-3 text-right text-[#555] font-medium">{emp.awaiting_review}</td>
                  <td className="py-3 px-3 text-right text-red-500 font-medium">{emp.blocked}</td>
                  <td className="py-3 px-3 text-right text-red-600 font-semibold">{emp.overdue}</td>
                  <td className="py-3 px-3 text-right text-emerald-600 font-medium">{emp.completed}</td>
                  <td className="py-3 px-4 text-right font-semibold text-[#1a1a1a]">{emp.completion_rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
