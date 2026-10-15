/**
 * ============================================================================
 * Tasks.gs - Task Creation, Delegation, Filtering & Lifecycle State Machine
 * ============================================================================
 */

const VALID_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const VALID_STATUSES = [
  'Assigned',
  'In Progress',
  'Blocked',
  'Awaiting Owner Review',
  'Completed',
  'On Hold',
  'Cancelled'
];

/**
 * Role-based status transition rules enforced strictly on the backend.
 * Employees CANNOT mark tasks as 'Completed', 'On Hold', or 'Cancelled'.
 */
const EMPLOYEE_ALLOWED_TRANSITIONS = {
  'Assigned': ['In Progress', 'Blocked', 'Awaiting Owner Review'],
  'In Progress': ['Blocked', 'Awaiting Owner Review'],
  'Blocked': ['In Progress', 'Awaiting Owner Review'],
  'Awaiting Owner Review': ['In Progress'],
  'On Hold': [],
  'Completed': [],
  'Cancelled': []
};

const OWNER_ALLOWED_TRANSITIONS = {
  'Assigned': ['In Progress', 'Blocked', 'Awaiting Owner Review', 'Completed', 'On Hold', 'Cancelled'],
  'In Progress': ['Assigned', 'Blocked', 'Awaiting Owner Review', 'Completed', 'On Hold', 'Cancelled'],
  'Blocked': ['Assigned', 'In Progress', 'Awaiting Owner Review', 'Completed', 'On Hold', 'Cancelled'],
  'Awaiting Owner Review': ['In Progress', 'Blocked', 'Completed', 'On Hold', 'Cancelled'],
  'On Hold': ['Assigned', 'In Progress', 'Cancelled', 'Completed'],
  'Completed': ['In Progress', 'Assigned'], // Reopening a completed task
  'Cancelled': ['Assigned', 'In Progress']  // Reopening a cancelled task
};

/**
 * Enriches an occurrence row with its parent TaskDefinition, assignee details, and overdue state.
 */
function buildEnrichedTaskOccurrence(occ, defMap, userMap, updatesCountMap, lastUpdateMap, nowIso) {
  const def = defMap[occ.task_definition_id] || {};
  const assignee = userMap[occ.assigned_user_id];
  const creator = userMap[def.created_by];
  const dueAt = String(occ.due_at || '');
  const isTerminal = occ.status === 'Completed' || occ.status === 'Cancelled';
  const isOverdue = Boolean(!isTerminal && dueAt && dueAt < nowIso);
  const lastUpd = lastUpdateMap[occ.occurrence_id] || null;

  return {
    occurrence_id: String(occ.occurrence_id),
    task_definition_id: String(occ.task_definition_id),
    task_name: String(def.task_name || 'Untitled Task'),
    description: String(def.description || ''),
    additional_instructions: String(occ.custom_instructions || def.additional_instructions || ''),
    occurrence_type: String(def.occurrence_type || 'ONE_TIME'),
    recurrence_rule: parseRecurrenceRule(def.recurrence_rule_json),
    occurrence_date: String(occ.occurrence_date || ''),
    start_date: String(def.start_date || occ.occurrence_date || ''),
    end_date: String(def.end_date || ''),
    due_at: dueAt,
    assigned_user_id: String(occ.assigned_user_id),
    assigned_user_name: assignee ? assignee.full_name : String(occ.assigned_user_id),
    assigned_user_department: assignee ? assignee.department : '',
    assigned_user_active: assignee ? toBoolean(assignee.is_active) : false,
    created_by: String(def.created_by || ''),
    created_by_name: creator ? creator.full_name : String(def.created_by || 'Owner'),
    status: String(occ.status || 'Assigned'),
    priority: String(occ.priority || def.default_priority || 'Medium'),
    progress_percentage: Number(occ.progress_percentage) || 0,
    is_overdue: isOverdue,
    updates_count: updatesCountMap[occ.occurrence_id] || 0,
    last_update_summary: lastUpd ? lastUpd.message : '',
    last_update_by: lastUpd ? lastUpd.author_name : '',
    last_update_at: lastUpd ? lastUpd.created_at : String(occ.updated_at || occ.created_at || ''),
    created_at: String(occ.created_at || ''),
    updated_at: String(occ.updated_at || ''),
    completed_at: String(occ.completed_at || '')
  };
}

/**
 * Lists task occurrences with filtering, sorting, and strict RBAC enforcement.
 * Employees can ONLY see occurrences assigned to their own `user_id`.
 */
function handleListTasks(currentUser, payload) {
  const definitions = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const users = getTableRows(SHEET_NAMES.USERS);
  const updates = getTableRows(SHEET_NAMES.TASK_UPDATES);

  const defMap = {};
  definitions.forEach(function(d) { defMap[d.task_definition_id] = d; });

  const userMap = {};
  users.forEach(function(u) { userMap[u.user_id] = u; });

  const updatesCountMap = {};
  const lastUpdateMap = {};
  updates.forEach(function(u) {
    const occId = String(u.occurrence_id);
    updatesCountMap[occId] = (updatesCountMap[occId] || 0) + 1;
    if (!lastUpdateMap[occId] || String(u.created_at) >= String(lastUpdateMap[occId].created_at)) {
      lastUpdateMap[occId] = u;
    }
  });

  const nowIso = new Date().toISOString();

  // RBAC: Employees are strictly restricted to their own assigned tasks
  let scopedOccurrences = occurrences;
  if (currentUser.role !== 'OWNER') {
    scopedOccurrences = occurrences.filter(function(occ) {
      return String(occ.assigned_user_id) === String(currentUser.user_id);
    });
  }

  let items = scopedOccurrences.map(function(occ) {
    return buildEnrichedTaskOccurrence(occ, defMap, userMap, updatesCountMap, lastUpdateMap, nowIso);
  });

  // Apply optional filters
  const f = payload || {};
  if (f.assigned_user_id && f.assigned_user_id !== 'ALL' && currentUser.role === 'OWNER') {
    items = items.filter(function(t) { return t.assigned_user_id === String(f.assigned_user_id); });
  }
  if (f.status && f.status !== 'ALL') {
    if (f.status === 'OVERDUE') {
      items = items.filter(function(t) { return t.is_overdue; });
    } else {
      items = items.filter(function(t) { return t.status === String(f.status); });
    }
  }
  if (f.priority && f.priority !== 'ALL') {
    items = items.filter(function(t) { return t.priority === String(f.priority); });
  }
  if (f.occurrence_type && f.occurrence_type !== 'ALL') {
    items = items.filter(function(t) { return t.occurrence_type === String(f.occurrence_type).toUpperCase(); });
  }
  if (f.date_from) {
    const fromStr = String(f.date_from).substring(0, 10);
    items = items.filter(function(t) { return String(t.due_at).substring(0, 10) >= fromStr; });
  }
  if (f.date_to) {
    const toStr = String(f.date_to).substring(0, 10);
    items = items.filter(function(t) { return String(t.due_at).substring(0, 10) <= toStr; });
  }
  if (f.search) {
    const q = String(f.search).trim().toLowerCase();
    items = items.filter(function(t) {
      const hay = (
        t.occurrence_id + ' ' +
        t.task_definition_id + ' ' +
        t.task_name + ' ' +
        t.description + ' ' +
        t.assigned_user_name + ' ' +
        t.status + ' ' +
        t.priority
      ).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  // Sort by overdue first, then due_at ascending
  items.sort(function(a, b) {
    if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
    return String(a.due_at).localeCompare(String(b.due_at));
  });

  return {
    success: true,
    data: {
      tasks: items,
      total: items.length
    }
  };
}

/**
 * Retrieves complete details and conversation history for a single task occurrence.
 * Enforces strict ownership/assignment verification on the server.
 */
function handleGetTaskDetails(currentUser, payload) {
  const occurrenceId = String((payload && payload.occurrence_id) || '').trim();
  if (!occurrenceId) {
    return { success: false, error: 'occurrence_id is required.', code: 'VALIDATION_ERROR' };
  }

  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const occ = occurrences.find(function(o) { return String(o.occurrence_id) === occurrenceId; });
  if (!occ) {
    return { success: false, error: 'Task occurrence not found.', code: 'NOT_FOUND' };
  }

  if (currentUser.role !== 'OWNER' && String(occ.assigned_user_id) !== String(currentUser.user_id)) {
    return {
      success: false,
      error: 'Access denied: You are not authorized to view another employee\'s task.',
      code: 'FORBIDDEN'
    };
  }

  const definitions = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const users = getTableRows(SHEET_NAMES.USERS);
  const updates = getTableRows(SHEET_NAMES.TASK_UPDATES);

  const defMap = {};
  definitions.forEach(function(d) { defMap[d.task_definition_id] = d; });
  const userMap = {};
  users.forEach(function(u) { userMap[u.user_id] = u; });

  const taskUpdates = updates
    .filter(function(u) { return String(u.occurrence_id) === occurrenceId; })
    .sort(function(a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });

  const updatesCountMap = {};
  updatesCountMap[occurrenceId] = taskUpdates.length;
  const lastUpdateMap = {};
  if (taskUpdates.length > 0) {
    lastUpdateMap[occurrenceId] = taskUpdates[taskUpdates.length - 1];
  }

  const enrichedTask = buildEnrichedTaskOccurrence(
    occ,
    defMap,
    userMap,
    updatesCountMap,
    lastUpdateMap,
    new Date().toISOString()
  );

  // Also include sibling occurrences if part of a recurring series
  const siblingOccurrences = occurrences
    .filter(function(o) {
      if (String(o.task_definition_id) !== String(occ.task_definition_id)) return false;
      if (currentUser.role !== 'OWNER' && String(o.assigned_user_id) !== String(currentUser.user_id)) return false;
      return true;
    })
    .map(function(o) {
      return {
        occurrence_id: o.occurrence_id,
        occurrence_date: o.occurrence_date,
        due_at: o.due_at,
        status: o.status,
        progress_percentage: Number(o.progress_percentage) || 0,
        completed_at: o.completed_at
      };
    })
    .sort(function(a, b) { return String(b.occurrence_date).localeCompare(String(a.occurrence_date)); });

  return {
    success: true,
    data: {
      task: enrichedTask,
      updates: taskUpdates,
      series_occurrences: siblingOccurrences
    }
  };
}

/**
 * Creates a new task (One-time, Daily, Weekly, or Monthly) and generates its initial occurrence(s).
 * Owner only.
 */
function handleCreateTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can create and delegate tasks.',
      code: 'FORBIDDEN'
    };
  }

  const taskName = String((payload && payload.task_name) || '').trim();
  const description = String((payload && payload.description) || '').trim();
  const additionalInstructions = String((payload && payload.additional_instructions) || '').trim();
  const assignedUserId = String((payload && payload.assigned_user_id) || '').trim();
  const occurrenceType = String((payload && payload.occurrence_type) || 'ONE_TIME').trim().toUpperCase();
  const priority = String((payload && payload.priority) || 'Medium').trim();
  const startDate = String((payload && payload.start_date) || formatDateYMD(new Date())).substring(0, 10);
  const endDate = payload && payload.end_date ? String(payload.end_date).substring(0, 10) : '';
  const dueTime = String((payload && payload.due_time) || '18:00').trim();
  const recurrenceRule = (payload && payload.recurrence_rule) || {};

  if (!taskName || taskName.length < 3) {
    return { success: false, error: 'Task name is required (minimum 3 characters).', code: 'VALIDATION_ERROR' };
  }
  if (!description) {
    return { success: false, error: 'Task description is required.', code: 'VALIDATION_ERROR' };
  }
  if (!assignedUserId) {
    return { success: false, error: 'Please select an employee to assign the task.', code: 'VALIDATION_ERROR' };
  }
  if (VALID_OCCURRENCE_TYPES.indexOf(occurrenceType) === -1) {
    return { success: false, error: 'Invalid occurrence type.', code: 'VALIDATION_ERROR' };
  }
  if (VALID_PRIORITIES.indexOf(priority) === -1) {
    return { success: false, error: 'Invalid priority level.', code: 'VALIDATION_ERROR' };
  }
  if (endDate && endDate < startDate) {
    return { success: false, error: 'End date cannot be earlier than start date.', code: 'VALIDATION_ERROR' };
  }

  // Validate assignee exists and is an active non-Owner (or valid active user)
  const users = getTableRows(SHEET_NAMES.USERS);
  const assignee = users.find(function(u) { return String(u.user_id) === assignedUserId; });
  if (!assignee) {
    return { success: false, error: 'Assigned user does not exist.', code: 'VALIDATION_ERROR' };
  }
  if (!toBoolean(assignee.is_active)) {
    return { success: false, error: 'Cannot assign tasks to a deactivated user account.', code: 'VALIDATION_ERROR' };
  }
  if (assignee.role === 'OWNER') {
    return {
      success: false,
      error: 'Tasks must be delegated to non-Owner (Employee) accounts.',
      code: 'VALIDATION_ERROR'
    };
  }

  const nowIso = new Date().toISOString();
  const defId = generateUniqueId('TSK');

  const definitionRecord = {
    task_definition_id: defId,
    task_name: taskName,
    description: description,
    additional_instructions: additionalInstructions,
    created_by: currentUser.user_id,
    assigned_user_id: assignedUserId,
    occurrence_type: occurrenceType,
    recurrence_rule_json: JSON.stringify(recurrenceRule),
    start_date: startDate,
    end_date: endDate,
    due_time: dueTime,
    default_priority: priority,
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso
  };

  insertRow(SHEET_NAMES.TASK_DEFINITIONS, definitionRecord);

  let createdOccurrences = [];
  if (occurrenceType === 'ONE_TIME') {
    const dueDateYMD = payload.due_date ? String(payload.due_date).substring(0, 10) : startDate;
    const dueAtIso = payload.due_at ? String(payload.due_at) : combineDateAndDueTime(dueDateYMD, dueTime);
    const singleOcc = {
      occurrence_id: generateUniqueId('OCC'),
      task_definition_id: defId,
      occurrence_date: dueDateYMD,
      due_at: dueAtIso,
      assigned_user_id: assignedUserId,
      status: 'Assigned',
      priority: priority,
      progress_percentage: 0,
      custom_instructions: additionalInstructions,
      created_at: nowIso,
      updated_at: nowIso,
      completed_at: ''
    };
    insertRow(SHEET_NAMES.TASK_OCCURRENCES, singleOcc);
    createdOccurrences.push(singleOcc);
  } else {
    // Generate occurrences from startDate through max(startDate + 14 days, today + 7 days)
    const startObj = parseDateYMD(startDate) || new Date();
    const horizonEnd = new Date(Math.max(Date.now(), startObj.getTime()) + 14 * 24 * 60 * 60 * 1000);
    const horizonYMD = endDate && endDate < formatDateYMD(horizonEnd) ? endDate : formatDateYMD(horizonEnd);
    createdOccurrences = generateOccurrencesForDefinition(definitionRecord, startDate, horizonYMD);

    // Ensure at least the first matching occurrence is created even if monthly/weekly falls slightly after 14d
    if (createdOccurrences.length === 0) {
      const extendedEnd = new Date(startObj.getTime() + 35 * 24 * 60 * 60 * 1000);
      const extYMD = endDate && endDate < formatDateYMD(extendedEnd) ? endDate : formatDateYMD(extendedEnd);
      createdOccurrences = generateOccurrencesForDefinition(definitionRecord, startDate, extYMD);
    }
  }

  // Record initial creation entry in TaskUpdates timeline for each generated occurrence
  createdOccurrences.forEach(function(occ) {
    insertRow(SHEET_NAMES.TASK_UPDATES, {
      update_id: generateUniqueId('UPD'),
      occurrence_id: occ.occurrence_id,
      task_definition_id: defId,
      author_user_id: currentUser.user_id,
      author_name: currentUser.full_name,
      author_role: currentUser.role,
      update_type: 'TASK_CREATED',
      message: 'Task delegated to ' + assignee.full_name + ' (' + occurrenceType + ', Priority: ' + priority + ').',
      work_completed: '',
      blockers: '',
      help_required: '',
      next_steps: additionalInstructions || '',
      progress_percentage: 0,
      previous_status: '',
      new_status: 'Assigned',
      created_at: nowIso
    });
  });

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'TASK_CREATED',
    entity_type: 'TASK_DEFINITION',
    entity_id: defId,
    summary: 'Created ' + occurrenceType + ' task "' + taskName + '" assigned to ' + assignee.full_name + ' (' + createdOccurrences.length + ' occurrence(s) generated).',
    metadata: {
      task_definition_id: defId,
      assigned_user_id: assignedUserId,
      occurrence_type: occurrenceType,
      priority: priority,
      occurrences_created: createdOccurrences.length
    }
  });

  return {
    success: true,
    data: {
      definition: definitionRecord,
      occurrences: createdOccurrences,
      message: 'Task "' + taskName + '" created and delegated to ' + assignee.full_name + '.'
    }
  };
}

/**
 * Updates an existing task occurrence (and/or its parent definition) — Owner only.
 */
function handleUpdateTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can edit task details.',
      code: 'FORBIDDEN'
    };
  }

  const occurrenceId = String((payload && payload.occurrence_id) || '').trim();
  if (!occurrenceId) {
    return { success: false, error: 'occurrence_id is required.', code: 'VALIDATION_ERROR' };
  }

  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const occ = occurrences.find(function(o) { return String(o.occurrence_id) === occurrenceId; });
  if (!occ) {
    return { success: false, error: 'Task occurrence not found.', code: 'NOT_FOUND' };
  }

  const nowIso = new Date().toISOString();
  const occUpdates = { updated_at: nowIso };
  const defUpdates = { updated_at: nowIso };
  const changesSummary = [];

  if (payload.priority && VALID_PRIORITIES.indexOf(payload.priority) !== -1 && payload.priority !== occ.priority) {
    occUpdates.priority = payload.priority;
    changesSummary.push('Priority changed from ' + occ.priority + ' to ' + payload.priority);
  }

  if (payload.due_at && String(payload.due_at) !== String(occ.due_at)) {
    occUpdates.due_at = String(payload.due_at);
    occUpdates.occurrence_date = String(payload.due_at).substring(0, 10);
    changesSummary.push('Due date updated to ' + String(payload.due_at).substring(0, 16).replace('T', ' '));
  }

  if (payload.additional_instructions !== undefined) {
    occUpdates.custom_instructions = String(payload.additional_instructions).trim();
    defUpdates.additional_instructions = String(payload.additional_instructions).trim();
    changesSummary.push('Updated task instructions');
  }

  if (payload.task_name !== undefined && String(payload.task_name).trim().length >= 3) {
    defUpdates.task_name = String(payload.task_name).trim();
    changesSummary.push('Renamed task to "' + defUpdates.task_name + '"');
  }

  if (payload.description !== undefined && String(payload.description).trim().length > 0) {
    defUpdates.description = String(payload.description).trim();
    changesSummary.push('Updated task description');
  }

  if (payload.assigned_user_id && String(payload.assigned_user_id) !== String(occ.assigned_user_id)) {
    const users = getTableRows(SHEET_NAMES.USERS);
    const newAssignee = users.find(function(u) { return String(u.user_id) === String(payload.assigned_user_id); });
    if (!newAssignee || !toBoolean(newAssignee.is_active) || newAssignee.role === 'OWNER') {
      return {
        success: false,
        error: 'Assigned user must be an active Employee.',
        code: 'VALIDATION_ERROR'
      };
    }
    occUpdates.assigned_user_id = newAssignee.user_id;
    if (payload.apply_to_series) {
      defUpdates.assigned_user_id = newAssignee.user_id;
    }
    changesSummary.push('Reassigned task to ' + newAssignee.full_name);
  }

  const updatedOcc = updateRowByKey(SHEET_NAMES.TASK_OCCURRENCES, 'occurrence_id', occurrenceId, occUpdates);
  if (Object.keys(defUpdates).length > 1) {
    updateRowByKey(SHEET_NAMES.TASK_DEFINITIONS, 'task_definition_id', occ.task_definition_id, defUpdates);
  }

  if (changesSummary.length > 0) {
    const summaryText = changesSummary.join('; ') + '.';
    insertRow(SHEET_NAMES.TASK_UPDATES, {
      update_id: generateUniqueId('UPD'),
      occurrence_id: occurrenceId,
      task_definition_id: occ.task_definition_id,
      author_user_id: currentUser.user_id,
      author_name: currentUser.full_name,
      author_role: currentUser.role,
      update_type: 'TASK_EDITED',
      message: summaryText,
      work_completed: '',
      blockers: '',
      help_required: '',
      next_steps: occUpdates.custom_instructions || '',
      progress_percentage: Number(updatedOcc.progress_percentage) || 0,
      previous_status: occ.status,
      new_status: updatedOcc.status,
      created_at: nowIso
    });

    appendAuditLog({
      actor_user_id: currentUser.user_id,
      actor_name: currentUser.full_name,
      actor_role: currentUser.role,
      action_type: 'TASK_UPDATED',
      entity_type: 'TASK_OCCURRENCE',
      entity_id: occurrenceId,
      summary: summaryText,
      metadata: { occurrence_id: occurrenceId, changes: changesSummary }
    });
  }

  return {
    success: true,
    data: {
      occurrence: updatedOcc,
      message: 'Task details updated successfully.'
    }
  };
}

/**
 * Reassigns a task occurrence (and optionally future occurrences in its recurring series) to another Employee.
 */
function handleAssignTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can reassign tasks.',
      code: 'FORBIDDEN'
    };
  }

  const occurrenceId = String((payload && payload.occurrence_id) || '').trim();
  const newUserId = String((payload && payload.assigned_user_id) || '').trim();
  const applyToFuture = toBoolean(payload && payload.apply_to_future);

  if (!occurrenceId || !newUserId) {
    return { success: false, error: 'occurrence_id and assigned_user_id are required.', code: 'VALIDATION_ERROR' };
  }

  return handleUpdateTask(currentUser, {
    occurrence_id: occurrenceId,
    assigned_user_id: newUserId,
    apply_to_series: applyToFuture
  });
}

/**
 * Enforces state machine transitions for task statuses.
 */
function handleUpdateTaskStatus(currentUser, payload) {
  const occurrenceId = String((payload && payload.occurrence_id) || '').trim();
  const nextStatus = String((payload && payload.status) || '').trim();
  const note = String((payload && payload.message) || '').trim();

  if (!occurrenceId || !nextStatus) {
    return { success: false, error: 'occurrence_id and status are required.', code: 'VALIDATION_ERROR' };
  }

  if (VALID_STATUSES.indexOf(nextStatus) === -1) {
    return { success: false, error: 'Invalid status: ' + nextStatus, code: 'VALIDATION_ERROR' };
  }

  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const occ = occurrences.find(function(o) { return String(o.occurrence_id) === occurrenceId; });
  if (!occ) {
    return { success: false, error: 'Task occurrence not found.', code: 'NOT_FOUND' };
  }

  // Enforce ownership for Employees
  if (currentUser.role !== 'OWNER' && String(occ.assigned_user_id) !== String(currentUser.user_id)) {
    return {
      success: false,
      error: 'Access denied: You can only update statuses for tasks assigned to you.',
      code: 'FORBIDDEN'
    };
  }

  const currentStatus = String(occ.status || 'Assigned');
  if (currentStatus === nextStatus) {
    return {
      success: true,
      data: { occurrence: occ, message: 'Task is already in status "' + nextStatus + '".' }
    };
  }

  const transitionMap = currentUser.role === 'OWNER'
    ? OWNER_ALLOWED_TRANSITIONS
    : EMPLOYEE_ALLOWED_TRANSITIONS;

  const allowedNext = transitionMap[currentStatus] || [];
  if (allowedNext.indexOf(nextStatus) === -1) {
    return {
      success: false,
      error: currentUser.role === 'EMPLOYEE' && nextStatus === 'Completed'
        ? 'Employees cannot mark tasks Completed directly. Please submit your work as "Awaiting Owner Review" for Owner sign-off.'
        : 'Invalid status transition from "' + currentStatus + '" to "' + nextStatus + '" for role ' + currentUser.role + '.',
      code: 'INVALID_STATUS_TRANSITION'
    };
  }

  const nowIso = new Date().toISOString();
  let nextProgress = Number(occ.progress_percentage) || 0;
  if (payload.progress_percentage !== undefined) {
    nextProgress = Math.min(100, Math.max(0, parseInt(payload.progress_percentage, 10) || 0));
  } else if (nextStatus === 'Completed' || nextStatus === 'Awaiting Owner Review') {
    nextProgress = 100;
  } else if (nextStatus === 'In Progress' && nextProgress === 0) {
    nextProgress = 15;
  }

  const occUpdates = {
    status: nextStatus,
    progress_percentage: nextProgress,
    updated_at: nowIso,
    completed_at: nextStatus === 'Completed' ? nowIso : (currentStatus === 'Completed' ? '' : occ.completed_at)
  };

  const updatedOcc = updateRowByKey(SHEET_NAMES.TASK_OCCURRENCES, 'occurrence_id', occurrenceId, occUpdates);

  const timelineMsg = note || ('Status changed from "' + currentStatus + '" to "' + nextStatus + '".');
  insertRow(SHEET_NAMES.TASK_UPDATES, {
    update_id: generateUniqueId('UPD'),
    occurrence_id: occurrenceId,
    task_definition_id: occ.task_definition_id,
    author_user_id: currentUser.user_id,
    author_name: currentUser.full_name,
    author_role: currentUser.role,
    update_type: 'STATUS_CHANGE',
    message: timelineMsg,
    work_completed: '',
    blockers: nextStatus === 'Blocked' ? timelineMsg : '',
    help_required: '',
    next_steps: '',
    progress_percentage: nextProgress,
    previous_status: currentStatus,
    new_status: nextStatus,
    created_at: nowIso
  });

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'STATUS_CHANGED',
    entity_type: 'TASK_OCCURRENCE',
    entity_id: occurrenceId,
    summary: currentUser.full_name + ' changed status of ' + occurrenceId + ' from "' + currentStatus + '" to "' + nextStatus + '".',
    metadata: {
      occurrence_id: occurrenceId,
      previous_status: currentStatus,
      new_status: nextStatus,
      progress_percentage: nextProgress
    }
  });

  return {
    success: true,
    data: {
      occurrence: updatedOcc,
      message: 'Task status updated to "' + nextStatus + '".'
    }
  };
}

/**
 * Cancels a task occurrence (Owner only).
 */
function handleCancelTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return { success: false, error: 'Only Owners can cancel tasks.', code: 'FORBIDDEN' };
  }
  return handleUpdateTaskStatus(currentUser, {
    occurrence_id: payload && payload.occurrence_id,
    status: 'Cancelled',
    message: (payload && payload.reason) || 'Task cancelled by Owner.'
  });
}

/**
 * Reopens a Completed or Cancelled task occurrence (Owner only).
 */
function handleReopenTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return { success: false, error: 'Only Owners can reopen tasks.', code: 'FORBIDDEN' };
  }
  return handleUpdateTaskStatus(currentUser, {
    occurrence_id: payload && payload.occurrence_id,
    status: (payload && payload.target_status) || 'In Progress',
    progress_percentage: payload && payload.progress_percentage !== undefined ? payload.progress_percentage : 50,
    message: (payload && payload.reason) || 'Task reopened by Owner for further work.'
  });
}
