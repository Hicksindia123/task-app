/**
 * Formatting helpers for dates, relative timestamps, and status/priority badges.
 */

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateShort(isoOrYmd) {
  if (!isoOrYmd) return '—';
  const d = new Date(isoOrYmd);
  if (isNaN(d.getTime())) return String(isoOrYmd).substring(0, 10);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatSessionRemaining(expiresAtIso) {
  if (!expiresAtIso) return '';
  const diffMs = new Date(expiresAtIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${totalHours}h ${mins}m remaining`;
}

export const STATUS_LABELS = {
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  AWAITING_REVIEW: 'Awaiting Review',
  COMPLETED: 'Completed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled'
};

// Black/Silver themed status badges — Red/Green strictly reserved for Overdue, Blocked, and Completed
export const STATUS_STYLES = {
  ASSIGNED: 'bg-[#f5f5f0] text-[#555] border-[#d4d4d4]',
  IN_PROGRESS: 'bg-[#111111] text-white border-[#111111]',
  BLOCKED: 'bg-red-50 text-red-700 border-red-200 font-semibold',
  AWAITING_REVIEW: 'bg-[#f5f5f0] text-[#111111] border-[#888880] font-semibold',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
  ON_HOLD: 'bg-[#f0f0eb] text-[#777] border-[#c0c0c0]',
  CANCELLED: 'bg-[#f5f5f0] text-[#aaa] border-[#d4d4d4] line-through',
  // Title-cased fallback keys
  'Assigned': 'bg-[#f5f5f0] text-[#555] border-[#d4d4d4]',
  'In Progress': 'bg-[#111111] text-white border-[#111111]',
  'Blocked': 'bg-red-50 text-red-700 border-red-200 font-semibold',
  'Awaiting Review': 'bg-[#f5f5f0] text-[#111111] border-[#888880] font-semibold',
  'Awaiting Owner Review': 'bg-[#f5f5f0] text-[#111111] border-[#888880] font-semibold',
  'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
  'On Hold': 'bg-[#f0f0eb] text-[#777] border-[#c0c0c0]',
  'Cancelled': 'bg-[#f5f5f0] text-[#aaa] border-[#d4d4d4] line-through'
};

export const PRIORITY_STYLES = {
  LOW: 'bg-[#fafaf7] text-[#777] border-[#d4d4d4]',
  MEDIUM: 'bg-[#f5f5f0] text-[#444] border-[#b5b5ad]',
  HIGH: 'bg-[#111111] text-white border-[#111111]',
  URGENT: 'bg-red-600 text-white border-red-600 font-semibold',
  // Title-cased fallback keys
  Low: 'bg-[#fafaf7] text-[#777] border-[#d4d4d4]',
  Medium: 'bg-[#f5f5f0] text-[#444] border-[#b5b5ad]',
  High: 'bg-[#111111] text-white border-[#111111]',
  Urgent: 'bg-red-600 text-white border-red-600 font-semibold'
};
