import React from 'react';

interface ErrorFallbackProps {
  error: unknown;
  componentStack?: string | null;
  exceptionEvent?: unknown;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ 
  error, 
  componentStack 
}) => {
  // Convert error to Error object for consistent handling
  const errorObject = error instanceof Error ? error : new Error(String(error));
  const isDevelopment = import.meta.env.DEV;

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
          <svg
            className="w-6 h-6 text-red-600"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
          Something went wrong
        </h1>
        
        <p className="text-gray-600 text-center mb-6">
          We're sorry for the inconvenience. The error has been automatically reported to our team.
        </p>

        {isDevelopment && (
          <div className="mb-6 p-4 bg-gray-50 rounded border border-gray-200">
            <p className="text-sm font-semibold text-gray-700 mb-2">Error Details:</p>
            <p className="text-xs text-red-600 font-mono break-all mb-2">
              {errorObject.message}
            </p>
            {componentStack && (
              <details className="text-xs text-gray-600">
                <summary className="cursor-pointer font-semibold">Component Stack</summary>
                <pre className="mt-2 overflow-auto">{componentStack}</pre>
              </details>
            )}
          </div>
        )}

        <button
          onClick={handleReload}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors duration-200"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
};

