/**
 * ============================================================================
 * api.js - Production Google Apps Script API Client (CORS-Safe POST Dispatcher)
 * ============================================================================
 *
 * CRITICAL CORS SOLUTION FOR GOOGLE APPS SCRIPT + GITHUB PAGES:
 * Standard `fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } })`
 * triggers a browser HTTP OPTIONS preflight request, which Google Apps Script Web Apps
 * reject because GAS does not handle OPTIONS requests.
 *
 * By sending a POST request with:
 *   headers: { 'Content-Type': 'text/plain;charset=utf-8' }
 *   redirect: 'follow'
 * the browser treats it as a CORS "simple request" (no OPTIONS preflight), follows
 * Google's 302 redirect to `script.googleusercontent.com`, and parses the JSON response
 * returned by `ContentService.createTextOutput(JSON.stringify(...)).setMimeType(JSON)`.
 */

import { getStoredSession, clearStoredSession, getConfiguredApiUrl } from '../utils/storage';

export class ApiError extends Error {
  constructor(message, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export async function callBackendApi(action, payload = {}, customToken = null) {
  const apiUrl = getConfiguredApiUrl();
  if (!apiUrl) {
    throw new ApiError(
      'Google Apps Script Web App URL is not configured. Set VITE_GAS_API_URL in .env.local or configure it in Backend Connection Settings.',
      'MISSING_API_URL'
    );
  }

  const stored = getStoredSession();
  const sessionToken = customToken !== null ? customToken : (stored ? stored.sessionToken : '');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        // Must be text/plain to prevent CORS OPTIONS preflight failure on Google Apps Script
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        payload,
        sessionToken
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ApiError(`HTTP Error ${response.status}: ${response.statusText}`, 'HTTP_ERROR');
    }

    const result = await response.json();

    if (!result.success) {
      if (
        ['UNAUTHORIZED', 'INVALID_SESSION', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'USER_INACTIVE'].includes(
          result.code
        )
      ) {
        clearStoredSession();
        window.dispatchEvent(new CustomEvent('taskflow:session-expired', { detail: result.error }));
      }
      throw new ApiError(result.error || 'Operation failed on server.', result.code || 'API_ERROR');
    }

    return result.data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError('Request timed out while waiting for Google Sheets backend. Please retry.', 'TIMEOUT');
    }
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(
      err.message || 'Network error while communicating with Google Apps Script.',
      'NETWORK_ERROR'
    );
  }
}
