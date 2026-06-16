import { useState } from 'react';

/**
 * Hook to manage processing state (loading, progress, timeout warnings)
 */
export function useProcessingState() {
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  return {
    isDataLoading,
    setIsDataLoading,
    dataError,
    setDataError,
    isProcessing,
    setIsProcessing,
    processingProgress,
    setProcessingProgress,
    showTimeoutWarning,
    setShowTimeoutWarning,
  };
}

