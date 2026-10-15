/**
 * ============================================================================
 * Audit.gs - Immutable Activity Log & Application Settings Management
 * ============================================================================
 */

/**
 * Appends a structured audit log entry to the ActivityLog sheet.
 * Never logs passwords, hashes, or session tokens.
 */
function appendAuditLog(entry) {
  const nowIso = new Date().toISOString();
  const safeMeta = entry.metadata ? JSON.parse(JSON.stringify(entry.metadata)) : {};
  delete safeMeta.password;
  delete safeMeta.password_hash;
  delete safeMeta.sessionToken;
  delete safeMeta.token_hash;

  const record = {
    log_id: generateUniqueId('LOG'),
    actor_user_id: String(entry.actor_user_id || 'SYSTEM'),
    actor_name: String(entry.actor_name || 'System'),
    actor_role: String(entry.actor_role || 'SYSTEM'),
    action_type: String(entry.action_type || 'INFO'),
    entity_type: String(entry.entity_type || 'SYSTEM'),
    entity_id: String(entry.entity_id || ''),
    summary: String(entry.summary || ''),
    metadata_json: JSON.stringify(safeMeta),
    created_at: nowIso
  };

  insertRow(SHEET_NAMES.ACTIVITY_LOG, record);
  return record;
}

/**
 * Returns the full audit log with optional filtering (Owner only).
 */
function handleGetActivityLog(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can view the organization audit log.',
      code: 'FORBIDDEN'
    };
  }

  let logs = getTableRows(SHEET_NAMES.ACTIVITY_LOG);
  const actionFilter = String((payload && payload.action_type) || '').trim();
  const actorFilter = String((payload && payload.actor_user_id) || '').trim();
  const search = String((payload && payload.search) || '').trim().toLowerCase();
  const limit = Math.min(500, Math.max(10, parseInt((payload && payload.limit) || 150, 10)));

  if (actionFilter && actionFilter !== 'ALL') {
    logs = logs.filter(function(l) { return String(l.action_type) === actionFilter; });
  }
  if (actorFilter && actorFilter !== 'ALL') {
    logs = logs.filter(function(l) { return String(l.actor_user_id) === actorFilter; });
  }
  if (search) {
    logs = logs.filter(function(l) {
      const hay = (l.summary + ' ' + l.actor_name + ' ' + l.action_type + ' ' + l.entity_id).toLowerCase();
      return hay.indexOf(search) !== -1;
    });
  }

  logs.sort(function(a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  return {
    success: true,
    data: {
      logs: logs.slice(0, limit),
      total: logs.length
    }
  };
}

/**
 * Returns recent activity items for dashboard feed.
 */
function handleGetRecentActivity(currentUser, payload) {
  if (currentUser.role === 'OWNER') {
    return handleGetActivityLog(currentUser, { limit: 25 });
  }
  // For Employees, only return activity logs where they were the actor
  const logs = getTableRows(SHEET_NAMES.ACTIVITY_LOG)
    .filter(function(l) { return String(l.actor_user_id) === String(currentUser.user_id); })
    .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })
    .slice(0, 20);

  return {
    success: true,
    data: { logs: logs, total: logs.length }
  };
}

/**
 * Retrieves application settings.
 */
function handleGetAppSettings(currentUser) {
  const rows = getTableRows(SHEET_NAMES.APP_SETTINGS);
  const settingsObj = {};
  rows.forEach(function(r) {
    settingsObj[r.setting_key] = r.setting_value;
  });
  return {
    success: true,
    data: {
      settings: settingsObj,
      raw: rows
    }
  };
}

/**
 * Updates application settings (Owner only).
 */
function handleUpdateAppSettings(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can modify application settings.',
      code: 'FORBIDDEN'
    };
  }

  const updates = (payload && payload.settings) || {};
  const nowIso = new Date().toISOString();
  const existingRows = getTableRows(SHEET_NAMES.APP_SETTINGS);
  const existingKeys = new Set(existingRows.map(function(r) { return String(r.setting_key); }));

  Object.keys(updates).forEach(function(key) {
    const val = String(updates[key]);
    if (existingKeys.has(key)) {
      updateRowByKey(SHEET_NAMES.APP_SETTINGS, 'setting_key', key, {
        setting_value: val,
        updated_at: nowIso
      });
    } else {
      insertRow(SHEET_NAMES.APP_SETTINGS, {
        setting_key: key,
        setting_value: val,
        description: 'Custom setting',
        updated_at: nowIso
      });
    }
  });

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'SETTINGS_UPDATED',
    entity_type: 'APP_SETTINGS',
    entity_id: 'GLOBAL',
    summary: currentUser.full_name + ' updated application configuration settings.',
    metadata: updates
  });

  return handleGetAppSettings(currentUser);
}
