'use client';

import { useState, useEffect } from 'react';
import { getParticipantToken } from '../../../../lib/livekit-client';

export function useLiveKitRoom(sessionId: string) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    getParticipantToken(sessionId)
      .then((data) => {
        if (isMounted) {
          setToken(data.token);
          setUrl(data.url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  return {
    token,
    url,
    isLoading,
    error,
  };
}
