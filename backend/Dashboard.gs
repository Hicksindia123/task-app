/**
 * ============================================================================
 * Dashboard.gs - Owner & Employee KPI Aggregations & Workload Analytics
 * ============================================================================
 */

/**
 * Aggregates complete KPI metrics, employee workload breakdown, recent updates,
 * and overdue alerts for the Owner Dashboard.
 */
function handleGetOwnerDashboard(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Owner role required.',
      code: 'FORBIDDEN'
    };
  }

  // Ensure upcoming recurring occurrences exist
  generateUpcomingOccurrencesInternal(7);

  const listRes = handleListTasks(currentUser, {});
  const allTasks = (listRes.data && listRes.data.tasks) || [];
  const users = getTableRows(SHEET_NAMES.USERS);
  const updates = getTableRows(SHEET_NAMES.TASK_UPDATES);
  const definitions = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);

  const defMap = {};
  definitions.forEach(function(d) { defMap[d.task_definition_id] = d; });

  const nonCancelled = allTasks.filter(function(t) { return t.status !== 'Cancelled'; });
  const activeEmployees = users.filter(function(u) {
    return u.role === 'EMPLOYEE' && toBoolean(u.is_active);
  });

  const kpis = {
    total_active_tasks: nonCancelled.filter(function(t) { return t.status !== 'Completed'; }).length,
    pending_tasks: nonCancelled.filter(function(t) { return t.status === 'Assigned'; }).length,
    in_progress_tasks: nonCancelled.filter(function(t) { return t.status === 'In Progress'; }).length,
    awaiting_review_tasks: nonCancelled.filter(function(t) { return t.status === 'Awaiting Owner Review'; }).length,
    completed_tasks: nonCancelled.filter(function(t) { return t.status === 'Completed'; }).length,
    overdue_tasks: nonCancelled.filter(function(t) { return t.is_overdue; }).length,
    blocked_tasks: nonCancelled.filter(function(t) { return t.status === 'Blocked'; }).length,
    on_hold_tasks: nonCancelled.filter(function(t) { return t.status === 'On Hold'; }).length,
    active_employees: activeEmployees.length,
    recurring_series_count: definitions.filter(function(d) {
      return toBoolean(d.is_active) && String(d.occurrence_type) !== 'ONE_TIME';
    }).length
  };

  // Employee workload & completion rate breakdown
  const employeeWorkload = users
    .filter(function(u) { return u.role === 'EMPLOYEE'; })
    .map(function(emp) {
      const empTasks = nonCancelled.filter(function(t) {
        return String(t.assigned_user_id) === String(emp.user_id);
      });
      const completed = empTasks.filter(function(t) { return t.status === 'Completed'; }).length;
      const total = empTasks.length;
      const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

      return {
        user_id: emp.user_id,
        full_name: emp.full_name,
        username: emp.username,
        department: emp.department,
        is_active: toBoolean(emp.is_active),
        total_assigned: total,
        pending: empTasks.filter(function(t) { return t.status === 'Assigned'; }).length,
        in_progress: empTasks.filter(function(t) { return t.status === 'In Progress'; }).length,
        awaiting_review: empTasks.filter(function(t) { return t.status === 'Awaiting Owner Review'; }).length,
        blocked: empTasks.filter(function(t) { return t.status === 'Blocked'; }).length,
        overdue: empTasks.filter(function(t) { return t.is_overdue; }).length,
        completed: completed,
        completion_rate: completionRate
      };
    });

  // Recent employee updates (newest 12)
  const recentEmployeeUpdates = updates
    .filter(function(u) { return u.author_role === 'EMPLOYEE'; })
    .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, 12)
    .map(function(u) {
      const d = defMap[u.task_definition_id] || {};
      return {
        update_id: u.update_id,
        occurrence_id: u.occurrence_id,
        task_name: d.task_name || u.occurrence_id,
        author_name: u.author_name,
        update_type: u.update_type,
        message: u.message,
        blockers: u.blockers,
        help_required: u.help_required,
        progress_percentage: Number(u.progress_percentage) || 0,
        new_status: u.new_status,
        created_at: u.created_at
      };
    });

  const overdueAlerts = nonCancelled
    .filter(function(t) { return t.is_overdue || t.status === 'Blocked'; })
    .slice(0, 10);

  return {
    success: true,
    data: {
      kpis: kpis,
      employee_workload: employeeWorkload,
      recent_employee_updates: recentEmployeeUpdates,
      overdue_alerts: overdueAlerts,
      tasks: allTasks
    }
  };
}

/**
 * Aggregates personal KPI metrics, urgent/overdue alerts, and recent updates for an Employee.
 */
function handleGetEmployeeDashboard(currentUser, payload) {
  generateUpcomingOccurrencesInternal(7);

  const listRes = handleListTasks(currentUser, {});
  const myTasks = (listRes.data && listRes.data.tasks) || [];
  const activeTasks = myTasks.filter(function(t) { return t.status !== 'Cancelled'; });

  const kpis = {
    my_pending_tasks: activeTasks.filter(function(t) { return t.status === 'Assigned'; }).length,
    my_in_progress_tasks: activeTasks.filter(function(t) { return t.status === 'In Progress'; }).length,
    awaiting_review_tasks: activeTasks.filter(function(t) { return t.status === 'Awaiting Owner Review'; }).length,
    completed_tasks: activeTasks.filter(function(t) { return t.status === 'Completed'; }).length,
    overdue_tasks: activeTasks.filter(function(t) { return t.is_overdue; }).length,
    urgent_tasks: activeTasks.filter(function(t) {
      return t.status !== 'Completed' && (t.priority === 'Urgent' || t.priority === 'High');
    }).length,
    blocked_tasks: activeTasks.filter(function(t) { return t.status === 'Blocked'; }).length
  };

  const myOccurrenceIds = new Set(myTasks.map(function(t) { return t.occurrence_id; }));
  const definitions = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const defMap = {};
  definitions.forEach(function(d) { defMap[d.task_definition_id] = d; });

  const myRecentUpdates = getTableRows(SHEET_NAMES.TASK_UPDATES)
    .filter(function(u) { return myOccurrenceIds.has(String(u.occurrence_id)); })
    .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, 15)
    .map(function(u) {
      const d = defMap[u.task_definition_id] || {};
      return {
        update_id: u.update_id,
        occurrence_id: u.occurrence_id,
        task_name: d.task_name || u.occurrence_id,
        author_name: u.author_name,
        author_role: u.author_role,
        update_type: u.update_type,
        message: u.message,
        work_completed: u.work_completed,
        blockers: u.blockers,
        help_required: u.help_required,
        next_steps: u.next_steps,
        progress_percentage: Number(u.progress_percentage) || 0,
        new_status: u.new_status,
        created_at: u.created_at
      };
    });

  return {
    success: true,
    data: {
      kpis: kpis,
      tasks: myTasks,
      recent_updates: myRecentUpdates
    }
  };
}
