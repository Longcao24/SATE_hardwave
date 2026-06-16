import { useState } from 'react';
import type { ProcessingError } from './types';

/**
 * Hook to manage error notification popup state and handlers
 */
export function useErrorNotification() {
  const [showErrorNotification, setShowErrorNotification] = useState(false);
  const [errorNotificationDetails, setErrorNotificationDetails] = useState<ProcessingError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryFunction, setRetryFunction] = useState<(() => Promise<void>) | null>(null);

  const showErrorNotificationPopup = (error: ProcessingError, retry?: () => Promise<void>) => {
    setErrorNotificationDetails(error);
    setRetryFunction(retry ? () => retry : null);
    setShowErrorNotification(true);
  };

  const closeErrorNotification = () => {
    setShowErrorNotification(false);
    setErrorNotificationDetails(null);
    setRetryFunction(null);
    setIsRetrying(false);
  };

  const handleRetry = async () => {
    if (retryFunction) {
      setIsRetrying(true);
      try {
        await retryFunction();
        closeErrorNotification();
      } catch (error) {
        // If retry fails, show the error again
        const errorDetails = (error as any).errorDetails as ProcessingError;
        if (errorDetails) {
          setErrorNotificationDetails(errorDetails);
          setRetryFunction(retryFunction); // Keep the same retry function
        }
      } finally {
        setIsRetrying(false);
      }
    }
  };

  return {
    showErrorNotification,
    errorNotificationDetails,
    isRetrying,
    handleRetry,
    closeErrorNotification,
    showErrorNotificationPopup,
    setShowErrorNotification,
    setErrorNotificationDetails,
    setRetryFunction,
  };
}

