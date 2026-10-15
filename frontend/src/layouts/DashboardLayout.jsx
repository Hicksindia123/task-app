import React, { useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  PlusCircle,
  Users,
  Repeat,
  Activity,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  UserCheck,
  Clock
} from 'lucide-react';
import { formatSessionRemaining } from '../utils/formatters';

export function DashboardLayout({ user, sessionMeta, activeTab, onSelectTab, onLogout, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const ownerNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tasks', label: 'All Tasks', icon: CheckSquare },
    { id: 'create-task', label: 'Create Task', icon: PlusCircle },
    { id: 'recurring', label: 'Recurring Tasks', icon: Repeat },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'audit', label: 'Activity Log', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const employeeNav = [
    { id: 'dashboard', label: 'My Dashboard', icon: LayoutDashboard },
    { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
    { id: 'my-updates', label: 'My Updates', icon: Activity },
    { id: 'profile', label: 'My Profile', icon: UserCheck }
  ];

  const navItems = user?.role === 'OWNER' ? ownerNav : employeeNav;

  return (
    <div className="min-h-screen flex bg-[#f5f5f0]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] bg-[#111111] text-white shrink-0">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center font-bold text-[#111] text-sm">
            TF
          </div>
          <div>
            <div className="font-bold text-sm tracking-tight text-white">TaskFlow</div>
            <div className="text-[11px] text-[#888]">Delegation & Tracking</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                  active
                    ? 'bg-white text-[#111] shadow-sm'
                    : 'text-[#999] hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white">
              {user?.full_name?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user?.full_name}</div>
              <div className="text-[11px] text-[#777] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#888]" />
                {user?.role}
              </div>
            </div>
          </div>
          {sessionMeta?.expiresAt && (
            <div className="text-[11px] text-[#888] flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-md border border-white/10">
              <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>{formatSessionRemaining(sessionMeta.expiresAt)}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 text-[#ccc] hover:bg-red-600 hover:text-white transition-all duration-200"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-[#e5e5e0] px-4 lg:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-[#555] hover:bg-[#f0f0eb]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h1 className="text-base sm:text-lg font-bold text-[#1a1a1a] tracking-tight">
              {navItems.find((n) => n.id === activeTab)?.label || 'Workspace'}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#666]">
            <span className="hidden sm:inline-block px-3 py-1.5 rounded-full bg-[#f5f5f0] border border-[#e5e5e0] font-medium text-[#555]">
              {user?.department || user?.role}
            </span>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#111111] text-white px-4 py-3 space-y-1 border-b border-white/10">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    activeTab === item.id ? 'bg-white text-[#111]' : 'text-[#999]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-600/20"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
