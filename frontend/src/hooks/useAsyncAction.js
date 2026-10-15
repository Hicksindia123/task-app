import { useState, useCallback, useRef } from 'react';

/**
 * Prevents duplicate form/button submissions and tracks loading/error state.
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlightRef = useRef(false);

  const run = useCallback(async (asyncFn) => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await asyncFn();
      return result;
    } catch (err) {
      setError(err.message || 'Operation failed.');
      throw err;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
