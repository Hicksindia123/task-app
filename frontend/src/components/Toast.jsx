import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export function Toast({ toast, onClose }) {
  if (!toast) return null;

  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full toast-enter">
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg bg-white ${
          isError
            ? 'border-red-200 text-red-900 shadow-red-950/5'
            : isSuccess
            ? 'border-emerald-200 text-emerald-950 shadow-emerald-950/5'
            : 'border-black/[0.1] text-[#111111] shadow-black/5'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {isError ? (
            <AlertCircle className="w-5 h-5 text-red-600" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <Info className="w-5 h-5 text-[#111111]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {toast.title && <h4 className="text-[13px] font-semibold tracking-tight">{toast.title}</h4>}
          <p className="text-xs text-[#555550] mt-0.5 leading-relaxed">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[#999990] hover:text-[#111111] transition-colors p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
