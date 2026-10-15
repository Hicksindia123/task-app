import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { OwnerDashboardPage } from './pages/OwnerDashboardPage';
import { EmployeeDashboardPage } from './pages/EmployeeDashboardPage';
import { TasksView } from './pages/TasksView';
import { UsersView } from './pages/UsersView';
import { ActivityLogView } from './pages/ActivityLogView';
import { SettingsView } from './pages/SettingsView';
import { TaskDetailModal } from './components/TaskDetailModal';
import { CreateTaskModal } from './components/CreateTaskModal';
import { Toast } from './components/Toast';
import { callBackendApi } from './services/api';

function WorkspaceContainer() {
  const { user, sessionMeta, initializing, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);

  // Modal & Toast states
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((toastObj) => {
    setToast(toastObj);
    setTimeout(() => {
      setToast((curr) => (curr === toastObj ? null : curr));
    }, 4500);
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const action = user.role === 'OWNER' ? 'getOwnerDashboard' : 'getEmployeeDashboard';
      const data = await callBackendApi(action, {});
      setDashboardData(data);
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to load workspace data.' });
    } finally {
      setLoadingData(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user, loadDashboard]);

  const handleSelectTab = (tabId) => {
    if (tabId === 'create-task') {
      setCreateModalOpen(true);
      return;
    }
    setActiveTab(tabId);
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f0] gap-4">
        <div className="spinner-lg" />
        <p className="text-xs text-[#777770] font-medium tracking-wide">Validating session...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderContent = () => {
    if (loadingData && !dashboardData) {
      return (
        <div className="p-16 flex flex-col items-center justify-center gap-3">
          <div className="spinner-lg" />
          <p className="text-xs text-[#777770]">Loading workspace data...</p>
        </div>
      );
    }

    if (activeTab === 'dashboard') {
      return user.role === 'OWNER' ? (
        <OwnerDashboardPage
          dashboardData={dashboardData}
          onOpenTask={(occId) => setSelectedOccurrenceId(occId)}
          onQuickCreateTask={() => setCreateModalOpen(true)}
        />
      ) : (
        <EmployeeDashboardPage
          dashboardData={dashboardData}
          onOpenTask={(occId) => setSelectedOccurrenceId(occId)}
        />
      );
    }

    if (activeTab === 'tasks' || activeTab === 'recurring') {
      return (
        <TasksView
          user={user}
          onOpenTask={(occId) => setSelectedOccurrenceId(occId)}
          onQuickCreateTask={() => setCreateModalOpen(true)}
          showToast={showToast}
        />
      );
    }

    if (activeTab === 'users' && user.role === 'OWNER') {
      return <UsersView currentUser={user} showToast={showToast} />;
    }

    if (activeTab === 'audit' || activeTab === 'my-updates') {
      return <ActivityLogView showToast={showToast} />;
    }

    if (activeTab === 'settings' || activeTab === 'profile') {
      return <SettingsView user={user} sessionMeta={sessionMeta} showToast={showToast} />;
    }

    return null;
  };

  return (
    <>
      <DashboardLayout
        user={user}
        sessionMeta={sessionMeta}
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onLogout={logout}
      >
        {renderContent()}
      </DashboardLayout>

      {/* Task Inspection & Progress Modal */}
      {selectedOccurrenceId && (
        <TaskDetailModal
          occurrenceId={selectedOccurrenceId}
          currentUser={user}
          onClose={() => setSelectedOccurrenceId(null)}
          onRefreshData={loadDashboard}
          showToast={showToast}
        />
      )}

      {/* Task Delegation Modal */}
      <CreateTaskModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={loadDashboard}
        showToast={showToast}
      />

      {/* Toast Notification Container */}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceContainer />
    </AuthProvider>
  );
}
