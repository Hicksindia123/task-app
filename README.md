# TaskFlow — Task Delegation & Progress Tracking App

A clean, modern **Task Delegation & Progress Tracking** app for small/medium businesses.  
**Owner** delegates tasks → **Employees** work on them and submit updates → **Owner** reviews and approves.

**Tech Stack:** React + Vite + Tailwind CSS (frontend) · Google Apps Script + Google Sheets (backend)

---

## How to Use This App (Simple Guide)

### Logging In

1. Open the app in your browser.
2. Enter your **username** and **password** on the login screen.
3. Click **Sign In**.
4. Your session stays active for **72 hours** — you don't need to log in again even if you refresh the page.

> **Default Owner account** (created automatically when the database is first set up):  
> Username: `owner` · Password: `ChangeMe@123`  
> ⚠️ Change this password immediately after your first login.

---

### If You Are the Owner

After logging in, you'll see a **sidebar** on the left with these sections:

| Section | What You Can Do |
|---------|-----------------|
| **Dashboard** | See a summary of all tasks — how many are active, pending, in progress, overdue, blocked, and completed. See employee workload at a glance. |
| **All Tasks** | Browse and filter every task in the system. Search by name, employee, status, priority, or date range. Click any task to see its full details and conversation history. |
| **Create Task** | Delegate a new task to any employee. Choose **One-Time**, **Daily**, **Weekly**, or **Monthly** schedule. Set priority (Low / Medium / High / Urgent), due date/time, and instructions. |
| **Recurring Tasks** | View and manage all recurring task templates. Edit the schedule, reassign to a different employee, or deactivate a recurring series. |
| **Users & Roles** | Add new employee accounts, edit their profile/department, reset passwords, or deactivate accounts. See each employee's task stats. |
| **Activity Log** | Full audit trail of everything that has happened — logins, task creations, status changes, updates. Filter by action type or search. |
| **Settings** | Change organization name, timezone, session duration, and recurrence settings. |

#### Owner-Only Actions
- ✅ Create and delegate tasks
- ✅ Mark tasks as **Completed** (final sign-off)
- ✅ Cancel or reopen tasks
- ✅ Create/edit/deactivate employee accounts
- ✅ Reset employee passwords
- ✅ View the full audit log
- ✅ Reassign tasks to different employees
- ✅ Post instructions/feedback on any task

---

### If You Are an Employee

After logging in, you'll see:

| Section | What You Can Do |
|---------|-----------------|
| **My Dashboard** | See your personal task summary — pending, in progress, awaiting review, completed, overdue, and high-priority counts. |
| **My Tasks** | See all tasks assigned to you. Click any task to open its detail view. |
| **My Updates** | See all your submitted progress updates across all tasks. |
| **My Profile** | View your account details. |

#### How to Work on a Task (Step by Step)

1. Go to **My Tasks** and click on a task.
2. The task detail page shows the full description, instructions, and a timeline of all updates.
3. To **submit a progress update**:
   - Write what work you completed
   - Set your progress percentage
   - Mention any blockers or help needed
   - Click Submit
4. When you submit your first update, the task automatically moves to **In Progress**.
5. If you're **blocked**, report a blocker — the task will move to **Blocked** status so the Owner sees it immediately.
6. When you're done, submit your work as **Awaiting Owner Review** — the Owner will review and mark it Completed.

> 🔒 **You cannot mark a task as "Completed" yourself.** Only the Owner can do that after reviewing your work. This is by design.

#### Employee Restrictions
- ❌ Cannot create tasks
- ❌ Cannot see other employees' tasks
- ❌ Cannot mark tasks as Completed directly
- ❌ Cannot access Users, Settings, or Audit Log
- ❌ Cannot modify task details (name, description, priority, due date)

---

### Task Statuses Explained

| Status | Meaning |
|--------|---------|
| **Assigned** | Task has been created and assigned but work hasn't started yet |
| **In Progress** | Employee is actively working on it |
| **Blocked** | Employee reported a blocker — needs Owner attention |
| **Awaiting Owner Review** | Employee submitted their work for Owner review |
| **Completed** | Owner has reviewed and approved — task is done ✅ |
| **On Hold** | Owner paused the task temporarily |
| **Cancelled** | Owner cancelled the task |

### Priority Levels

| Priority | When to Use |
|----------|-------------|
| **Low** | Not urgent, can be done when time permits |
| **Medium** | Standard priority, regular work |
| **High** | Important, should be done soon |
| **Urgent** | Critical, needs immediate attention |

---

### Recurring Tasks

The Owner can create tasks that repeat automatically:

- **Daily** — A new task occurrence is generated every day (can skip Sundays)
- **Weekly** — Choose which days of the week (e.g., Monday and Thursday)
- **Monthly** — Choose which day of the month (e.g., the 15th or the last day)

Each occurrence is independent — completing Monday's task doesn't affect Tuesday's task.

---

### Signing Out

Click **Sign Out** at the bottom of the sidebar. Your session is immediately invalidated on the server. If you want to switch users, sign out first and then sign in with different credentials.

---

## Setup & Deployment Guide

### Step 1: Set Up the Google Sheet Backend

1. Create a new **Google Spreadsheet** named `TaskFlow Database`.
2. Go to **Extensions → Apps Script**.
3. Create these 8 script files and paste the code from the `backend/` folder:
   - `Code.gs`, `Auth.gs`, `Users.gs`, `Tasks.gs`, `Updates.gs`, `Recurrence.gs`, `Dashboard.gs`, `Audit.gs`
4. Select the function **`setupDatabase`** and click **Run**. Grant permissions when asked.
5. This creates all 7 database sheets and the initial Owner account.

### Step 2: Deploy the Backend

1. In Apps Script: **Deploy → New deployment**
2. Type: **Web app**
3. Execute as: **Me** · Who has access: **Anyone**
4. Click **Deploy** and copy the URL.

### Step 3: Set Up the Daily Trigger (for recurring tasks)

1. In Apps Script sidebar, click **Triggers** (⏰ icon).
2. Add a trigger: Function = `scheduledDailyRecurrenceTrigger`, Time-driven, Daily, Midnight.

### Step 4: Run the Frontend

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local → set VITE_GAS_API_URL to your deployment URL
npm install
npm run dev
```

### Step 5: Deploy to GitHub Pages (optional)

```bash
cd frontend
npm run build
npm run deploy
```

---

## Project Structure

```
task-delegation-app/
├── backend/           ← Google Apps Script files (paste into Apps Script editor)
│   ├── Code.gs        ← API router, database setup, helper functions
│   ├── Auth.gs        ← Login, sessions, password hashing, brute-force protection
│   ├── Users.gs       ← User CRUD, role management
│   ├── Tasks.gs       ← Task creation, status transitions, RBAC
│   ├── Updates.gs     ← Progress updates, blocker reports, Owner instructions
│   ├── Recurrence.gs  ← Recurring task scheduling (daily/weekly/monthly)
│   ├── Dashboard.gs   ← KPI aggregation for Owner & Employee dashboards
│   └── Audit.gs       ← Immutable activity log, app settings
├── frontend/          ← React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── pages/     ← LoginPage, OwnerDashboard, EmployeeDashboard
│   │   ├── layouts/   ← DashboardLayout (sidebar + header)
│   │   ├── components/← StatusBadge, ConfirmDialog
│   │   ├── context/   ← AuthContext (session management)
│   │   ├── services/  ← API client (CORS-safe POST to Google Apps Script)
│   │   ├── hooks/     ← useAsyncAction (loading/error state)
│   │   ├── utils/     ← formatters, localStorage session storage
│   │   └── styles/    ← Tailwind CSS with custom theme
│   ├── .env.local     ← Your Google Apps Script URL (not committed to git)
│   └── package.json
└── tests/
    └── backend.test.js ← Automated integration tests (run with Node.js)
```

---

## Security Notes

- **Passwords** are never stored in plain text — they use iterative salted SHA-256 hashing with a server-side pepper.
- **Session tokens** are cryptographically random, hashed before storage, and expire after exactly 72 hours.
- **Role enforcement** happens entirely on the backend — the frontend never decides what you can or can't do.
- **Account lockout** kicks in after 5 failed login attempts (15-minute lockout).
- **Deactivating** a user immediately revokes all their active sessions.

---

## Running Backend Tests

```bash
cd tests
node backend.test.js
```

This runs 13 integration tests covering login, RBAC, task lifecycle, recurrence, session expiry, and more.
