import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { callBackendApi } from '../services/api';
import { getStoredSession, setStoredSession, clearStoredSession } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState('');

  const verifyExistingSession = useCallback(async () => {
    const stored = getStoredSession();
    if (!stored || !stored.sessionToken) {
      setUser(null);
      setSessionMeta(null);
      setInitializing(false);
      return;
    }

    try {
      const data = await callBackendApi('validateSession', {}, stored.sessionToken);
      setUser(data.user);
      setSessionMeta({
        sessionToken: stored.sessionToken,
        createdAt: data.session.created_at,
        expiresAt: data.session.expires_at
      });
    } catch (err) {
      clearStoredSession();
      setUser(null);
      setSessionMeta(null);
      if (err.code === 'SESSION_EXPIRED') {
        setAuthError('Your 72-hour session has expired. Please sign in again.');
      }
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    verifyExistingSession();

    const handleExpired = (e) => {
      setUser(null);
      setSessionMeta(null);
      setAuthError(e.detail || 'Your session has expired. Please log in again.');
    };

    window.addEventListener('taskflow:session-expired', handleExpired);
    return () => window.removeEventListener('taskflow:session-expired', handleExpired);
  }, [verifyExistingSession]);

  const login = async (username, password) => {
    setAuthError('');
    const data = await callBackendApi(
      'login',
      {
        username,
        password,
        userAgent: navigator.userAgent
      },
      ''
    );

    setStoredSession({
      sessionToken: data.sessionToken,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      userHint: data.user
    });

    setUser(data.user);
    setSessionMeta({
      sessionToken: data.sessionToken,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt
    });
    return data.user;
  };

  const logout = async () => {
    const stored = getStoredSession();
    try {
      if (stored && stored.sessionToken) {
        await callBackendApi('logout', {}, stored.sessionToken);
      }
    } catch (err) {
      // Always clear local session even if network call fails
    } finally {
      clearStoredSession();
      setUser(null);
      setSessionMeta(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionMeta,
        initializing,
        authError,
        setAuthError,
        login,
        logout,
        refreshSession: verifyExistingSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
