/**
 * ============================================================================
 * Users.gs - Owner-Only User Management & Role Enforcement
 * ============================================================================
 */

/**
 * Lists users. Owners receive the complete user directory with workload metrics.
 * Employees only receive their own profile (and basic display names of Owners).
 */
function handleListUsers(currentUser, payload) {
  const users = getTableRows(SHEET_NAMES.USERS);

  if (currentUser.role !== 'OWNER') {
    return {
      success: true,
      data: {
        users: users
          .filter(function(u) { return String(u.user_id) === String(currentUser.user_id); })
          .map(sanitizeUserForClient)
      }
    };
  }

  const search = String((payload && payload.search) || '').trim().toLowerCase();
  const roleFilter = String((payload && payload.role) || '').trim().toUpperCase();
  const statusFilter = String((payload && payload.status) || '').trim().toLowerCase();

  const occurrences = getTableRows(SHEET_NAMES.TASK_OCCURRENCES);
  const nowIso = new Date().toISOString();

  const enriched = users
    .map(function(u) {
      const clean = sanitizeUserForClient(u);
      const userTasks = occurrences.filter(function(occ) {
        return String(occ.assigned_user_id) === clean.user_id && occ.status !== 'Cancelled';
      });
      clean.stats = {
        total_assigned: userTasks.length,
        active_count: userTasks.filter(function(o) {
          return ['Assigned', 'In Progress', 'Blocked', 'Awaiting Owner Review'].indexOf(o.status) !== -1;
        }).length,
        completed_count: userTasks.filter(function(o) { return o.status === 'Completed'; }).length,
        blocked_count: userTasks.filter(function(o) { return o.status === 'Blocked'; }).length,
        overdue_count: userTasks.filter(function(o) {
          return o.status !== 'Completed' && o.due_at && String(o.due_at) < nowIso;
        }).length
      };
      return clean;
    })
    .filter(function(u) {
      if (roleFilter && roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.is_active) return false;
      if (statusFilter === 'inactive' && u.is_active) return false;
      if (search) {
        const hay = (u.full_name + ' ' + u.username + ' ' + u.department + ' ' + u.user_id).toLowerCase();
        if (hay.indexOf(search) === -1) return false;
      }
      return true;
    });

  return {
    success: true,
    data: { users: enriched }
  };
}

/**
 * Creates a new user account (Owner only).
 * Validates unique username, password strength, and role permissions.
 */
function handleCreateUser(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can create user accounts.',
      code: 'FORBIDDEN'
    };
  }

  const fullName = String((payload && payload.full_name) || '').trim();
  const username = String((payload && payload.username) || '').trim().toLowerCase();
  const password = String((payload && payload.password) || '');
  const role = String((payload && payload.role) || 'EMPLOYEE').trim().toUpperCase();
  const department = String((payload && payload.department) || '').trim();
  const isActive = payload && payload.is_active !== undefined ? toBoolean(payload.is_active) : true;

  if (!fullName || fullName.length < 2) {
    return { success: false, error: 'Full name is required (minimum 2 characters).', code: 'VALIDATION_ERROR' };
  }
  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    return {
      success: false,
      error: 'Username must be 3-32 characters and contain only lowercase letters, numbers, dots, underscores, or hyphens.',
      code: 'VALIDATION_ERROR'
    };
  }
  if (!password || password.length < 8) {
    return {
      success: false,
      error: 'Initial password must be at least 8 characters long.',
      code: 'VALIDATION_ERROR'
    };
  }
  if (['OWNER', 'EMPLOYEE'].indexOf(role) === -1) {
    return {
      success: false,
      error: 'Invalid role. Allowed values are OWNER or EMPLOYEE.',
      code: 'VALIDATION_ERROR'
    };
  }

  const existingUsers = getTableRows(SHEET_NAMES.USERS);
  const duplicate = existingUsers.find(function(u) {
    return String(u.username || '').trim().toLowerCase() === username;
  });
  if (duplicate) {
    return {
      success: false,
      error: 'Username "' + username + '" is already taken. Please choose a unique username.',
      code: 'DUPLICATE_USERNAME'
    };
  }

  const nowIso = new Date().toISOString();
  const salt = generateRandomToken(16);
  const passwordHash = hashPasswordWithSalt(password, salt);
  const newUserId = generateUniqueId('USR');

  const newUserRecord = {
    user_id: newUserId,
    full_name: fullName,
    username: username,
    password_hash: passwordHash,
    password_salt: salt,
    role: role,
    department: department || (role === 'OWNER' ? 'Management' : 'Operations'),
    is_active: isActive,
    must_change_password: toBoolean(payload && payload.must_change_password),
    failed_login_attempts: 0,
    locked_until: '',
    created_at: nowIso,
    updated_at: nowIso
  };

  insertRow(SHEET_NAMES.USERS, newUserRecord);

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'USER_CREATED',
    entity_type: 'USER',
    entity_id: newUserId,
    summary: 'Created new ' + role + ' user: ' + fullName + ' (@' + username + ').',
    metadata: {
      user_id: newUserId,
      username: username,
      role: role,
      department: newUserRecord.department,
      is_active: isActive
    }
  });

  return {
    success: true,
    data: {
      user: sanitizeUserForClient(newUserRecord),
      message: 'User account created successfully.'
    }
  };
}

/**
 * Updates permitted profile fields of an existing user (Owner only).
 */
function handleUpdateUser(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can modify user accounts.',
      code: 'FORBIDDEN'
    };
  }

  const targetUserId = String((payload && payload.user_id) || '').trim();
  if (!targetUserId) {
    return { success: false, error: 'user_id is required.', code: 'VALIDATION_ERROR' };
  }

  const users = getTableRows(SHEET_NAMES.USERS);
  const existing = users.find(function(u) { return String(u.user_id) === targetUserId; });
  if (!existing) {
    return { success: false, error: 'User not found.', code: 'NOT_FOUND' };
  }

  const updates = { updated_at: new Date().toISOString() };

  if (payload.full_name !== undefined) {
    const fn = String(payload.full_name).trim();
    if (fn.length < 2) {
      return { success: false, error: 'Full name must be at least 2 characters.', code: 'VALIDATION_ERROR' };
    }
    updates.full_name = fn;
  }

  if (payload.department !== undefined) {
    updates.department = String(payload.department).trim();
  }

  if (payload.role !== undefined) {
    const newRole = String(payload.role).trim().toUpperCase();
    if (['OWNER', 'EMPLOYEE'].indexOf(newRole) === -1) {
      return { success: false, error: 'Invalid role.', code: 'VALIDATION_ERROR' };
    }
    // Prevent demoting the last active Owner
    if (existing.role === 'OWNER' && newRole !== 'OWNER') {
      const activeOwners = users.filter(function(u) {
        return u.role === 'OWNER' && toBoolean(u.is_active) && String(u.user_id) !== targetUserId;
      });
      if (activeOwners.length === 0) {
        return {
          success: false,
          error: 'Cannot remove Owner role from the last active Owner account.',
          code: 'LAST_OWNER_PROTECTION'
        };
      }
    }
    updates.role = newRole;
  }

  if (payload.is_active !== undefined) {
    const nextActive = toBoolean(payload.is_active);
    if (!nextActive && String(existing.user_id) === String(currentUser.user_id)) {
      return {
        success: false,
        error: 'You cannot deactivate your own active Owner account.',
        code: 'SELF_DEACTIVATION_BLOCKED'
      };
    }
    updates.is_active = nextActive;
    if (!nextActive) {
      revokeAllSessionsForUser(targetUserId);
    }
  }

  if (payload.new_password) {
    const np = String(payload.new_password);
    if (np.length < 8) {
      return { success: false, error: 'New password must be at least 8 characters.', code: 'VALIDATION_ERROR' };
    }
    const salt = generateRandomToken(16);
    updates.password_salt = salt;
    updates.password_hash = hashPasswordWithSalt(np, salt);
    updates.failed_login_attempts = 0;
    updates.locked_until = '';
  }

  const updatedRecord = updateRowByKey(SHEET_NAMES.USERS, 'user_id', targetUserId, updates);

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'USER_UPDATED',
    entity_type: 'USER',
    entity_id: targetUserId,
    summary: 'Updated user profile for ' + updatedRecord.full_name + ' (@' + updatedRecord.username + ').',
    metadata: {
      user_id: targetUserId,
      role: updatedRecord.role,
      department: updatedRecord.department,
      is_active: toBoolean(updatedRecord.is_active)
    }
  });

  return {
    success: true,
    data: {
      user: sanitizeUserForClient(updatedRecord),
      message: 'User updated successfully.'
    }
  };
}

/**
 * Deactivates or reactivates a user account without deleting historical task records.
 * Revokes all active sessions immediately when a user is deactivated.
 */
function handleDeactivateUser(currentUser, payload) {
  if (currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Access denied: Only Owners can activate or deactivate users.',
      code: 'FORBIDDEN'
    };
  }

  const targetUserId = String((payload && payload.user_id) || '').trim();
  const isActive = payload && payload.is_active !== undefined ? toBoolean(payload.is_active) : false;

  if (!targetUserId) {
    return { success: false, error: 'user_id is required.', code: 'VALIDATION_ERROR' };
  }

  if (!isActive && targetUserId === String(currentUser.user_id)) {
    return {
      success: false,
      error: 'You cannot deactivate your own account.',
      code: 'SELF_DEACTIVATION_BLOCKED'
    };
  }

  const users = getTableRows(SHEET_NAMES.USERS);
  const targetUser = users.find(function(u) { return String(u.user_id) === targetUserId; });
  if (!targetUser) {
    return { success: false, error: 'User not found.', code: 'NOT_FOUND' };
  }

  if (!isActive && targetUser.role === 'OWNER') {
    const remainingOwners = users.filter(function(u) {
      return u.role === 'OWNER' && toBoolean(u.is_active) && String(u.user_id) !== targetUserId;
    });
    if (remainingOwners.length === 0) {
      return {
        success: false,
        error: 'Cannot deactivate the last active Owner in the organization.',
        code: 'LAST_OWNER_PROTECTION'
      };
    }
  }

  const updated = updateRowByKey(SHEET_NAMES.USERS, 'user_id', targetUserId, {
    is_active: isActive,
    updated_at: new Date().toISOString()
  });

  if (!isActive) {
    revokeAllSessionsForUser(targetUserId);
  }

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity_type: 'USER',
    entity_id: targetUserId,
    summary: (isActive ? 'Reactivated' : 'Deactivated') + ' user account: ' + targetUser.full_name + ' (@' + targetUser.username + '). Historical task records preserved.',
    metadata: { user_id: targetUserId, is_active: isActive }
  });

  return {
    success: true,
    data: {
      user: sanitizeUserForClient(updated),
      message: isActive
        ? 'User account reactivated.'
        : 'User account deactivated and active sessions revoked. Historical task records retained.'
    }
  };
}

/**
 * Revokes all sessions belonging to a deactivated user.
 */
function revokeAllSessionsForUser(userId) {
  const sessions = getTableRows(SHEET_NAMES.SESSIONS);
  sessions.forEach(function(s) {
    if (String(s.user_id) === String(userId) && !toBoolean(s.is_revoked)) {
      updateRowByKey(SHEET_NAMES.SESSIONS, 'session_id', s.session_id, {
        is_revoked: true
      });
    }
  });
}
