import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl border border-[#e5e5e0] shadow-2xl max-w-md w-full p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-[#f5f5f0] text-[#1a1a1a]'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-[#1a1a1a]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="text-[#aaa] hover:text-[#555] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-3 text-sm text-[#666] leading-relaxed">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="ent-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40 ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1a1a1a] hover:bg-[#0a0a0a]'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="spinner" style={{borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.25)', width: '14px', height: '14px'}} />
                Processing...
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
