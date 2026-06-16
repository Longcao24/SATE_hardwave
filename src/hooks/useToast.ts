import { useState, useEffect } from 'react';

export interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export function useToast() {
  const [toast, setToast] = useState<Toast>({
    show: false,
    message: '',
    type: 'success'
  });

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast({ show: false, message: '', type: 'success' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({
      show: true,
      message,
      type
    });
  };

  const hideToast = () => {
    setToast({ show: false, message: '', type: 'success' });
  };

  return {
    toast,
    showToast,
    hideToast,
  };
}
