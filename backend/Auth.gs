/**
 * ============================================================================
 * Auth.gs - Password Hashing, 72-Hour Session Management & Brute-Force Guard
 * ============================================================================
 */

const SESSION_DURATION_MS = 72 * 60 * 60 * 1000; // Strictly 72 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout after 5 failed attempts
const HASH_ITERATIONS = 1200; // Iterative SHA-256 stretching in Apps Script V8

/**
 * Generates a cryptographically strong random token string using Utilities.getUuid().
 */
function generateRandomToken(byteLength) {
  let token = '';
  while (token.length < (byteLength || 48)) {
    token += Utilities.getUuid().replace(/-/g, '');
  }
  return token.substring(0, byteLength || 48);
}

/**
 * Computes iterative salted SHA-256 hash in hex format.
 * Never stores plaintext passwords in Google Sheets.
 */
function hashPasswordWithSalt(password, salt) {
  const pepper = getSystemPepper();
  let digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + String(password) + ':' + pepper,
    Utilities.Charset.UTF_8
  );
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    const hex = bytesToHex(digest);
    digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      hex + ':' + salt + ':' + i,
      Utilities.Charset.UTF_8
    );
  }
  return bytesToHex(digest);
}

/**
 * Computes a single SHA-256 hash of a session token so raw session tokens
 * are never stored in plain text in the Sessions sheet.
 */
function hashSessionToken(rawToken) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'SESSION:' + String(rawToken),
    Utilities.Charset.UTF_8
  );
  return bytesToHex(bytes);
}

/**
 * Converts a signed byte array from Utilities.computeDigest to a lowercase hex string.
 */
function bytesToHex(bytes) {
  return bytes.map(function(b) {
    const unsigned = b < 0 ? b + 256 : b;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

/**
 * Constant-time string comparison to mitigate timing side-channel attacks.
 */
function constantTimeEquals(a, b) {
  const strA = String(a || '');
  const strB = String(b || '');
  if (strA.length !== strB.length) return false;
  let diff = 0;
  for (let i = 0; i < strA.length; i++) {
    diff |= strA.charCodeAt(i) ^ strB.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Retrieves or initializes an application-scoped secret pepper in ScriptProperties.
 */
function getSystemPepper() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('APP_PASSWORD_PEPPER');
  if (!pepper) {
    pepper = generateRandomToken(64);
    props.setProperty('APP_PASSWORD_PEPPER', pepper);
  }
  return pepper;
}

/**
 * Authenticates username & password and creates a 72-hour session.
 */
function handleLogin(payload) {
  const usernameInput = String((payload && payload.username) || '').trim().toLowerCase();
  const passwordInput = String((payload && payload.password) || '');
  const userAgentHint = String((payload && payload.userAgent) || 'Browser Client').substring(0, 180);

  if (!usernameInput || !passwordInput) {
    return {
      success: false,
      error: 'Please enter both username and password.',
      code: 'MISSING_CREDENTIALS'
    };
  }

  const users = getTableRows(SHEET_NAMES.USERS);
  const user = users.find(function(u) {
    return String(u.username || '').trim().toLowerCase() === usernameInput;
  });

  if (!user) {
    return {
      success: false,
      error: 'Invalid username or password.',
      code: 'INVALID_CREDENTIALS'
    };
  }

  // Check if user account is active
  if (!toBoolean(user.is_active)) {
    appendAuditLog({
      actor_user_id: user.user_id,
      actor_name: user.full_name,
      actor_role: user.role,
      action_type: 'LOGIN_BLOCKED_INACTIVE',
      entity_type: 'USER',
      entity_id: user.user_id,
      summary: 'Blocked login attempt for deactivated account: ' + user.username,
      metadata: {}
    });
    return {
      success: false,
      error: 'Your account has been deactivated. Please contact an Owner.',
      code: 'ACCOUNT_INACTIVE'
    };
  }

  const nowMs = Date.now();
  if (user.locked_until) {
    const lockedUntilMs = new Date(user.locked_until).getTime();
    if (!isNaN(lockedUntilMs) && lockedUntilMs > nowMs) {
      const minutesLeft = Math.ceil((lockedUntilMs - nowMs) / 60000);
      return {
        success: false,
        error: 'Account temporarily locked due to multiple failed login attempts. Try again in ' + minutesLeft + ' minute(s).',
        code: 'ACCOUNT_LOCKED'
      };
    }
  }

  const computedHash = hashPasswordWithSalt(passwordInput, String(user.password_salt));
  if (!constantTimeEquals(computedHash, String(user.password_hash))) {
    const attempts = (Number(user.failed_login_attempts) || 0) + 1;
    const lockUntilIso = attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(nowMs + LOCKOUT_DURATION_MS).toISOString()
      : '';

    updateRowByKey(SHEET_NAMES.USERS, 'user_id', user.user_id, {
      failed_login_attempts: attempts,
      locked_until: lockUntilIso,
      updated_at: new Date(nowMs).toISOString()
    });

    return {
      success: false,
      error: 'Invalid username or password.',
      code: 'INVALID_CREDENTIALS'
    };
  }

  // Reset failed login counter on successful authentication
  const nowIso = new Date(nowMs).toISOString();
  if (Number(user.failed_login_attempts) > 0 || user.locked_until) {
    updateRowByKey(SHEET_NAMES.USERS, 'user_id', user.user_id, {
      failed_login_attempts: 0,
      locked_until: '',
      updated_at: nowIso
    });
  }

  // Issue cryptographically random 72-hour session token
  const rawToken = generateRandomToken(64);
  const tokenHash = hashSessionToken(rawToken);
  const expiresAtIso = new Date(nowMs + SESSION_DURATION_MS).toISOString();
  const sessionId = generateUniqueId('SES');

  insertRow(SHEET_NAMES.SESSIONS, {
    session_id: sessionId,
    token_hash: tokenHash,
    user_id: user.user_id,
    role: user.role,
    created_at: nowIso,
    expires_at: expiresAtIso,
    last_active_at: nowIso,
    is_revoked: false,
    user_agent_hint: userAgentHint
  });

  appendAuditLog({
    actor_user_id: user.user_id,
    actor_name: user.full_name,
    actor_role: user.role,
    action_type: 'USER_LOGIN',
    entity_type: 'SESSION',
    entity_id: sessionId,
    summary: user.full_name + ' (' + user.role + ') logged in.',
    metadata: { session_id: sessionId, expires_at: expiresAtIso }
  });

  // Trigger upcoming recurring task generation lazily on login so occurrences stay fresh
  try {
    generateUpcomingOccurrencesInternal();
  } catch (recErr) {
    console.warn('Non-fatal recurrence check error during login:', recErr);
  }

  return {
    success: true,
    data: {
      sessionToken: rawToken,
      expiresAt: expiresAtIso,
      createdAt: nowIso,
      user: sanitizeUserForClient(user)
    }
  };
}

/**
 * Validates a session token against the Sessions and Users tables.
 * Enforces the strict 72-hour maximum lifetime from creation and checks user active status.
 */
function authenticateSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 16) {
    return {
      authenticated: false,
      code: 'MISSING_SESSION',
      error: 'Authentication required. Please log in.'
    };
  }

  const tokenHash = hashSessionToken(rawToken);
  const sessions = getTableRows(SHEET_NAMES.SESSIONS);
  const session = sessions.find(function(s) {
    return constantTimeEquals(String(s.token_hash), tokenHash);
  });

  if (!session) {
    return {
      authenticated: false,
      code: 'INVALID_SESSION',
      error: 'Invalid session token. Please log in again.'
    };
  }

  if (toBoolean(session.is_revoked)) {
    return {
      authenticated: false,
      code: 'SESSION_REVOKED',
      error: 'This session has been logged out. Please sign in again.'
    };
  }

  const nowMs = Date.now();
  const createdMs = new Date(session.created_at).getTime();
  const expiresMs = new Date(session.expires_at).getTime();

  // Enforce strict 72-hour ceiling from session creation
  if (isNaN(expiresMs) || nowMs >= expiresMs || (nowMs - createdMs) >= SESSION_DURATION_MS) {
    updateRowByKey(SHEET_NAMES.SESSIONS, 'session_id', session.session_id, {
      is_revoked: true
    });
    return {
      authenticated: false,
      code: 'SESSION_EXPIRED',
      error: 'Your 72-hour session has expired. Please log in again.'
    };
  }

  // Look up authoritative user record on the server (never trust client role/status)
  const users = getTableRows(SHEET_NAMES.USERS);
  const user = users.find(function(u) {
    return String(u.user_id) === String(session.user_id);
  });

  if (!user || !toBoolean(user.is_active)) {
    updateRowByKey(SHEET_NAMES.SESSIONS, 'session_id', session.session_id, {
      is_revoked: true
    });
    return {
      authenticated: false,
      code: 'USER_INACTIVE',
      error: 'User account is inactive or no longer exists.'
    };
  }

  return {
    authenticated: true,
    user: user,
    session: session
  };
}

/**
 * Immediately revokes the active session token on logout.
 */
function handleLogout(rawToken, currentUser) {
  const tokenHash = hashSessionToken(rawToken);
  const sessions = getTableRows(SHEET_NAMES.SESSIONS);
  const session = sessions.find(function(s) {
    return constantTimeEquals(String(s.token_hash), tokenHash);
  });

  if (session) {
    updateRowByKey(SHEET_NAMES.SESSIONS, 'session_id', session.session_id, {
      is_revoked: true,
      last_active_at: new Date().toISOString()
    });
  }

  if (currentUser) {
    appendAuditLog({
      actor_user_id: currentUser.user_id,
      actor_name: currentUser.full_name,
      actor_role: currentUser.role,
      action_type: 'USER_LOGOUT',
      entity_type: 'SESSION',
      entity_id: session ? session.session_id : 'UNKNOWN',
      summary: currentUser.full_name + ' logged out.',
      metadata: {}
    });
  }

  return {
    success: true,
    data: { message: 'Logged out successfully.' }
  };
}

/**
 * Allows an authenticated user to change their own password, or an Owner to reset a user's password.
 */
function handleChangePassword(currentUser, payload) {
  const targetUserId = String((payload && payload.user_id) || currentUser.user_id).trim();
  const currentPassword = String((payload && payload.current_password) || '');
  const newPassword = String((payload && payload.new_password) || '');

  if (newPassword.length < 8) {
    return {
      success: false,
      error: 'New password must be at least 8 characters long.',
      code: 'WEAK_PASSWORD'
    };
  }

  const isSelf = targetUserId === String(currentUser.user_id);
  if (!isSelf && currentUser.role !== 'OWNER') {
    return {
      success: false,
      error: 'Only Owners can reset another user\'s password.',
      code: 'FORBIDDEN'
    };
  }

  const users = getTableRows(SHEET_NAMES.USERS);
  const targetUser = users.find(function(u) { return String(u.user_id) === targetUserId; });
  if (!targetUser) {
    return { success: false, error: 'Target user not found.', code: 'NOT_FOUND' };
  }

  if (isSelf) {
    const verifyHash = hashPasswordWithSalt(currentPassword, String(targetUser.password_salt));
    if (!constantTimeEquals(verifyHash, String(targetUser.password_hash))) {
      return {
        success: false,
        error: 'Current password is incorrect.',
        code: 'INVALID_CURRENT_PASSWORD'
      };
    }
  }

  const newSalt = generateRandomToken(16);
  const newHash = hashPasswordWithSalt(newPassword, newSalt);
  const nowIso = new Date().toISOString();

  updateRowByKey(SHEET_NAMES.USERS, 'user_id', targetUserId, {
    password_hash: newHash,
    password_salt: newSalt,
    must_change_password: false,
    failed_login_attempts: 0,
    locked_until: '',
    updated_at: nowIso
  });

  appendAuditLog({
    actor_user_id: currentUser.user_id,
    actor_name: currentUser.full_name,
    actor_role: currentUser.role,
    action_type: 'PASSWORD_CHANGED',
    entity_type: 'USER',
    entity_id: targetUserId,
    summary: isSelf
      ? currentUser.full_name + ' changed their password.'
      : currentUser.full_name + ' reset password for ' + targetUser.full_name + '.',
    metadata: { target_user_id: targetUserId }
  });

  return {
    success: true,
    data: { message: 'Password updated successfully.' }
  };
}

/**
 * Strips sensitive fields (password_hash, password_salt, failed_login_attempts, locked_until)
 * before returning user objects to the frontend.
 */
function sanitizeUserForClient(user) {
  if (!user) return null;
  return {
    user_id: String(user.user_id),
    full_name: String(user.full_name || ''),
    username: String(user.username || ''),
    role: String(user.role || 'EMPLOYEE'),
    department: String(user.department || ''),
    is_active: toBoolean(user.is_active),
    must_change_password: toBoolean(user.must_change_password),
    created_at: String(user.created_at || ''),
    updated_at: String(user.updated_at || '')
  };
}
