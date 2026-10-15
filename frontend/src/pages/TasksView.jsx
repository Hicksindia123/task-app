import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Filter, Plus, Calendar, User, ArrowUpDown, CheckCircle2 } from 'lucide-react';
import { callBackendApi } from '../services/api';
import { StatusBadge, PriorityBadge, OccurrenceBadge } from '../components/StatusBadge';
import { formatDateTime } from '../utils/formatters';

export function TasksView({ user, onOpenTask, onQuickCreateTask, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callBackendApi('listTasks', {});
      setTasks(res.tasks || []);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to load tasks' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Search filter
      const matchesSearch =
        !searchQuery ||
        (t.task_name && t.task_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.assigned_user_name && t.assigned_user_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.occurrence_id && t.occurrence_id.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status filter
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;

      // Priority filter
      const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter]);

  const isOwner = user?.role === 'OWNER';

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#111111] tracking-tight">
            {isOwner ? 'All Tasks & Delegations' : 'My Assigned Tasks'}
          </h2>
          <p className="text-xs text-[#777770]">
            {isOwner
              ? 'Track progress, review employee submissions, and manage workloads.'
              : 'Work on your assigned tasks, report progress, and submit completions.'}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onQuickCreateTask}
            className="ent-btn-primary self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Delegate Task
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="ent-card p-4 flex flex-col md:flex-row items-center justify-between gap-3 bg-white">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#999990] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, employee, or ID..."
            className="ent-input pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-[#777770]">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-semibold">Filter:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ent-input py-1.5 px-3 text-xs w-auto font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="ASSIGNED">Assigned (Pending)</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="BLOCKED">Blocked</option>
            <option value="AWAITING_REVIEW">Awaiting Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="ON_HOLD">On Hold</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="ent-input py-1.5 px-3 text-xs w-auto font-medium"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Task List Table / Cards */}
      <div className="ent-card overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="spinner-lg" />
            <p className="text-xs text-[#888880]">Loading tasks...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#ccc] mx-auto" />
            <p className="text-sm font-semibold text-[#111111]">No tasks found</p>
            <p className="text-xs text-[#888880]">
              {searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                ? 'Try adjusting your filters or search terms.'
                : 'No tasks currently scheduled in this workspace.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f0f0eb]">
            {filteredTasks.map((task) => (
              <div
                key={task.occurrence_id}
                onClick={() => onOpenTask(task.occurrence_id)}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#fafaf8] cursor-pointer transition-colors duration-150"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-[#888880]">{task.occurrence_id}</span>
                    <OccurrenceBadge type={task.occurrence_type} />
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} isOverdue={task.is_overdue} />
                  </div>

                  <h3 className="text-sm font-bold text-[#111111] hover:underline underline-offset-2 tracking-tight">
                    {task.task_name}
                  </h3>

                  <div className="flex items-center gap-4 text-xs text-[#777770] flex-wrap">
                    {isOwner && (
                      <span className="flex items-center gap-1 font-medium text-[#444440]">
                        <User className="w-3.5 h-3.5" />
                        {task.assigned_user_name || task.assigned_user_id}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Due {formatDateTime(task.due_at)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:self-center shrink-0">
                  <div className="w-24 text-right">
                    <div className="text-[11px] font-bold text-[#111111]">{task.progress_percentage}%</div>
                    <div className="w-full h-1.5 rounded-full bg-[#e5e5e0] overflow-hidden mt-1">
                      <div
                        className={`h-full ${task.status === 'COMPLETED' ? 'bg-emerald-600' : 'bg-[#111111]'}`}
                        style={{ width: `${task.progress_percentage}%` }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenTask(task.occurrence_id);
                    }}
                    className="ent-btn-secondary py-1.5 px-3 text-xs"
                  >
                    Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
