import React from 'react';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MoveToStandaloneModalProps {
  isOpen: boolean;
  recordingName: string;
  patientName: string;
  isMoving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  truncateFileName: (name: string) => string;
}

export const MoveToStandaloneModal: React.FC<MoveToStandaloneModalProps> = ({
  isOpen,
  recordingName,
  patientName,
  isMoving,
  onConfirm,
  onCancel,
  truncateFileName
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
            <UserX className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Move to Standalone</h3>
            <p className="text-sm text-gray-600">Remove patient assignment</p>
          </div>
        </div>
        
        <p className="text-gray-700 mb-6">
          Are you sure you want to move "<strong>{truncateFileName(recordingName)}</strong>" 
          to standalone recordings? This will remove its association with <strong>{patientName}</strong>.
        </p>
        
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isMoving}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isMoving ? (
              <>
                <div className="w-4 h-4 animate-spin mr-2">⟳</div>
                Moving...
              </>
            ) : (
              <>
                <UserX className="w-4 h-4 mr-2" />
                Move to Standalone
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

