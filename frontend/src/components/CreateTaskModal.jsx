import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, AlertCircle, Plus } from 'lucide-react';
import { callBackendApi } from '../services/api';

export function CreateTaskModal({ open, onClose, onSuccess, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('ONE_TIME');
  const [priority, setPriority] = useState('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('18:00');
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open) {
      setLoadingUsers(true);
      callBackendApi('listUsers', { is_active: true })
        .then((res) => {
          const list = res.users || [];
          setEmployees(list.filter((u) => u.role === 'EMPLOYEE' && u.is_active));
          if (list.length > 0 && !assignedUserId) {
            const firstEmp = list.find((u) => u.role === 'EMPLOYEE' && u.is_active);
            if (firstEmp) setAssignedUserId(firstEmp.user_id);
          }
        })
        .catch((err) => {
          showToast?.({ type: 'error', message: 'Could not load employee list: ' + err.message });
        })
        .finally(() => setLoadingUsers(false));

      // Default due date to today or tomorrow
      const today = new Date().toISOString().split('T')[0];
      setDueDate(today);
    }
  }, [open, showToast]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!taskName.trim()) {
      showToast?.({ type: 'error', message: 'Task name is required.' });
      return;
    }
    if (!assignedUserId) {
      showToast?.({ type: 'error', message: 'Please select an assigned employee.' });
      return;
    }
    if (!dueDate) {
      showToast?.({ type: 'error', message: 'Please select a due date.' });
      return;
    }

    setSubmitting(true);
    try {
      await callBackendApi('createTask', {
        task_name: taskName.trim(),
        description: description.trim(),
        assigned_user_id: assignedUserId,
        occurrence_type: occurrenceType,
        priority,
        start_date: dueDate,
        due_date: dueDate,
        due_time: dueTime,
        additional_instructions: instructions.trim()
      });

      showToast?.({
        type: 'success',
        title: 'Task Delegated',
        message: `"${taskName}" assigned to employee successfully.`
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to create task.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-figma-modal max-w-lg w-full my-8 overflow-hidden modal-enter">
        <div className="p-5 border-b border-[#e5e5e0] flex items-center justify-between bg-[#fafaf8]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#111111] text-white flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111111]">Delegate New Task</h3>
              <p className="text-[11px] text-[#777770]">Assign work with deadlines and instructions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#888880] hover:text-[#111111] hover:bg-black/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="ent-label">Task Name *</label>
            <input
              type="text"
              required
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="e.g. Prepare monthly financial reconciliation"
              className="ent-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="ent-label">Assignee *</label>
              <select
                required
                value={assignedUserId}
                onChange={(e) => setAssignedUserId(e.target.value)}
                className="ent-input"
                disabled={loadingUsers}
              >
                {loadingUsers && <option>Loading team...</option>}
                {employees.map((emp) => (
                  <option key={emp.user_id} value={emp.user_id}>
                    {emp.full_name} ({emp.department || 'Staff'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ent-label">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="ent-input font-medium"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Immediate)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="ent-label">Schedule</label>
              <select
                value={occurrenceType}
                onChange={(e) => setOccurrenceType(e.target.value)}
                className="ent-input"
              >
                <option value="ONE_TIME">One-Time</option>
                <option value="RECURRING_DAILY">Daily</option>
                <option value="RECURRING_WEEKLY">Weekly</option>
                <option value="RECURRING_MONTHLY">Monthly</option>
              </select>
            </div>

            <div>
              <label className="ent-label">Due Date *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="ent-input"
              />
            </div>

            <div>
              <label className="ent-label">Due Time</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="ent-input"
              />
            </div>
          </div>

          <div>
            <label className="ent-label">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview of the task and expected outcome..."
              className="ent-input resize-none"
            />
          </div>

          <div>
            <label className="ent-label">Specific Instructions (Optional)</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Step-by-step guidance, file links, or requirements..."
              className="ent-input resize-none"
            />
          </div>

          <div className="pt-3 border-t border-[#e5e5e0] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="ent-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="ent-btn-primary"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner-white" />
                  Delegating...
                </span>
              ) : (
                'Delegate Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
