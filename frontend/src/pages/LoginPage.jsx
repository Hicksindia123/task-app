import React, { useState } from 'react';
import { Lock, User, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';

export function LoginPage() {
  const { login, authError } = useAuth();
  const { loading, error, run } = useAsyncAction();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    await run(() => login(username, password));
  };

  const displayError = error || authError;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
      <div className="max-w-md w-full">
        {/* Logo Card */}
        <div className="bg-white rounded-2xl border border-[#e5e5e0] shadow-lg p-8">
          <div className="flex items-center gap-3.5 mb-8">
            <div className="w-11 h-11 rounded-xl bg-[#1a1a1a] text-white font-bold flex items-center justify-center text-lg tracking-tight">
              TF
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#1a1a1a] tracking-tight">TaskFlow</h1>
              <p className="text-xs text-[#888] font-medium">Task Delegation & Progress Tracking</p>
            </div>
          </div>

          {displayError && (
            <div className="mb-6 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="leading-relaxed">{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-[#555] mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-[#a8a8a8] absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="ent-input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#555] mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#a8a8a8] absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="ent-input pl-10"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="ent-btn-primary w-full py-3 text-[13px]">
              {loading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <span className="spinner" style={{borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.25)'}} />
                  Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-7 pt-5 border-t border-[#e5e5e0] flex items-center gap-2.5 text-xs text-[#999]">
            <ShieldCheck className="w-4 h-4 text-[#1a1a1a] shrink-0" />
            <span>Sessions are secured and persist for 72 hours.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
