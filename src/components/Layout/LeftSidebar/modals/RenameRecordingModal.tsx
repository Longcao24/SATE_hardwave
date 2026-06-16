import React from 'react';
import { Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RenameRecordingModalProps {
  isOpen: boolean;
  renameValue: string;
  onValueChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RenameRecordingModal: React.FC<RenameRecordingModalProps> = ({
  isOpen,
  renameValue,
  onValueChange,
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Edit className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Rename Recording</h3>
            <p className="text-sm text-gray-600">Enter a new name for this recording</p>
          </div>
        </div>
        
        <input
          type="text"
          value={renameValue}
          onChange={(e) => onValueChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
          placeholder="Recording name"
          autoFocus
        />
        
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!renameValue.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

