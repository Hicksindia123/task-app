import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, User, Calendar, CheckCircle, AlertTriangle, Send, ShieldAlert, FileText, ArrowRight } from 'lucide-react';
import { callBackendApi } from '../services/api';
import { StatusBadge, PriorityBadge, OccurrenceBadge } from './StatusBadge';
import { formatDateTime } from '../utils/formatters';

export function TaskDetailModal({ occurrenceId, currentUser, onClose, onRefreshData, showToast }) {
  const [task, setTask] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [workCompleted, setWorkCompleted] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(0);
  const [blockers, setBlockers] = useState('');
  const [ownerNote, setOwnerNote] = useState('');

  const loadDetails = useCallback(async () => {
    if (!occurrenceId) return;
    setLoading(true);
    try {
      const res = await callBackendApi('getTaskDetails', { occurrence_id: occurrenceId });
      setTask(res.task);
      setUpdates(res.updates || []);
      setProgressPercentage(res.task?.progress_percentage || 0);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to load task details' });
    } finally {
      setLoading(false);
    }
  }, [occurrenceId, showToast]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const handleEmployeeSubmit = async (readyForReview = false) => {
    if (!workCompleted.trim() && !blockers.trim() && !readyForReview) {
      showToast?.({ type: 'error', message: 'Please describe the work completed or blockers.' });
      return;
    }

    setSubmitting(true);
    try {
      await callBackendApi('addTaskUpdate', {
        occurrence_id: occurrenceId,
        work_completed: workCompleted.trim(),
        blockers: blockers.trim(),
        progress_percentage: Number(progressPercentage),
        status: readyForReview ? 'AWAITING_REVIEW' : (blockers.trim() ? 'BLOCKED' : 'IN_PROGRESS'),
        update_type: readyForReview ? 'REVIEW_REQUEST' : (blockers.trim() ? 'BLOCKER' : 'PROGRESS')
      });

      setWorkCompleted('');
      setBlockers('');
      showToast?.({
        type: 'success',
        title: readyForReview ? 'Submitted for Review' : 'Update Logged',
        message: readyForReview ? 'Owner has been notified for final sign-off.' : 'Task progress updated successfully.'
      });
      await loadDetails();
      onRefreshData?.();
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to submit update.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerStatusChange = async (newStatus) => {
    setSubmitting(true);
    try {
      await callBackendApi('updateTaskStatus', {
        occurrence_id: occurrenceId,
        status: newStatus,
        feedback: ownerNote.trim() || undefined
      });
      setOwnerNote('');
      showToast?.({
        type: 'success',
        title: 'Status Updated',
        message: `Task marked as ${newStatus.replace('_', ' ')}.`
      });
      await loadDetails();
      onRefreshData?.();
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to update status.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isOwner = currentUser?.role === 'OWNER';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-black/[0.08] shadow-figma-modal max-w-2xl w-full my-8 overflow-hidden modal-enter">
        {/* Header */}
        <div className="p-6 border-b border-[#e5e5e0] flex items-start justify-between gap-4 bg-[#fafaf8]">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono text-[#888880] px-2 py-0.5 rounded bg-black/5">
                {occurrenceId}
              </span>
              {task && (
                <>
                  <OccurrenceBadge type={task.occurrence_type} />
                  <PriorityBadge priority={task.priority} />
                  <StatusBadge status={task.status} isOverdue={task.is_overdue} />
                </>
              )}
            </div>
            <h2 className="text-lg font-bold text-[#111111] tracking-tight leading-snug">
              {task?.task_name || 'Loading task...'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#888880] hover:text-[#111111] hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="spinner-lg" />
            <p className="text-xs text-[#888880] font-medium">Fetching task details & timeline...</p>
          </div>
        ) : !task ? (
          <div className="p-8 text-center text-sm text-[#888880]">Task not found.</div>
        ) : (
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {/* Metadata Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#f5f5f0] border border-[#e5e5e0] text-xs">
              <div>
                <span className="text-[#888880] block text-[11px]">Assigned To</span>
                <span className="font-semibold text-[#111111] flex items-center gap-1.5 mt-0.5">
                  <User className="w-3.5 h-3.5 text-[#555550]" />
                  {task.assigned_user_name || task.assigned_user_id}
                </span>
              </div>
              <div>
                <span className="text-[#888880] block text-[11px]">Due Date</span>
                <span className="font-semibold text-[#111111] flex items-center gap-1.5 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-[#555550]" />
                  {formatDateTime(task.due_at)}
                </span>
              </div>
              <div>
                <span className="text-[#888880] block text-[11px]">Created By</span>
                <span className="font-medium text-[#555550] block mt-0.5">
                  {task.created_by_name || 'Owner'}
                </span>
              </div>
            </div>

            {/* Description & Instructions */}
            {task.description && (
              <div className="space-y-1">
                <h4 className="text-[11px] font-semibold text-[#888880] uppercase tracking-wider">Description</h4>
                <p className="text-sm text-[#262626] leading-relaxed whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {task.custom_instructions && (
              <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs text-amber-900 space-y-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Specific Instructions:
                </span>
                <p className="leading-relaxed">{task.custom_instructions}</p>
              </div>
            )}

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#555550]">Overall Completion</span>
                <span className="font-bold text-[#111111]">{task.progress_percentage}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[#e5e5e0] overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    task.status === 'COMPLETED' ? 'bg-emerald-600' : 'bg-[#111111]'
                  }`}
                  style={{ width: `${task.progress_percentage}%` }}
                />
              </div>
            </div>

            {/* Progress & Update Timeline */}
            <div className="space-y-3 pt-2 border-t border-[#e5e5e0]">
              <h4 className="text-[11px] font-semibold text-[#888880] uppercase tracking-wider">
                Activity Timeline ({updates.length})
              </h4>
              <div className="space-y-3">
                {updates.length === 0 ? (
                  <p className="text-xs text-[#888880] italic">No updates logged yet.</p>
                ) : (
                  updates.map((up) => (
                    <div key={up.update_id} className="p-3.5 rounded-xl bg-[#fafaf8] border border-[#e5e5e0] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#111111]">{up.author_name}</span>
                        <span className="text-[11px] text-[#888880]">{formatDateTime(up.created_at)}</span>
                      </div>
                      {up.work_completed && (
                        <p className="text-xs text-[#333330] leading-relaxed whitespace-pre-wrap">
                          {up.work_completed}
                        </p>
                      )}
                      {up.blockers && (
                        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-red-50 text-red-700 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>Blocker: {up.blockers}</span>
                        </div>
                      )}
                      {up.message && (
                        <p className="text-xs text-[#666660] italic">{up.message}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Action Sections */}
            {task.status !== 'COMPLETED' && (
              <div className="pt-4 border-t border-[#e5e5e0] space-y-4">
                {!isOwner ? (
                  /* Employee Progress Update Form */
                  <div className="space-y-3 bg-[#fafaf8] p-4 rounded-xl border border-[#e5e5e0]">
                    <h4 className="text-xs font-bold text-[#111111]">Submit Progress Update</h4>
                    <div>
                      <label className="ent-label">Work Done / Details</label>
                      <textarea
                        rows={2}
                        value={workCompleted}
                        onChange={(e) => setWorkCompleted(e.target.value)}
                        placeholder="What specific tasks or milestones did you complete?"
                        className="ent-input resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="ent-label">Progress ({progressPercentage}%)</label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={progressPercentage}
                          onChange={(e) => setProgressPercentage(e.target.value)}
                          className="w-full accent-[#111111] cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="ent-label">Any Blockers? (Optional)</label>
                        <input
                          type="text"
                          value={blockers}
                          onChange={(e) => setBlockers(e.target.value)}
                          placeholder="Obstacles, dependencies, waiting for..."
                          className="ent-input text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleEmployeeSubmit(false)}
                        className="ent-btn-secondary"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Log Progress
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleEmployeeSubmit(true)}
                        className="ent-btn-primary"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Submit for Review
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Owner Controls */
                  <div className="space-y-3 bg-[#fafaf8] p-4 rounded-xl border border-[#e5e5e0]">
                    <h4 className="text-xs font-bold text-[#111111]">Owner Sign-off & Actions</h4>
                    <div>
                      <input
                        type="text"
                        value={ownerNote}
                        onChange={(e) => setOwnerNote(e.target.value)}
                        placeholder="Optional feedback or instruction notes..."
                        className="ent-input text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOwnerStatusChange('ON_HOLD')}
                        className="ent-btn-secondary text-xs"
                      >
                        Put On Hold
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOwnerStatusChange('COMPLETED')}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve & Mark Completed
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
