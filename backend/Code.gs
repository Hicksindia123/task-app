/**
 * ============================================================================
 * Code.gs - Central API Dispatcher, Schema Setup & Concurrency Wrapper
 * Task Delegation & Progress Tracking Web Application
 * ============================================================================
 *
 * ARCHITECTURAL & SECURITY NOTES:
 * 1. CORS & Preflight Mitigation:
 *    Google Apps Script Web Apps do not support HTTP OPTIONS preflight requests
 *    and respond with a 302 redirect to script.googleusercontent.com.
 *    Therefore, all frontend POST requests MUST use:
 *      Content-Type: text/plain;charset=utf-8
 *    with a JSON-serialized string body.
 *
 * 2. Execution Identity:
 *    Deploy as "Execute as: Me" and "Who has access: Anyone".
 *    End-users NEVER receive direct Google Sheet access; all operations pass
 *    through this API gateway, which validates the 72-hour session token and
 *    enforces strict role-based access control (OWNER vs EMPLOYEE).
 */

const SHEET_NAMES = {
  USERS: 'Users',
  SESSIONS: 'Sessions',
  TASK_DEFINITIONS: 'TaskDefinitions',
  TASK_OCCURRENCES: 'TaskOccurrences',
  TASK_UPDATES: 'TaskUpdates',
  ACTIVITY_LOG: 'ActivityLog',
  APP_SETTINGS: 'AppSettings'
};

const SCHEMA_HEADERS = {
  Users: [
    'user_id',
    'full_name',
    'username',
    'password_hash',
    'password_salt',
    'role',
    'department',
    'is_active',
    'must_change_password',
    'failed_login_attempts',
    'locked_until',
    'created_at',
    'updated_at'
  ],
  Sessions: [
    'session_id',
    'token_hash',
    'user_id',
    'role',
    'created_at',
    'expires_at',
    'last_active_at',
    'is_revoked',
    'user_agent_hint'
  ],
  TaskDefinitions: [
    'task_definition_id',
    'task_name',
    'description',
    'additional_instructions',
    'created_by',
    'assigned_user_id',
    'occurrence_type',
    'recurrence_rule_json',
    'start_date',
    'end_date',
    'due_time',
    'default_priority',
    'is_active',
    'created_at',
    'updated_at'
  ],
  TaskOccurrences: [
    'occurrence_id',
    'task_definition_id',
    'occurrence_date',
    'due_at',
    'assigned_user_id',
    'status',
    'priority',
    'progress_percentage',
    'custom_instructions',
    'created_at',
    'updated_at',
    'completed_at'
  ],
  TaskUpdates: [
    'update_id',
    'occurrence_id',
    'task_definition_id',
    'author_user_id',
    'author_name',
    'author_role',
    'update_type',
    'message',
    'work_completed',
    'blockers',
    'help_required',
    'next_steps',
    'progress_percentage',
    'previous_status',
    'new_status',
    'created_at'
  ],
  ActivityLog: [
    'log_id',
    'actor_user_id',
    'actor_name',
    'actor_role',
    'action_type',
    'entity_type',
    'entity_id',
    'summary',
    'metadata_json',
    'created_at'
  ],
  AppSettings: [
    'setting_key',
    'setting_value',
    'description',
    'updated_at'
  ]
};

const WRITE_ACTIONS = new Set([
  'login',
  'logout',
  'changePassword',
  'createUser',
  'updateUser',
  'deactivateUser',
  'createTask',
  'updateTask',
  'assignTask',
  'updateTaskStatus',
  'cancelTask',
  'reopenTask',
  'addTaskUpdate',
  'updateProgress',
  'createRecurringTask',
  'updateRecurringTask',
  'generateOccurrences',
  'updateAppSettings'
]);

/**
 * Health check endpoint for GET requests.
 */
function doGet(e) {
  ensureDatabaseInitialized();
  const action = (e && e.parameter && e.parameter.action) || 'health';
  if (action === 'health') {
    return jsonResponse({
      success: true,
      data: {
        service: 'Task Delegation & Progress Tracking API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    });
  }
  return jsonResponse({
    success: false,
    error: 'Use HTTP POST with Content-Type: text/plain;charset=utf-8 for API operations.'
  });
}

/**
 * Main POST entry point for all frontend actions.
 */
function doPost(e) {
  let lock = null;
  try {
    ensureDatabaseInitialized();

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Missing request payload.', code: 'BAD_REQUEST' });
    }

    let request;
    try {
      request = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ success: false, error: 'Invalid JSON payload.', code: 'INVALID_JSON' });
    }

    const action = String(request.action || '').trim();
    const payload = request.payload || {};
    const sessionToken = String(request.sessionToken || '').trim();

    if (!action) {
      return jsonResponse({ success: false, error: 'Missing action parameter.', code: 'MISSING_ACTION' });
    }

    if (WRITE_ACTIONS.has(action)) {
      lock = LockService.getScriptLock();
      const acquired = lock.tryLock(15000);
      if (!acquired) {
        return jsonResponse({
          success: false,
          error: 'Server is busy processing another update. Please retry in a moment.',
          code: 'LOCK_TIMEOUT'
        });
      }
    }

    // Public/semi-public authentication routes
    if (action === 'login') {
      return jsonResponse(handleLogin(payload));
    }

    // All other routes require a valid, non-expired 72-hour session
    const authContext = authenticateSessionToken(sessionToken);
    if (!authContext.authenticated) {
      return jsonResponse({
        success: false,
        error: authContext.error || 'Session expired or invalid. Please log in again.',
        code: authContext.code || 'UNAUTHORIZED'
      });
    }

    const currentUser = authContext.user;
    const currentSession = authContext.session;

    if (action === 'validateSession') {
      return jsonResponse({
        success: true,
        data: {
          user: sanitizeUserForClient(currentUser),
          session: {
            session_id: currentSession.session_id,
            created_at: currentSession.created_at,
            expires_at: currentSession.expires_at
          }
        }
      });
    }

    if (action === 'logout') {
      return jsonResponse(handleLogout(sessionToken, currentUser));
    }

    if (action === 'changePassword') {
      return jsonResponse(handleChangePassword(currentUser, payload));
    }

    // Dispatch authorized actions
    switch (action) {
      // User management (Owner only, except listing basic assignees if needed)
      case 'listUsers':
        return jsonResponse(handleListUsers(currentUser, payload));
      case 'createUser':
        return jsonResponse(handleCreateUser(currentUser, payload));
      case 'updateUser':
        return jsonResponse(handleUpdateUser(currentUser, payload));
      case 'deactivateUser':
        return jsonResponse(handleDeactivateUser(currentUser, payload));

      // Task & Occurrence management
      case 'listTasks':
        return jsonResponse(handleListTasks(currentUser, payload));
      case 'getTaskDetails':
        return jsonResponse(handleGetTaskDetails(currentUser, payload));
      case 'createTask':
        return jsonResponse(handleCreateTask(currentUser, payload));
      case 'updateTask':
        return jsonResponse(handleUpdateTask(currentUser, payload));
      case 'assignTask':
        return jsonResponse(handleAssignTask(currentUser, payload));
      case 'updateTaskStatus':
        return jsonResponse(handleUpdateTaskStatus(currentUser, payload));
      case 'cancelTask':
        return jsonResponse(handleCancelTask(currentUser, payload));
      case 'reopenTask':
        return jsonResponse(handleReopenTask(currentUser, payload));

      // Recurring Task Definitions
      case 'listTaskDefinitions':
        return jsonResponse(handleListTaskDefinitions(currentUser, payload));
      case 'createRecurringTask':
        return jsonResponse(handleCreateTask(currentUser, payload));
      case 'updateRecurringTask':
        return jsonResponse(handleUpdateRecurringTask(currentUser, payload));
      case 'generateOccurrences':
        return jsonResponse(handleGenerateOccurrencesAction(currentUser, payload));

      // Progress & Discussion Timeline
      case 'listTaskUpdates':
        return jsonResponse(handleListTaskUpdates(currentUser, payload));
      case 'addTaskUpdate':
        return jsonResponse(handleAddTaskUpdate(currentUser, payload));
      case 'updateProgress':
        return jsonResponse(handleUpdateProgress(currentUser, payload));

      // Dashboards
      case 'getOwnerDashboard':
        return jsonResponse(handleGetOwnerDashboard(currentUser, payload));
      case 'getEmployeeDashboard':
        return jsonResponse(handleGetEmployeeDashboard(currentUser, payload));
      case 'getRecentActivity':
        return jsonResponse(handleGetRecentActivity(currentUser, payload));

      // Audit & Settings
      case 'getActivityLog':
        return jsonResponse(handleGetActivityLog(currentUser, payload));
      case 'getAppSettings':
        return jsonResponse(handleGetAppSettings(currentUser));
      case 'updateAppSettings':
        return jsonResponse(handleUpdateAppSettings(currentUser, payload));

      default:
        return jsonResponse({
          success: false,
          error: 'Unknown API action: ' + action,
          code: 'UNKNOWN_ACTION'
        });
    }
  } catch (err) {
    console.error('Unhandled API Error:', err);
    return jsonResponse({
      success: false,
      error: err && err.message ? err.message : 'Internal server error.',
      code: 'SERVER_ERROR'
    });
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {
        // Ignore lock release errors
      }
    }
  }
}

/**
 * Formats a consistent JSON response for Google Apps Script ContentService.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Safely initializes all required sheets, headers, default settings, and initial Owner account
 * without overwriting or destroying existing data.
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date().toISOString();

  Object.keys(SCHEMA_HEADERS).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    const expectedHeaders = SCHEMA_HEADERS[sheetName];
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.setFrozenRows(1);
    } else {
      // Ensure any newly added columns exist without destroying existing columns
      const lastCol = Math.max(1, sheet.getLastColumn());
      const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
      expectedHeaders.forEach(function(header) {
        if (currentHeaders.indexOf(header) === -1) {
          currentHeaders.push(header);
          sheet.getRange(1, currentHeaders.length).setValue(header);
        }
      });
    }
  });

  // Seed default AppSettings if empty
  const settingsRows = getTableRows(SHEET_NAMES.APP_SETTINGS);
  if (settingsRows.length === 0) {
    const defaultSettings = [
      {
        setting_key: 'organization_name',
        setting_value: 'Acme Operations Pvt. Ltd.',
        description: 'Organization display name on dashboards and reports',
        updated_at: now
      },
      {
        setting_key: 'timezone',
        setting_value: 'Asia/Kolkata',
        description: 'IANA timezone used for recurring task schedules and deadlines',
        updated_at: now
      },
      {
        setting_key: 'session_ttl_hours',
        setting_value: '72',
        description: 'Maximum lifetime of an authenticated session in hours',
        updated_at: now
      },
      {
        setting_key: 'recurrence_horizon_days',
        setting_value: '7',
        description: 'Days ahead to pre-generate recurring task occurrences',
        updated_at: now
      },
      {
        setting_key: 'monthly_short_month_rule',
        setting_value: 'LAST_DAY_OF_MONTH',
        description: 'Rule when monthly recurrence day (e.g. 31) exceeds days in month',
        updated_at: now
      }
    ];
    defaultSettings.forEach(function(row) {
      insertRow(SHEET_NAMES.APP_SETTINGS, row);
    });
  }

  // Seed initial Owner account if Users sheet is completely empty
  const existingUsers = getTableRows(SHEET_NAMES.USERS);
  if (existingUsers.length === 0) {
    const salt = generateRandomToken(16);
    const initialPassword = 'ChangeMe@123';
    const passwordHash = hashPasswordWithSalt(initialPassword, salt);
    const ownerUser = {
      user_id: 'USR-1001',
      full_name: 'Rajesh Sharma (Principal Owner)',
      username: 'owner',
      password_hash: passwordHash,
      password_salt: salt,
      role: 'OWNER',
      department: 'Executive Management',
      is_active: true,
      must_change_password: false,
      failed_login_attempts: 0,
      locked_until: '',
      created_at: now,
      updated_at: now
    };
    insertRow(SHEET_NAMES.USERS, ownerUser);

    appendAuditLog({
      actor_user_id: 'SYSTEM',
      actor_name: 'System Initializer',
      actor_role: 'SYSTEM',
      action_type: 'SYSTEM_INIT',
      entity_type: 'USER',
      entity_id: ownerUser.user_id,
      summary: 'Initialized database schema and created bootstrap Owner account (username: owner).',
      metadata: { username: 'owner' }
    });
  }

  return {
    success: true,
    message: 'Database sheets and headers verified successfully.'
  };
}

/**
 * Lightweight check called on API execution to ensure sheets exist.
 */
function ensureDatabaseInitialized() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_NAMES.USERS) || !ss.getSheetByName(SHEET_NAMES.TASK_OCCURRENCES)) {
    setupDatabase();
  }
}

/**
 * Reads all rows from a sheet as an array of objects keyed by header names.
 */
function getTableRows(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const results = [];

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    // Skip completely blank rows
    let nonEmpty = false;
    const obj = { _rowIndex: r + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      let val = row[c];
      if (val instanceof Date) {
        val = val.toISOString();
      }
      if (val !== '' && val !== null && val !== undefined) {
        nonEmpty = true;
      }
      obj[key] = val;
    }
    if (nonEmpty) {
      results.push(obj);
    }
  }
  return results;
}

/**
 * Inserts a single object row at the bottom of the specified sheet.
 */
function insertRow(sheetName, record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = SCHEMA_HEADERS[sheetName];
  const rowValues = headers.map(function(col) {
    const val = record[col];
    return val === undefined || val === null ? '' : val;
  });
  sheet.appendRow(rowValues);
  return record;
}

/**
 * Updates a single record matched by primary key column and value.
 */
function updateRowByKey(sheetName, keyColumn, keyValue, updates) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= 1) return null;

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(function(h) { return String(h).trim(); });
  const keyIdx = headers.indexOf(keyColumn);
  if (keyIdx === -1) return null;

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][keyIdx]) === String(keyValue)) {
      const updatedRecord = {};
      for (let c = 0; c < headers.length; c++) {
        const colName = headers[c];
        if (Object.prototype.hasOwnProperty.call(updates, colName)) {
          data[r][c] = updates[colName] === undefined || updates[colName] === null ? '' : updates[colName];
        }
        updatedRecord[colName] = data[r][c] instanceof Date ? data[r][c].toISOString() : data[r][c];
      }
      sheet.getRange(r + 1, 1, 1, lastCol).setValues([data[r]]);
      return updatedRecord;
    }
  }
  return null;
}

/**
 * Generates a unique, permanent identifier with a prefix (e.g., TSK-..., OCC-...).
 */
function generateUniqueId(prefix) {
  const rawUuid = Utilities.getUuid().replace(/-/g, '').substring(0, 10).toUpperCase();
  return prefix + '-' + rawUuid;
}

/**
 * Normalizes boolean values stored in Google Sheets.
 */
function toBoolean(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  if (typeof val === 'number') return val === 1;
  return false;
}
