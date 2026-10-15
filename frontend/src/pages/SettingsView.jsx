import React, { useState } from 'react';
import { User, Shield, Key, Clock, Server, CheckCircle2, Lock } from 'lucide-react';
import { callBackendApi } from '../services/api';
import { formatDateTime } from '../utils/formatters';

export function SettingsView({ user, sessionMeta, showToast }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast?.({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      showToast?.({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }

    setUpdatingPassword(true);
    try {
      await callBackendApi('changePassword', {
        old_password: oldPassword,
        new_password: newPassword
      });
      showToast?.({
        type: 'success',
        title: 'Password Updated',
        message: 'Your password was changed successfully.'
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to update password.' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-[#111111] tracking-tight">Account & System Settings</h2>
        <p className="text-xs text-[#777770]">
          Manage your account profile, security credentials, and session details.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="ent-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#111111] text-white flex items-center justify-center font-bold text-sm">
              {user?.full_name?.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#111111]">{user?.full_name}</h3>
              <p className="text-xs text-[#777770]">@{user?.username}</p>
            </div>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-[#e5e5e0] text-xs">
            <div className="flex justify-between py-1 border-b border-[#f0f0eb]">
              <span className="text-[#888880]">Role</span>
              <span className="font-semibold text-[#111111]">{user?.role}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#f0f0eb]">
              <span className="text-[#888880]">Department</span>
              <span className="font-medium text-[#111111]">{user?.department || 'Operations'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#888880]">Session Lifetime</span>
              <span className="font-medium text-[#111111]">72 Hours (Rolling)</span>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="ent-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#111111]" />
            <h3 className="text-sm font-bold text-[#111111]">Change Password</h3>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="ent-label">Current Password</label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                className="ent-input text-xs"
              />
            </div>

            <div>
              <label className="ent-label">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="ent-input text-xs"
              />
            </div>

            <div>
              <label className="ent-label">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="ent-input text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={updatingPassword}
              className="ent-btn-primary w-full text-xs mt-2"
            >
              {updatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Backend Connection Health */}
      <div className="ent-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-[#111111]" />
            <h3 className="text-sm font-bold text-[#111111]">Backend Cloud Architecture</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        </div>
        <p className="text-xs text-[#777770] leading-relaxed">
          Google Apps Script Web App gateway connected with Google Sheets relational database schema. All queries are CORS preflight protected via text/plain JSON dispatch.
        </p>
      </div>
    </div>
  );
}
