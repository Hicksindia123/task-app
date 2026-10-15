/**
 * ============================================================================
 * Updates.gs - Progress Reporting, Blocker Escalation & Owner Instructions
 * ============================================================================
 */

const VALID_UPDATE_TYPES = [
  'PROGRESS_UPDATE',
  'BLOCKER_REPORTED',
  'CLARIFICATION_REQUEST',
  'SUBMIT_FOR_REVIEW',
  'OWNER_INSTRUCTION',
  'OWNER_FEEDBACK',
  'STATUS_CHANGE',
  'TASK_CREATED',
  'TASK_EDITED'
];

/**
 * Lists chronological updates for a given task occurrence.
 */
function handleListTaskUpdates(currentUser, payload) {
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
      error: 'Access denied: You cannot read updates for another employee\'s task.',
      code: 'FORBIDDEN'
    };
  }

  const updates = getTableRows(SHEET_NAMES.TASK_UPDATES)
    .filter(function(u) { return String(u.occurrence_id) === occurrenceId; })
    .sort(function(a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });

  return {
    success: true,
    data: { updates: updates }
  };
}

/**
 * Adds a structured progress update, blocker report, or Owner instruction to a task occurrence.
 * Appends immutably to `TaskUpdates` (never overwrites historical updates).
 */
function handleAddTaskUpdate(currentUser, payload) {
  const occurrenceId = String((payload && payload.occurrence_id) || '').trim();
  const message = String((payload && payload.message) || '').trim();
  const workCompleted = String((payload && payload.work_completed) || '').trim();
  const blockers = String((payload && payload.blockers) || '').trim();
  const helpRequired = String((payload && payload.help_required) || '').trim();
  const nextSteps = String((payload && payload.next_steps) || '').trim();

  if (!occurrenceId) {
    return { success: false, error: 'occurrence_id is required.', code: 'VALIDATION_ERROR' };
  }
  if (!message && !workCompleted && !blockers) {
    return {
      success: false,
      error: 'Please provide an update message, work completed summary, or blocker description.',
      code: 'VALIDATION_ERROR'
    };
  }

  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const occ = occurrences.find(function(o) { return String(o.occurrence_id) === occurrenceId; });
  if (!occ) {
    return { success: false, error: 'Task occurrence not found.', code: 'NOT_FOUND' };
  }

  // Enforce RBAC: Employees can only post to their own tasks
  if (currentUser.role !== 'OWNER' && String(occ.assigned_user_id) !== String(currentUser.user_id)) {
    return {
      success: false,
      error: 'Access denied: You cannot post updates to another employee\'s task.',
      code: 'FORBIDDEN'
    };
  }

  const previousStatus = String(occ.status || 'Assigned');
  let nextStatus = previousStatus;
  let updateType = String((payload && payload.update_type) || '').trim().toUpperCase();

  if (!updateType || VALID_UPDATE_TYPES.indexOf(updateType) === -1) {
    updateType = currentUser.role === 'OWNER' ? 'OWNER_INSTRUCTION' : 'PROGRESS_UPDATE';
  }

  // Determine optional status transition requested alongside the update
  if (payload && payload.new_status && payload.new_status !== previousStatus) {
    const requestedStatus = String(payload.new_status).trim();
    const transitionMap = currentUser.role === 'OWNER'
      ? OWNER_ALLOWED_TRANSITIONS
      : EMPLOYEE_ALLOWED_TRANSITIONS;
    const allowed = transitionMap[previousStatus] || [];
    if (allowed.indexOf(requestedStatus) === -1) {
      return {
        success: false,
        error: 'Status transition from "' + previousStatus + '" to "' + requestedStatus + '" is not permitted for role ' + currentUser.role + '.',
        code: 'INVALID_STATUS_TRANSITION'
      };
    }
    nextStatus = requestedStatus;
  } else if (currentUser.role === 'EMPLOYEE') {
    if (updateType === 'BLOCKER_REPORTED' || blockers) {
      if ((EMPLOYEE_ALLOWED_TRANSITIONS[previousStatus] || []).indexOf('Blocked') !== -1) {
        nextStatus = 'Blocked';
        updateType = 'BLOCKER_REPORTED';
      }
    } else if (updateType === 'SUBMIT_FOR_REVIEW') {
      if ((EMPLOYEE_ALLOWED_TRANSITIONS[previousStatus] || []).indexOf('Awaiting Owner Review') !== -1) {
        nextStatus = 'Awaiting Owner Review';
      }
    } else if (previousStatus === 'Assigned') {
      nextStatus = 'In Progress';
    }
  }

  let progressPct = Number(occ.progress_percentage) || 0;
  if (payload && payload.progress_percentage !== undefined && payload.progress_percentage !== '') {
    progressPct = Math.min(100, Math.max(0, parseInt(payload.progress_percentage, 10) || 0));
  }
  if (nextStatus === 'Awaiting Owner Review' || nextStatus === 'Completed') {
    progressPct = 100;
  }

  const nowIso = new Date().toISOString();
  const updateId = generateUniqueId('UPD');

  const updateRecord = {
    update_id: updateId,
    occurrence_id: occurrenceId,
    task_definition_id: occ.task_definition_id,
    author_user_id: currentUser.user_id,
    author_name: currentUser.full_name,
    author_role: currentUser.role,
    update_type: updateType,
    message: message || workCompleted || blockers,
    work_completed: workCompleted,
    blockers: blockers,
    help_required: helpRequired,
    next_steps: nextSteps,
    progress_percentage: progressPct,
    previous_status: previousStatus,
    new_status: nextStatus,
    created_at: nowIso
  };

  insertRow(SHEET_NAMES.TASK_UPDATES, updateRecord);

  // Synchronize occurrence state
  const occPatch = {
    status: nextStatus,
    progress_percentage: progressPct,
    updated_at: nowIso
  };
  if (nextStatus === 'Completed') {
    occPatch.completed_at = nowIso;
  } else if (previousStatus === 'Completed' && nextStatus !== 'Completed') {
    occPatch.completed_at = '';
  }

  if (currentUser.role === 'OWNER' && updateType === 'OWNER_INSTRUCTION' && message) {
    occPatch.custom_instructions = message;
  }

  const updatedOcc = updateRowByKey(SHEET_NAMES.TASK_OCCURRENCES, 'occurrence_id', occurrenceId, occPatch);

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: currentUser.role === 'OWNER' ? 'OWNER_INSTRUCTION_POSTED' : 'EMPLOYEE_PROGRESS_POSTED',
    entity_type: 'TASK_OCCURRENCE',
    entity_id: occurrenceId,
    summary: currentUser.full_name + ' (' + currentUser.role + ') posted ' + updateType + ' on ' + occurrenceId + ' (' + progressPct + '%, Status: ' + nextStatus + ').',
    metadata: {
      update_id: updateId,
      occurrence_id: occurrenceId,
      update_type: updateType,
      progress_percentage: progressPct,
      previous_status: previousStatus,
      new_status: nextStatus
    }
  });

  return {
    success: true,
    data: {
      update: updateRecord,
      occurrence: updatedOcc,
      message: currentUser.role === 'OWNER'
        ? 'Instruction posted to task timeline.'
        : 'Progress update submitted successfully.'
    }
  };
}

/**
 * Convenience wrapper for employee progress submission.
 */
function handleUpdateProgress(currentUser, payload) {
  return handleAddTaskUpdate(currentUser, payload);
}
