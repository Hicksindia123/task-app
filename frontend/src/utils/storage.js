/**
 * Safe browser storage utility for 72-hour session persistence.
 *
 * SECURITY DOCUMENTATION:
 * Why localStorage instead of HttpOnly cookies on GitHub Pages + Google Apps Script?
 * 1. GitHub Pages serves the frontend from `https://<username>.github.io`, while Google Apps Script
 *    executes on `https://script.google.com/macros/s/.../exec` and redirects (HTTP 302) to
 *    `https://script.googleusercontent.com`.
 * 2. Modern browsers (Safari ITP, Firefox ETP, Chrome third-party cookie restrictions) block
 *    cross-site `Set-Cookie` headers across unrelated domains (`github.io` <-> `googleusercontent.com`),
 *    and Google Apps Script `ContentService` does not allow custom `Set-Cookie` response headers.
 * 3. Therefore, we store ONLY:
 *      - `sessionToken` (opaque 256-bit cryptographically random token)
 *      - `expiresAt` (ISO timestamp strictly 72 hours from login)
 *    We NEVER trust client-cached role or user_id for authorization. On every app boot/refresh and
 *    on every API call, the backend validates `sessionToken` against the `Sessions` and `Users` sheets.
 */

const STORAGE_KEY = 'taskflow_enterprise_session_v1';
const API_URL_KEY = 'taskflow_gas_api_url_v1';

export function getStoredSession() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.sessionToken || !parsed.expiresAt) {
      clearStoredSession();
      return null;
    }
    const expiresMs = new Date(parsed.expiresAt).getTime();
    if (isNaN(expiresMs) || Date.now() >= expiresMs) {
      clearStoredSession();
      return null;
    }
    return parsed;
  } catch (err) {
    return null;
  }
}

export function setStoredSession({ sessionToken, expiresAt, createdAt, userHint }) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionToken,
        expiresAt,
        createdAt,
        // userHint is strictly for optimistic skeleton header; backend validateSession is authoritative
        userHint: userHint ? { full_name: userHint.full_name } : null
      })
    );
  } catch (err) {
    // Ignore storage quota errors
  }
}

export function clearStoredSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // Ignore storage errors
  }
}

export function getConfiguredApiUrl() {
  try {
    const override = window.localStorage.getItem(API_URL_KEY);
    if (override && override.startsWith('https://script.google.com/')) {
      return override.trim();
    }
  } catch (err) {
    // Ignore
  }
  const envUrl = import.meta.env?.VITE_GAS_API_URL || '';
  if (envUrl && !envUrl.includes('YOUR_DEPLOYMENT_ID')) {
    return envUrl.trim();
  }
  return '';
}

export function setConfiguredApiUrl(url) {
  try {
    if (!url) {
      window.localStorage.removeItem(API_URL_KEY);
    } else {
      window.localStorage.setItem(API_URL_KEY, url.trim());
    }
  } catch (err) {
    // Ignore
  }
}
