/**
 * ============================================================================
 * Recurrence.gs - Recurring Task Definition & Idempotent Occurrence Generator
 * ============================================================================
 *
 * RECURRENCE DESIGN RULES:
 * 1. Separation of Definition and Occurrences:
 *    - `TaskDefinitions` holds the master template & schedule (`ONE_TIME`, `DAILY`, `WEEKLY`, `MONTHLY`).
 *    - `TaskOccurrences` holds each individual date's executable assignment with its own
 *      `occurrence_id`, `status`, `due_at`, `progress_percentage`, and discussion timeline.
 * 2. Idempotency / Deduplication:
 *    - Every occurrence has a composite natural key `(task_definition_id, occurrence_date)`.
 *    - Running `generateUpcomingOccurrencesInternal()` multiple times never creates duplicate
 *      occurrences for the same date.
 * 3. Short-Month Rule for Monthly Tasks:
 *    - When a monthly task is scheduled for day `D` (e.g., 31st) and a month has fewer than `D` days
 *      (e.g., February with 28/29 days or April with 30 days), the occurrence snaps to the
 *      last valid day of that month (`Math.min(D, daysInMonth)`), unless `SKIP_SHORT_MONTH`
 *      is explicitly configured in `recurrence_rule_json`.
 * 4. Reassignment & Editing Rule:
 *    - Updating a recurring `TaskDefinition` updates the master template for future generated
 *      occurrences and optionally propagates assignee/priority/instructions to existing
 *      non-terminal (`Assigned`, `In Progress`, `Blocked`, `On Hold`) future occurrences while
 *      leaving `Completed` and `Cancelled` historical occurrences untouched.
 */

const VALID_OCCURRENCE_TYPES = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * Parses recurrence_rule_json safely.
 */
function parseRecurrenceRule(ruleJsonStr) {
  if (!ruleJsonStr) return {};
  if (typeof ruleJsonStr === 'object') return ruleJsonStr;
  try {
    return JSON.parse(ruleJsonStr);
  } catch (e) {
    return {};
  }
}

/**
 * Formats a Date object as YYYY-MM-DD in UTC (date-only representation).
 */
function formatDateYMD(dateObj) {
  const y = dateObj.getUTCFullYear();
  const m = ('0' + (dateObj.getUTCMonth() + 1)).slice(-2);
  const d = ('0' + dateObj.getUTCDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

/**
 * Parses a YYYY-MM-DD string into a UTC Date at 00:00:00Z.
 */
function parseDateYMD(ymdStr) {
  if (!ymdStr) return null;
  const clean = String(ymdStr).substring(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(Date.UTC(year, month, day, 0, 0, 0));
}

/**
 * Returns number of days in a given UTC year and 0-indexed UTC month.
 */
function getDaysInMonthUTC(year, monthZeroIndexed) {
  return new Date(Date.UTC(year, monthZeroIndexed + 1, 0)).getUTCDate();
}

/**
 * Combines a YYYY-MM-DD date string and an HH:mm time string into an ISO timestamp.
 */
function combineDateAndDueTime(ymdStr, dueTimeStr) {
  const timePart = String(dueTimeStr || '18:00').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(timePart);
  const hh = match ? match[1] : '18';
  const mm = match ? match[2] : '00';
  return ymdStr + 'T' + hh + ':' + mm + ':00.000Z';
}

/**
 * Determines whether a recurring TaskDefinition should generate an occurrence on `dateObj` (UTC).
 */
function doesDefinitionMatchDate(definition, dateObj) {
  const occType = String(definition.occurrence_type || 'ONE_TIME').toUpperCase();
  const dateYMD = formatDateYMD(dateObj);
  const startYMD = String(definition.start_date || '').substring(0, 10);
  const endYMD = definition.end_date ? String(definition.end_date).substring(0, 10) : '';

  if (startYMD && dateYMD < startYMD) return false;
  if (endYMD && dateYMD > endYMD) return false;

  const rule = parseRecurrenceRule(definition.recurrence_rule_json);

  if (occType === 'ONE_TIME') {
    return dateYMD === startYMD;
  }

  if (occType === 'DAILY') {
    const intervalDays = Math.max(1, parseInt(rule.interval || 1, 10));
    const skipSundays = Boolean(rule.skip_sundays);
    if (skipSundays && dateObj.getUTCDay() === 0) return false;
    if (intervalDays === 1) return true;
    const startObj = parseDateYMD(startYMD);
    if (!startObj) return true;
    const diffDays = Math.round((dateObj.getTime() - startObj.getTime()) / (24 * 60 * 60 * 1000));
    return diffDays >= 0 && (diffDays % intervalDays === 0);
  }

  if (occType === 'WEEKLY') {
    // rule.weekdays is an array of integers 0 (Sun) .. 6 (Sat) or weekday names
    let weekdays = Array.isArray(rule.weekdays) ? rule.weekdays : [];
    const dayMap = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
    const normalizedDays = weekdays.map(function(d) {
      if (typeof d === 'number') return d;
      const up = String(d).trim().toUpperCase().substring(0, 3);
      return dayMap[up] !== undefined ? dayMap[up] : parseInt(d, 10);
    }).filter(function(n) { return !isNaN(n) && n >= 0 && n <= 6; });

    const startObj = parseDateYMD(startYMD);
    if (normalizedDays.length === 0 && startObj) {
      normalizedDays.push(startObj.getUTCDay());
    }
    if (normalizedDays.indexOf(dateObj.getUTCDay()) === -1) return false;

    const intervalWeeks = Math.max(1, parseInt(rule.interval || 1, 10));
    if (intervalWeeks === 1 || !startObj) return true;
    const diffDays = Math.floor((dateObj.getTime() - startObj.getTime()) / (24 * 60 * 60 * 1000));
    const diffWeeks = Math.floor(diffDays / 7);
    return diffWeeks >= 0 && (diffWeeks % intervalWeeks === 0);
  }

  if (occType === 'MONTHLY') {
    const startObj = parseDateYMD(startYMD);
    const configuredDay = Math.min(31, Math.max(1, parseInt(rule.day_of_month || (startObj ? startObj.getUTCDate() : 1), 10)));
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth();
    const daysInMonth = getDaysInMonthUTC(year, month);
    const shortMonthPolicy = String(rule.short_month_rule || 'LAST_DAY_OF_MONTH').toUpperCase();

    if (configuredDay > daysInMonth && shortMonthPolicy === 'SKIP') {
      return false;
    }
    const effectiveDay = Math.min(configuredDay, daysInMonth);
    return dateObj.getUTCDate() === effectiveDay;
  }

  return false;
}

/**
 * Generates occurrences for a specific TaskDefinition across [fromYMD, toYMD] idempotently.
 */
function generateOccurrencesForDefinition(definition, fromYMD, toYMD, existingOccurrencesCache) {
  if (!toBoolean(definition.is_active)) return [];

  const allOccurrences = existingOccurrencesCache || getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const existingDatesSet = new Set();
  allOccurrences.forEach(function(occ) {
    if (String(occ.task_definition_id) === String(definition.task_definition_id)) {
      existingDatesSet.add(String(occ.occurrence_date).substring(0, 10));
    }
  });

  const startBound = parseDateYMD(fromYMD);
  const endBound = parseDateYMD(toYMD);
  if (!startBound || !endBound || startBound.getTime() > endBound.getTime()) {
    return [];
  }

  const createdOccurrences = [];
  const nowIso = new Date().toISOString();
  const maxDays = 95; // Guard against unbounded loops
  let cursor = new Date(startBound.getTime());
  let steps = 0;

  while (cursor.getTime() <= endBound.getTime() && steps < maxDays) {
    steps++;
    const ymd = formatDateYMD(cursor);
    if (!existingDatesSet.has(ymd) && doesDefinitionMatchDate(definition, cursor)) {
      const dueAt = combineDateAndDueTime(ymd, definition.due_time || '18:00');
      const occRecord = {
        occurrence_id: generateUniqueId('OCC'),
        task_definition_id: definition.task_definition_id,
        occurrence_date: ymd,
        due_at: dueAt,
        assigned_user_id: definition.assigned_user_id,
        status: 'Assigned',
        priority: definition.default_priority || 'Medium',
        progress_percentage: 0,
        custom_instructions: definition.additional_instructions || '',
        created_at: nowIso,
        updated_at: nowIso,
        completed_at: ''
      };
      insertRow(SHEET_NAMES.TASK_OCCURRENCES, occRecord);
      existingDatesSet.add(ymd);
      createdOccurrences.push(occRecord);
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return createdOccurrences;
}

/**
 * Scans all active recurring TaskDefinitions and generates occurrences from
 * max(start_date, today - 7 days) through (today + horizonDays).
 * Idempotent: safe to run via time-driven trigger or API action.
 */
function generateUpcomingOccurrencesInternal(customHorizonDays) {
  const definitions = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const allOccurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const horizonDays = Math.min(60, Math.max(1, parseInt(customHorizonDays || 7, 10)));

  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lookbackUTC = new Date(todayUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
  const horizonUTC = new Date(todayUTC.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const toYMD = formatDateYMD(horizonUTC);
  let totalCreated = 0;
  const createdItems = [];

  definitions.forEach(function(def) {
    if (!toBoolean(def.is_active)) return;
    const occType = String(def.occurrence_type || 'ONE_TIME').toUpperCase();
    if (occType === 'ONE_TIME') return;

    const defStart = String(def.start_date || '').substring(0, 10);
    const lookbackYMD = formatDateYMD(lookbackUTC);
    const fromYMD = defStart > lookbackYMD ? defStart : lookbackYMD;

    const newlyCreated = generateOccurrencesForDefinition(def, fromYMD, toYMD, allOccurrences);
    totalCreated += newlyCreated.length;
    newlyCreated.forEach(function(item) {
      allOccurrences.push(item);
      createdItems.push(item);
    });
  });

  return {
    totalCreated: totalCreated,
    horizonDate: toYMD,
    createdItems: createdItems
  };
}

/**
 * Time-driven trigger entry point for Google Apps Script (e.g., run daily at 00:15).
 */
function scheduledDailyRecurrenceTrigger() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    ensureDatabaseInitialized();
    const res = generateUpcomingOccurrencesInternal(7);
    if (res.totalCreated > 0) {
      appendAuditLog({
        actor_user_id: 'SYSTEM',
        actor_name: 'Automated Scheduler',
        actor_role: 'SYSTEM',
        action_type: 'RECURRENCE_GENERATED',
        entity_type: 'TASK_OCCURRENCE',
        entity_id: 'BATCH',
        summary: 'Generated ' + res.totalCreated + ' upcoming recurring task occurrence(s) through ' + res.horizonDate + '.',
        metadata: { count: res.totalCreated, horizonDate: res.horizonDate }
      });
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Owner API handler to manually trigger occurrence generation across active recurring definitions.
 */
function handleGenerateOccurrencesAction(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Only Owners can trigger recurring task generation.',
      code: 'FORBIDDEN'
    };
  }

  const horizonDays = (payload && payload.horizon_days) ? parseInt(payload.horizon_days, 10) : 7;
  const result = generateUpcomingOccurrencesInternal(horizonDays);

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'RECURRENCE_GENERATED',
    entity_type: 'TASK_OCCURRENCE',
    entity_id: 'BATCH',
    summary: currentUser.full_name + ' ran occurrence generator (' + result.totalCreated + ' new occurrences created through ' + result.horizonDate + ').',
    metadata: { count: result.totalCreated, horizonDate: result.horizonDate }
  });

  return {
    success: true,
    data: {
      created_count: result.totalCreated,
      horizon_date: result.horizonDate,
      occurrences: result.createdItems,
      message: result.totalCreated > 0
        ? 'Generated ' + result.totalCreated + ' new task occurrence(s) through ' + result.horizonDate + '.'
        : 'All recurring task occurrences through ' + result.horizonDate + ' are already up to date (0 duplicates created).'
    }
  };
}

/**
 * Lists all TaskDefinitions (Owner only).
 */
function handleListTaskDefinitions(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Only Owners can view master recurring task definitions.',
      code: 'FORBIDDEN'
    };
  }

  const defs = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const users = getTableRows(SHEET_NAMES.USERS);
  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const userMap = {};
  users.forEach(function(u) { userMap[u.user_id] = u; });

  const enriched = defs.map(function(d) {
    const defOccs = occurrences.filter(function(o) {
      return String(o.task_definition_id) === String(d.task_definition_id);
    });
    const assignee = userMap[d.assigned_user_id];
    const creator = userMap[d.created_by];
    return {
      task_definition_id: d.task_definition_id,
      task_name: d.task_name,
      description: d.description,
      additional_instructions: d.additional_instructions,
      created_by: d.created_by,
      created_by_name: creator ? creator.full_name : d.created_by,
      assigned_user_id: d.assigned_user_id,
      assigned_user_name: assignee ? assignee.full_name : d.assigned_user_id,
      occurrence_type: d.occurrence_type,
      recurrence_rule: parseRecurrenceRule(d.recurrence_rule_json),
      start_date: d.start_date,
      end_date: d.end_date,
      due_time: d.due_time || '18:00',
      default_priority: d.default_priority,
      is_active: toBoolean(d.is_active),
      total_occurrences: defOccs.length,
      completed_occurrences: defOccs.filter(function(o) { return o.status === 'Completed'; }).length,
      active_occurrences: defOccs.filter(function(o) { return o.status !== 'Completed' && o.status !== 'Cancelled'; }).length,
      created_at: d.created_at,
      updated_at: d.updated_at
    };
  });

  return {
    success: true,
    data: { definitions: enriched }
  };
}

/**
 * Updates a Recurring Task Definition and optionally updates pending future occurrences.
 */
function handleUpdateRecurringTask(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Only Owners can modify recurring task definitions.',
      code: 'FORBIDDEN'
    };
  }

  const defId = String((payload && payload.task_definition_id) || '').trim();
  if (!defId) {
    return { success: false, error: 'task_definition_id is required.', code: 'VALIDATION_ERROR' };
  }

  const defs = getTableRows(SHEET_NAMES.TASK_DEFINITIONS);
  const existing = defs.find(function(d) { return String(d.task_definition_id) === defId; });
  if (!existing) {
    return { success: false, error: 'Task definition not found.', code: 'NOT_FOUND' };
  }

  const nowIso = new Date().toISOString();
  const updates = { updated_at: nowIso };

  if (payload.task_name !== undefined) updates.task_name = String(payload.task_name).trim();
  if (payload.description !== undefined) updates.description = String(payload.description).trim();
  if (payload.additional_instructions !== undefined) updates.additional_instructions = String(payload.additional_instructions).trim();
  if (payload.assigned_user_id !== undefined) updates.assigned_user_id = String(payload.assigned_user_id).trim();
  if (payload.default_priority !== undefined) updates.default_priority = String(payload.default_priority).trim();
  if (payload.end_date !== undefined) updates.end_date = String(payload.end_date).trim();
  if (payload.due_time !== undefined) updates.due_time = String(payload.due_time).trim();
  if (payload.is_active !== undefined) updates.is_active = toBoolean(payload.is_active);
  if (payload.recurrence_rule !== undefined) {
    updates.recurrence_rule_json = JSON.stringify(payload.recurrence_rule || {});
  }

  const updatedDef = updateRowByKey(SHEET_NAMES.TASK_DEFINITIONS, 'task_definition_id', defId, updates);

  // Propagate assignee/priority changes to open future occurrences if requested (default true)
  const applyToOpenOccurrences = payload.apply_to_open_occurrences !== false;
  let updatedOccCount = 0;

  if (applyToOpenOccurrences) {
    const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
    occurrences.forEach(function(occ) {
      if (String(occ.task_definition_id) === defId && ['Completed', 'Cancelled'].indexOf(occ.status) === -1) {
        const occUpdates = { updated_at: nowIso };
        if (updates.assigned_user_id) occUpdates.assigned_user_id = updates.assigned_user_id;
        if (updates.default_priority) occUpdates.priority = updates.default_priority;
        if (updates.additional_instructions !== undefined) occUpdates.custom_instructions = updates.additional_instructions;
        updateRowByKey(SHEET_NAMES.TASK_OCCURRENCES, 'occurrence_id', occ.occurrence_id, occUpdates);
        updatedOccCount++;
      }
    });
  }

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'RECURRING_DEFINITION_UPDATED',
    entity_type: 'TASK_DEFINITION',
    entity_id: defId,
    summary: 'Updated recurring task definition "' + updatedDef.task_name + '" (' + updatedOccCount + ' open occurrence(s) synchronized).',
    metadata: { task_definition_id: defId, updated_open_occurrences: updatedOccCount }
  });

  return {
    success: true,
    data: {
      definition: updatedDef,
      updated_open_occurrences: updatedOccCount,
      message: 'Recurring task schedule updated successfully.'
    }
  };
}
