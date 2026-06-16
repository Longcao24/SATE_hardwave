import React, { useState } from 'react';
import { useErrorTracking } from '@/hooks/useErrorTracking';

/**
 * Test component for verifying PostHog error tracking
 * 
 * This component provides buttons to test:
 * 1. Automatic error capture (throws error in render)
 * 2. Manual error capture (uses captureException)
 * 3. Async error capture
 * 
 * @important Remove this component from production build
 */
export const TestErrorTracking: React.FC = () => {
  const { captureException } = useErrorTracking();
  const [shouldThrow, setShouldThrow] = useState(false);
  const [asyncError, setAsyncError] = useState<string | null>(null);

  // Test automatic error capture (caught by error boundary)
  if (shouldThrow) {
    throw new Error('Test: Automatic error capture via Error Boundary');
  }

  // Test manual error capture
  const testManualCapture = () => {
    try {
      const testError = new Error('Test: Manual exception capture');
      captureException(testError, {
        testType: 'manual',
        component: 'TestErrorTracking',
        timestamp: new Date().toISOString(),
      });
      alert('Manual error captured! Check PostHog dashboard.');
    } catch (error) {
      console.error('Failed to capture error:', error);
    }
  };

  // Test async error capture
  const testAsyncCapture = async () => {
    try {
      setAsyncError(null);
      // Simulate async operation that fails
      await new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Test: Async operation failed'));
        }, 1000);
      });
    } catch (error) {
      captureException(error, {
        testType: 'async',
        component: 'TestErrorTracking',
        operation: 'simulated_async_call',
      });
      setAsyncError('Async error captured! Check PostHog dashboard.');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          🧪 Error Tracking Tests
        </h2>
        <p className="text-sm text-gray-600">
          Test PostHog error tracking functionality. 
          <span className="font-semibold text-orange-600"> Remove this component in production!</span>
        </p>
      </div>

      <div className="space-y-4">
        {/* Test 1: Automatic Capture */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">
            1️⃣ Automatic Error Capture
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Throws an error that will be caught by PostHogErrorBoundary
          </p>
          <button
            onClick={() => setShouldThrow(true)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Throw Error (Boundary)
          </button>
        </div>

        {/* Test 2: Manual Capture */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">
            2️⃣ Manual Error Capture
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Manually captures an exception using useErrorTracking hook
          </p>
          <button
            onClick={testManualCapture}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Capture Manual Error
          </button>
        </div>

        {/* Test 3: Async Capture */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">
            3️⃣ Async Error Capture
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Simulates an async operation failure and captures the error
          </p>
          <button
            onClick={testAsyncCapture}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            Trigger Async Error
          </button>
          {asyncError && (
            <div className="mt-2 p-2 bg-green-100 text-green-800 text-sm rounded">
              {asyncError}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>📊 Verification Steps:</strong>
        </p>
        <ol className="text-sm text-blue-800 mt-2 space-y-1 list-decimal list-inside">
          <li>Click any test button above</li>
          <li>Open your PostHog dashboard</li>
          <li>Navigate to Error Tracking section</li>
          <li>Verify the exception appears in the activity feed</li>
        </ol>
      </div>
    </div>
  );
};

