import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock } from 'lucide-react';

interface ErrorDisplaysProps {
  processingError: string | null;
  showErrorNotification: boolean;
  showTimeoutWarning: boolean;
  onCloseProcessingError: () => void;
  onRetryProcessing: () => void;
  onCloseTimeoutWarning: () => void;
}

const ErrorDisplays: React.FC<ErrorDisplaysProps> = ({
  processingError,
  showErrorNotification,
  showTimeoutWarning,
  onCloseProcessingError,
  onRetryProcessing,
  onCloseTimeoutWarning
}) => {
  return (
    <>
      {/* Processing Error Display */}
      {processingError && !showErrorNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[65]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Processing Failed</h3>
                  <p className="text-sm text-gray-600">There was an error processing your audio file</p>
                </div>
              </div>
              
              <p className="text-gray-700 mb-6">
                {processingError}
              </p>
              
              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCloseProcessingError}
                  className="px-4 py-2 text-gray-600 border-gray-200 hover:bg-gray-50"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={onRetryProcessing}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Timeout Warning */}
      {showTimeoutWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[55]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Processing Taking Longer</h3>
                  <p className="text-sm text-gray-600">This is taking longer than usual</p>
                </div>
              </div>
              
              <p className="text-gray-700 mb-6">
                Your audio file is still processing. Large files or high server load can cause delays. 
                The process will continue in the background.
              </p>
              
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={onCloseTimeoutWarning}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Continue Waiting
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ErrorDisplays;
