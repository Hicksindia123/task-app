/**
 * ============================================================================
 * Automated Integration Test Suite for Google Apps Script Backend (.gs files)
 * ============================================================================
 * Executes the real Google Apps Script code (Code.gs, Auth.gs, Users.gs,
 * Tasks.gs, Updates.gs, Recurrence.gs, Dashboard.gs, Audit.gs) inside a Node.js
 * VM sandbox with an in-memory emulation of SpreadsheetApp, LockService,
 * Utilities, PropertiesService, and ContentService.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

// 1. In-memory SpreadsheetApp emulator
class MockSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.frozenRows = 0;
  }
  getLastRow() {
    return this.grid.length;
  }
  getLastColumn() {
    if (this.grid.length === 0) return 0;
    return Math.max(0, ...this.grid.map(r => r.length));
  }
  setFrozenRows(n) {
    this.frozenRows = n;
  }
  appendRow(rowArr) {
    this.grid.push(rowArr.map(v => (v === undefined || v === null ? '' : v)));
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const rIdx = row - 1 + r;
          const rowData = self.grid[rIdx] || [];
          const slice = [];
          for (let c = 0; c < numCols; c++) {
            const cIdx = col - 1 + c;
            slice.push(rowData[cIdx] !== undefined ? rowData[cIdx] : '');
          }
          out.push(slice);
        }
        return out;
      },
      setValues(values2D) {
        for (let r = 0; r < numRows; r++) {
          const rIdx = row - 1 + r;
          if (!self.grid[rIdx]) self.grid[rIdx] = [];
          for (let c = 0; c < numCols; c++) {
            const cIdx = col - 1 + c;
            self.grid[rIdx][cIdx] = values2D[r][c];
          }
        }
      },
      setValue(val) {
        const rIdx = row - 1;
        const cIdx = col - 1;
        if (!self.grid[rIdx]) self.grid[rIdx] = [];
        self.grid[rIdx][cIdx] = val;
      }
    };
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
}

const activeSpreadsheet = new MockSpreadsheet();
const scriptProps = {};

const sandbox = {
  console,
  Date,
  Math,
  JSON,
  Set,
  Map,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  parseInt,
  parseFloat,
  isNaN,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => activeSpreadsheet
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => scriptProps[k] || null,
      setProperty: (k, v) => { scriptProps[k] = String(v); }
    })
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    getUuid: () => crypto.randomUUID(),
    computeDigest: (algo, str) => {
      const buf = crypto.createHash('sha256').update(String(str), 'utf8').digest();
      // GAS returns signed bytes (-128..127)
      return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
    }
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (str) => ({
      _content: str,
      setMimeType() { return this; },
      getContent() { return this._content; }
    })
  }
};

vm.createContext(sandbox);

const backendDir = path.join(__dirname, '..', 'backend');
const gsFiles = [
  'Code.gs',
  'Auth.gs',
  'Users.gs',
  'Recurrence.gs',
  'Tasks.gs',
  'Updates.gs',
  'Dashboard.gs',
  'Audit.gs'
];

for (const file of gsFiles) {
  const code = fs.readFileSync(path.join(backendDir, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

function callApi(action, payload = {}, sessionToken = '') {
  const event = {
    postData: {
      contents: JSON.stringify({ action, payload, sessionToken })
    }
  };
  const output = sandbox.doPost(event);
  return JSON.parse(output.getContent());
}

let passed = 0;
function runTest(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Running Google Apps Script Backend Integration Tests ===');

let ownerToken = '';
let emp1Token = '';
let emp2Token = '';
let emp1Id = '';
let emp2Id = '';
let oneTimeOccId = '';
let dailyDefId = '';
let monthlyDefId = '';

runTest('1. Database schema initialization & bootstrap Owner creation (no plaintext passwords)', () => {
  const res = sandbox.setupDatabase();
  assert.strictEqual(res.success, true);
  const users = sandbox.getTableRows('Users');
  assert.strictEqual(users.length, 1);
  assert.strictEqual(users[0].username, 'owner');
  assert.strictEqual(users[0].role, 'OWNER');
  assert.notStrictEqual(users[0].password_hash, 'ChangeMe@123');
  assert.strictEqual(users[0].password_hash.length, 64);
});

runTest('2. Reject login with invalid username or invalid password', () => {
  const badUser = callApi('login', { username: 'nonexistent', password: 'ChangeMe@123' });
  assert.strictEqual(badUser.success, false);
  assert.strictEqual(badUser.code, 'INVALID_CREDENTIALS');

  const badPass = callApi('login', { username: 'owner', password: 'WrongPassword' });
  assert.strictEqual(badPass.success, false);
  assert.strictEqual(badPass.code, 'INVALID_CREDENTIALS');
});

runTest('3. Valid Owner login issues 72-hour session token and strips sensitive password fields', () => {
  const res = callApi('login', { username: 'owner', password: 'ChangeMe@123' });
  assert.strictEqual(res.success, true);
  assert.ok(res.data.sessionToken.length >= 48);
  assert.strictEqual(res.data.user.role, 'OWNER');
  assert.strictEqual(res.data.user.password_hash, undefined);
  assert.strictEqual(res.data.user.password_salt, undefined);

  const createdMs = new Date(res.data.createdAt).getTime();
  const expiresMs = new Date(res.data.expiresAt).getTime();
  assert.strictEqual(expiresMs - createdMs, 72 * 60 * 60 * 1000);
  ownerToken = res.data.sessionToken;
});

runTest('4. Session validation restores authenticated user across refreshes', () => {
  const res = callApi('validateSession', {}, ownerToken);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.user.username, 'owner');
});

runTest('5. Owner creates two Employee accounts and duplicate username is rejected', () => {
  const r1 = callApi('createUser', {
    full_name: 'Ananya Verma',
    username: 'ananya',
    password: 'EmployeePass1!',
    role: 'EMPLOYEE',
    department: 'Sales & Client Operations'
  }, ownerToken);
  assert.strictEqual(r1.success, true);
  emp1Id = r1.data.user.user_id;

  const r2 = callApi('createUser', {
    full_name: 'Vikram Patel',
    username: 'vikram',
    password: 'EmployeePass2!',
    role: 'EMPLOYEE',
    department: 'Inventory & Logistics'
  }, ownerToken);
  assert.strictEqual(r2.success, true);
  emp2Id = r2.data.user.user_id;

  const dup = callApi('createUser', {
    full_name: 'Duplicate Ananya',
    username: 'ananya',
    password: 'EmployeePass3!',
    role: 'EMPLOYEE'
  }, ownerToken);
  assert.strictEqual(dup.success, false);
  assert.strictEqual(dup.code, 'DUPLICATE_USERNAME');
});

runTest('6. Employee login succeeds and Employee is blocked from Owner-only user creation', () => {
  const login1 = callApi('login', { username: 'ananya', password: 'EmployeePass1!' });
  assert.strictEqual(login1.success, true);
  emp1Token = login1.data.sessionToken;

  const login2 = callApi('login', { username: 'vikram', password: 'EmployeePass2!' });
  assert.strictEqual(login2.success, true);
  emp2Token = login2.data.sessionToken;

  // Attempt privilege escalation by passing role='OWNER' from an Employee session
  const forged = callApi('createUser', {
    full_name: 'Hacker User',
    username: 'hacker',
    password: 'Password123!',
    role: 'OWNER'
  }, emp1Token);
  assert.strictEqual(forged.success, false);
  assert.strictEqual(forged.code, 'FORBIDDEN');
});

runTest('7. Owner creates One-Time, Daily, Weekly, and Monthly tasks (including 31st short-month rule)', () => {
  const oneTime = callApi('createTask', {
    task_name: 'Prepare Q4 Vendor Reconciliation Sheet',
    description: 'Cross-check all supplier invoices against bank disbursements.',
    additional_instructions: 'Flag any discrepancy over INR 5,000 immediately.',
    assigned_user_id: emp1Id,
    occurrence_type: 'ONE_TIME',
    priority: 'High',
    start_date: '2026-10-15',
    due_date: '2026-10-18',
    due_time: '17:30'
  }, ownerToken);
  assert.strictEqual(oneTime.success, true);
  assert.strictEqual(oneTime.data.occurrences.length, 1);
  oneTimeOccId = oneTime.data.occurrences[0].occurrence_id;

  const daily = callApi('createTask', {
    task_name: 'Submit Daily Cash & POS Closing Report',
    description: 'Reconcile daily POS terminal totals and upload closing summary.',
    assigned_user_id: emp1Id,
    occurrence_type: 'DAILY',
    priority: 'Medium',
    start_date: '2026-10-14',
    due_time: '19:00',
    recurrence_rule: { interval: 1, skip_sundays: true }
  }, ownerToken);
  assert.strictEqual(daily.success, true);
  assert.ok(daily.data.occurrences.length >= 5);
  dailyDefId = daily.data.definition.task_definition_id;

  const weekly = callApi('createTask', {
    task_name: 'Weekly Warehouse Stock Audit',
    description: 'Physical cycle count of top 50 SKUs in Warehouse B.',
    assigned_user_id: emp2Id,
    occurrence_type: 'WEEKLY',
    priority: 'High',
    start_date: '2026-10-12',
    due_time: '16:00',
    recurrence_rule: { interval: 1, weekdays: ['MON', 'THU'] }
  }, ownerToken);
  assert.strictEqual(weekly.success, true);
  assert.ok(weekly.data.occurrences.length >= 2);

  const monthly = callApi('createTask', {
    task_name: 'Monthly GST & Statutory Filing Prep',
    description: 'Compile GSTR-1 and GSTR-3B input tax credit schedules on month-end.',
    assigned_user_id: emp2Id,
    occurrence_type: 'MONTHLY',
    priority: 'Urgent',
    start_date: '2026-02-01',
    due_time: '18:00',
    recurrence_rule: { day_of_month: 31, short_month_rule: 'LAST_DAY_OF_MONTH' }
  }, ownerToken);
  assert.strictEqual(monthly.success, true);
  monthlyDefId = monthly.data.definition.task_definition_id;
  // Verify February (28 days in 2026) snapped to 2026-02-28
  const febOcc = monthly.data.occurrences.find(o => o.occurrence_date.startsWith('2026-02'));
  assert.ok(febOcc, 'Expected February occurrence for 31st monthly rule');
  assert.strictEqual(febOcc.occurrence_date, '2026-02-28');
});

runTest('8. Idempotent recurrence generation produces 0 duplicate occurrences on repeated runs', () => {
  const beforeCount = sandbox.getTableRows('TaskOccurrences').length;
  const gen1 = callApi('generateOccurrences', { horizon_days: 7 }, ownerToken);
  assert.strictEqual(gen1.success, true);
  const afterFirst = sandbox.getTableRows('TaskOccurrences').length;

  const gen2 = callApi('generateOccurrences', { horizon_days: 7 }, ownerToken);
  assert.strictEqual(gen2.success, true);
  assert.strictEqual(gen2.data.created_count, 0);
  const afterSecond = sandbox.getTableRows('TaskOccurrences').length;
  assert.strictEqual(afterFirst, afterSecond);
  assert.ok(afterSecond >= beforeCount);
});

runTest('9. Strict RBAC isolation: Employee 2 cannot view or update Employee 1 tasks', () => {
  const emp2List = callApi('listTasks', {}, emp2Token);
  assert.strictEqual(emp2List.success, true);
  const leaked = emp2List.data.tasks.find(t => t.assigned_user_id === emp1Id);
  assert.strictEqual(leaked, undefined, 'Employee 2 must not see Employee 1 tasks');

  const illegalDetail = callApi('getTaskDetails', { occurrence_id: oneTimeOccId }, emp2Token);
  assert.strictEqual(illegalDetail.success, false);
  assert.strictEqual(illegalDetail.code, 'FORBIDDEN');

  const illegalUpdate = callApi('addTaskUpdate', {
    occurrence_id: oneTimeOccId,
    message: 'Trying to tamper with another employee task'
  }, emp2Token);
  assert.strictEqual(illegalUpdate.success, false);
  assert.strictEqual(illegalUpdate.code, 'FORBIDDEN');
});

runTest('10. Task lifecycle & progress timeline: Employee submits progress, blocker, and review request; cannot self-complete', () => {
  // Employee tries to mark task Completed directly -> must fail
  const illegalComplete = callApi('updateTaskStatus', {
    occurrence_id: oneTimeOccId,
    status: 'Completed'
  }, emp1Token);
  assert.strictEqual(illegalComplete.success, false);
  assert.strictEqual(illegalComplete.code, 'INVALID_STATUS_TRANSITION');

  // Employee submits progress update -> transitions Assigned -> In Progress
  const prog1 = callApi('addTaskUpdate', {
    occurrence_id: oneTimeOccId,
    update_type: 'PROGRESS_UPDATE',
    message: 'Reconciled 65% of October vendor invoices.',
    work_completed: 'Verified 42 out of 64 invoices against HDFC bank statement.',
    next_steps: 'Waiting on 3 credit notes from logistics vendor.',
    progress_percentage: 65
  }, emp1Token);
  assert.strictEqual(prog1.success, true);
  assert.strictEqual(prog1.data.occurrence.status, 'In Progress');
  assert.strictEqual(Number(prog1.data.occurrence.progress_percentage), 65);

  // Owner posts additional instruction
  const ownerInst = callApi('addTaskUpdate', {
    occurrence_id: oneTimeOccId,
    update_type: 'OWNER_INSTRUCTION',
    message: 'Use the revised October GST ledger in shared folder for those 3 credit notes.'
  }, ownerToken);
  assert.strictEqual(ownerInst.success, true);

  // Employee submits for Owner review
  const submitReview = callApi('addTaskUpdate', {
    occurrence_id: oneTimeOccId,
    update_type: 'SUBMIT_FOR_REVIEW',
    message: 'All 64 invoices reconciled and variance report attached.',
    work_completed: '100% reconciliation complete.',
    progress_percentage: 100
  }, emp1Token);
  assert.strictEqual(submitReview.success, true);
  assert.strictEqual(submitReview.data.occurrence.status, 'Awaiting Owner Review');

  // Owner approves completion
  const approve = callApi('updateTaskStatus', {
    occurrence_id: oneTimeOccId,
    status: 'Completed',
    message: 'Reviewed and approved. Great job!'
  }, ownerToken);
  assert.strictEqual(approve.success, true);
  assert.strictEqual(approve.data.occurrence.status, 'Completed');
  assert.ok(approve.data.occurrence.completed_at);

  // Verify chronological timeline has all 5 entries (Creation + Progress + Owner Instruction + Review Request + Completion)
  const details = callApi('getTaskDetails', { occurrence_id: oneTimeOccId }, emp1Token);
  assert.strictEqual(details.success, true);
  assert.strictEqual(details.data.updates.length, 5);
});

runTest('11. Completing one occurrence of a Daily task does not complete other occurrences', () => {
  const allOccs = sandbox.getTableRows('TaskOccurrences').filter(o => o.task_definition_id === dailyDefId);
  assert.ok(allOccs.length >= 2);
  const firstOcc = allOccs[0];
  const secondOcc = allOccs[1];

  const completeFirst = callApi('updateTaskStatus', {
    occurrence_id: firstOcc.occurrence_id,
    status: 'Completed',
    message: 'Completed Day 1 POS closing report.'
  }, ownerToken);
  assert.strictEqual(completeFirst.success, true);

  const refreshedSecond = sandbox.getTableRows('TaskOccurrences').find(o => o.occurrence_id === secondOcc.occurrence_id);
  assert.strictEqual(refreshedSecond.status, 'Assigned', 'Second occurrence must remain Assigned');
});

runTest('12. Deactivating an Employee revokes active sessions immediately while retaining historical tasks', () => {
  const deact = callApi('deactivateUser', { user_id: emp2Id, is_active: false }, ownerToken);
  assert.strictEqual(deact.success, true);

  // Employee 2 existing session token must now be rejected
  const blockedCall = callApi('listTasks', {}, emp2Token);
  assert.strictEqual(blockedCall.success, false);

  // Historical tasks for Employee 2 must still exist in Owner dashboard
  const ownerDash = callApi('getOwnerDashboard', {}, ownerToken);
  assert.strictEqual(ownerDash.success, true);
  const emp2Historical = ownerDash.data.tasks.filter(t => t.assigned_user_id === emp2Id);
  assert.ok(emp2Historical.length > 0, 'Historical tasks for deactivated user must remain intact');
});

runTest('13. Session expiration after 72 hours and logout invalidation', () => {
  // Artificially age emp1 session past 72 hours in the Sessions sheet
  const sessions = sandbox.getTableRows('Sessions');
  const emp1Session = sessions.find(s => s.user_id === emp1Id && !s.is_revoked);
  assert.ok(emp1Session);
  const expiredCreated = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
  const expiredAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  sandbox.updateRowByKey('Sessions', 'session_id', emp1Session.session_id, {
    created_at: expiredCreated,
    expires_at: expiredAt
  });

  const expiredCheck = callApi('validateSession', {}, emp1Token);
  assert.strictEqual(expiredCheck.success, false);
  assert.strictEqual(expiredCheck.code, 'SESSION_EXPIRED');

  // Owner logs out -> subsequent API calls with ownerToken must fail
  const logoutRes = callApi('logout', {}, ownerToken);
  assert.strictEqual(logoutRes.success, true);

  const afterLogout = callApi('getOwnerDashboard', {}, ownerToken);
  assert.strictEqual(afterLogout.success, false);
  assert.strictEqual(afterLogout.code, 'SESSION_REVOKED');
});

console.log(`\nALL ${passed} BACKEND INTEGRATION TESTS PASSED SUCCESSFULLY!`);
