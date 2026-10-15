import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Shield, User, X, CheckCircle, AlertTriangle, Lock } from 'lucide-react';
import { callBackendApi } from '../services/api';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function UsersView({ currentUser, showToast }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New user form states
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [department, setDepartment] = useState('');

  // Deactivate confirmation state
  const [userToDeactivate, setUserToDeactivate] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await callBackendApi('listUsers', {});
      setUsers(res.users || []);
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to load team members' });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !username.trim() || !password.trim()) {
      showToast?.({ type: 'error', message: 'Full name, username, and password are required.' });
      return;
    }

    setSubmitting(true);
    try {
      await callBackendApi('createUser', {
        full_name: fullName.trim(),
        username: username.trim(),
        password: password.trim(),
        role,
        department: department.trim()
      });

      showToast?.({
        type: 'success',
        title: 'User Added',
        message: `${fullName} has been created with role ${role}.`
      });

      setFullName('');
      setUsername('');
      setPassword('');
      setDepartment('');
      setModalOpen(false);
      await loadUsers();
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to create user.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    if (!userToDeactivate) return;
    setActionLoading(true);
    try {
      await callBackendApi('deactivateUser', { user_id: userToDeactivate.user_id });
      showToast?.({
        type: 'success',
        title: 'User Deactivated',
        message: `${userToDeactivate.full_name} has been deactivated.`
      });
      setUserToDeactivate(null);
      await loadUsers();
    } catch (err) {
      showToast?.({ type: 'error', message: err.message || 'Failed to deactivate user.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#111111] tracking-tight">Users & Access Control</h2>
          <p className="text-xs text-[#777770]">
            Manage employee profiles, login credentials, and department roles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="ent-btn-primary self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Add Team Member
        </button>
      </div>

      <div className="ent-card overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <div className="spinner-lg" />
            <p className="text-xs text-[#888880]">Loading staff accounts...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#fafaf8] text-[#777770] text-[11px] uppercase tracking-wider border-b border-[#e5e5e0]">
                  <th className="py-3 px-4 font-semibold">User</th>
                  <th className="py-3 px-4 font-semibold">Username</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Department</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0eb]">
                {users.map((u) => {
                  const isCurrent = u.user_id === currentUser?.user_id;
                  return (
                    <tr key={u.user_id} className="hover:bg-[#fafaf8] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[#111111]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#111111] text-white flex items-center justify-center text-xs font-bold">
                            {u.full_name?.slice(0, 2).toUpperCase()}
                          </div>
                          <span>{u.full_name}</span>
                          {isCurrent && (
                            <span className="text-[10px] bg-black/5 text-[#555] px-1.5 py-0.5 rounded font-normal">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono text-[#555550]">{u.username}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            u.role === 'OWNER'
                              ? 'bg-black text-white'
                              : 'bg-[#f0f0ee] text-[#111111] border border-[#d4d4d0]'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#555550]">{u.department || '—'}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isCurrent && u.is_active && u.role !== 'OWNER' && (
                          <button
                            type="button"
                            onClick={() => setUserToDeactivate(u)}
                            className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-black/[0.08] shadow-figma-modal max-w-md w-full my-8 overflow-hidden modal-enter">
            <div className="p-5 border-b border-[#e5e5e0] flex items-center justify-between bg-[#fafaf8]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#111111] text-white flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#111111]">Create New User Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-[#888880] hover:text-[#111111] hover:bg-black/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="ent-label">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="ent-input text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ent-label">Username *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="alex.m"
                    className="ent-input text-xs"
                  />
                </div>
                <div>
                  <label className="ent-label">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="ent-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ent-label">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="ent-input text-xs font-medium"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="OWNER">Owner (Full Admin)</option>
                  </select>
                </div>
                <div>
                  <label className="ent-label">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Operations, Sales"
                    className="ent-input text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#e5e5e0] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="ent-btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="ent-btn-primary text-xs"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner-white" />
                      Creating...
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!userToDeactivate}
        title="Deactivate Team Member"
        description={`Are you sure you want to deactivate ${userToDeactivate?.full_name}? They will be immediately logged out and will not be able to log in.`}
        confirmLabel="Deactivate Account"
        loading={actionLoading}
        onConfirm={handleDeactivate}
        onCancel={() => setUserToDeactivate(null)}
      />
    </div>
  );
}
