import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';

/**
 * Hook for manually capturing exceptions with PostHog
 * 
 * @example
 * const { captureException } = useErrorTracking();
 * 
 * try {
 *   // Your code
 * } catch (error) {
 *   captureException(error, { context: 'user_action' });
 * }
 */
export const useErrorTracking = () => {
  const posthog = usePostHog();

  const captureException = useCallback(
    (error: Error | unknown, additionalProperties?: Record<string, unknown>) => {
      if (!posthog) {
        console.error('PostHog not initialized', error);
        return;
      }

      // Convert error to Error object if it's not already
      const errorObject = error instanceof Error 
        ? error 
        : new Error(String(error));

      // Capture the exception with PostHog
      posthog.captureException(errorObject, {
        ...additionalProperties,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });

      // Also log to console in development
      if (import.meta.env.DEV) {
        console.error('Exception captured:', errorObject, additionalProperties);
      }
    },
    [posthog]
  );

  return { captureException };
};

