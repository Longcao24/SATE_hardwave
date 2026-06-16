import React from 'react';

interface ToastNotificationProps {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ show, message, type }) => {
  if (!show) return null;

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
      type === 'success' 
        ? 'bg-green-100 border border-green-200 text-green-800' 
        : 'bg-red-100 border border-red-200 text-red-800'
    }`}>
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
          type === 'success' ? 'bg-green-200' : 'bg-red-200'
        }`}>
          {type === 'success' ? '✓' : '✕'}
        </div>
        <p className="text-sm font-medium">{message}</p>
      </div>
    </div>
  );
};

