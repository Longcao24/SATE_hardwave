import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'warning' | 'danger' | 'info';
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'warning'
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    warning: {
      icon: 'text-yellow-600',
      iconBg: 'bg-yellow-100',
      iconRing: 'ring-yellow-200',
      button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
      gradient: 'from-yellow-50 to-white'
    },
    danger: {
      icon: 'text-red-600',
      iconBg: 'bg-red-100',
      iconRing: 'ring-red-200',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      gradient: 'from-red-50 to-white'
    },
    info: {
      icon: 'text-blue-600',
      iconBg: 'bg-blue-100',
      iconRing: 'ring-blue-200',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      gradient: 'from-blue-50 to-white'
    }
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-200 ease-out scale-100 opacity-100 animate-modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content with gradient background */}
          <div className={`p-6 bg-gradient-to-b ${styles.gradient} rounded-t-2xl`}>
            {/* Icon with ring effect */}
            <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full ${styles.iconBg} ring-4 ${styles.iconRing} mb-4 animate-pulse`}>
              <AlertTriangle className={`h-8 w-8 ${styles.icon}`} />
            </div>

            {/* Title */}
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-3">
              {title}
            </h3>

            {/* Message */}
            <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed px-2">
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 p-6 pt-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 ${styles.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;

