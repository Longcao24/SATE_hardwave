import React from 'react';
import { AlertTriangle, RefreshCw, X, Wifi, Server, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';

interface ErrorNotificationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  error: {
    type: 'api' | 'network' | 'server' | 'validation' | 'unknown';
    message: string;
    originalError?: string;
    retryable?: boolean;
  };
  isRetrying?: boolean;
}

const ErrorNotificationPopup: React.FC<ErrorNotificationPopupProps> = ({
  isOpen,
  onClose,
  onRetry,
  error,
  isRetrying = false
}) => {
  if (!isOpen) return null;

  const getErrorIcon = () => {
    switch (error.type) {
      case 'network':
        return <Wifi className="w-8 h-8 text-orange-500" />;
      case 'server':
        return <Server className="w-8 h-8 text-red-500" />;
      case 'api':
        return <AlertTriangle className="w-8 h-8 text-red-500" />;
      case 'validation':
        return <AlertCircle className="w-8 h-8 text-yellow-500" />;
      default:
        return <AlertTriangle className="w-8 h-8 text-red-500" />;
    }
  };

  const getErrorTitle = () => {
    switch (error.type) {
      case 'network':
        return 'Connection Problem';
      case 'server':
        return 'Server Error';
      case 'api':
        return 'Processing Error';
      case 'validation':
        return 'Invalid File';
      default:
        return 'Something Went Wrong';
    }
  };

  const getErrorColor = () => {
    switch (error.type) {
      case 'network':
        return 'border-orange-200 bg-orange-50';
      case 'server':
        return 'border-red-200 bg-red-50';
      case 'api':
        return 'border-red-200 bg-red-50';
      case 'validation':
        return 'border-yellow-200 bg-yellow-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {getErrorIcon()}
            <h2 className="text-lg font-semibold text-gray-800">{getErrorTitle()}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error Message */}
          <div className={`p-4 rounded-lg border ${getErrorColor()}`}>
            <p className="text-sm text-gray-800 font-medium mb-2">
              {error.message}
            </p>
            
            {/* Common solutions based on error type */}
            {error.type === 'server' && (
              <div className="text-sm text-gray-600">
                <p className="mb-2">This usually happens when:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The server is starting up (may take 1-2 minutes)</li>
                  <li>The server is experiencing high load</li>
                  <li>Your device doesn't support the processing method</li>
                </ul>
              </div>
            )}
            
            {error.type === 'network' && (
              <div className="text-sm text-gray-600">
                <p className="mb-2">Please check:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Your internet connection</li>
                  <li>Firewall or proxy settings</li>
                  <li>Try again in a few moments</li>
                </ul>
              </div>
            )}
            
            {error.type === 'api' && (
              <div className="text-sm text-gray-600">
                <p className="mb-2">This can happen when:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>The audio file format is not fully supported</li>
                  <li>The server needs different processing settings</li>
                  <li>There's a temporary processing issue</li>
                </ul>
              </div>
            )}
          </div>

          {/* Technical Details - Collapsible */}
          {error.originalError && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-medium">
                Technical Details
              </summary>
              <div className="mt-2 p-3 bg-gray-100 rounded border text-xs font-mono text-gray-700 max-h-32 overflow-y-auto">
                {error.originalError}
              </div>
            </details>
          )}

          {/* Suggested Actions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium mb-2">
              💡 Suggested Actions:
            </p>
            <ul className="text-sm text-blue-700 space-y-1">
              {error.retryable && (
                <li>• Try processing the file again</li>
              )}
              {error.type === 'server' && (
                <li>• Wait 1-2 minutes for the server to warm up</li>
              )}
              {error.type === 'api' && (
                <li>• Try using a different audio file format (WAV recommended)</li>
              )}
              <li>• Use the sample data to test the system</li>
              <li>• Check if the file is corrupted or too large</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isRetrying}
          >
            Close
          </Button>
          
          {error.retryable && (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorNotificationPopup; 