import React, { useState } from 'react';
import { X, Save, FileText, Clipboard, StickyNote } from 'lucide-react';
import { Button } from '../ui/button';
import { type RecordingMetadata } from '@/services/recordingMetadataService';
import { ProgressStepper } from '../Common/ProgressStepper';

interface RecordingMetadataFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (metadata: RecordingMetadata) => void;
  isLoading?: boolean;
  initialData?: Partial<RecordingMetadata>;
  patientName?: string;
  isProcessing?: boolean;
  processingProgress?: number;
  zIndex?: number;
  hasError?: boolean;
}

const RecordingMetadataForm: React.FC<RecordingMetadataFormProps> = ({
  isOpen,
  onClose,
  onSave,
  isLoading = false,
  initialData = {},
  patientName,
  isProcessing = false,
  processingProgress = 0,
  zIndex = 50,
  hasError = false
}) => {
  const [formData, setFormData] = useState<RecordingMetadata>({
    name: initialData.name || '',
    protocol: initialData.protocol || '',
    note: initialData.note || '',
  });

  const [errors, setErrors] = useState<Partial<RecordingMetadata>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<RecordingMetadata> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Recording name is required';
    }

    if (!formData.protocol.trim()) {
      newErrors.protocol = 'Protocol is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave({
        name: formData.name.trim(),
        protocol: formData.protocol.trim(),
        note: formData.note.trim(),
      });
    }
  };

  const handleInputChange = (field: keyof RecordingMetadata, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  if (!isOpen) return null;

  const recordingSteps = [
    { number: 1, title: 'Assign Patient', description: 'Select patient' },
    { number: 2, title: 'Import Audio', description: 'Upload file' },
    { number: 3, title: 'Fill Details', description: 'Add metadata' },
    { number: 4, title: 'Save', description: 'Complete' },
  ];

  // Determine current step: 3 if processing or filling form, 4 if ready to save
  const currentStep = isProcessing && processingProgress < 100 ? 3 : isLoading ? 4 : 3;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 h-auto max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">Recording Details</h2>
              {isProcessing && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-blue-600 font-medium">Processing...</span>
                </div>
              )}
            </div>
            {patientName && (
              <p className="text-xs text-gray-600 mt-0.5">
                Recording for {patientName}
              </p>
            )}
            {isProcessing ? (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-blue-700 font-medium">
                    {processingProgress < 30 && "Uploading and caching audio file..."}
                    {processingProgress >= 30 && processingProgress < 60 && "Transcribing speech with AI..."}
                    {processingProgress >= 60 && processingProgress < 90 && "Analyzing errors and patterns..."}
                    {processingProgress >= 90 && "Finalizing..."}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-blue-600 mt-1">
                  <span>
                    {processingProgress < 30 ? 'Step 1 of 2: File Upload' : 'Step 2 of 2: AI Processing'} - {processingProgress}%
                  </span>
                  <span>Fill out the form while we process</span>
                </div>
              </div>
            ) : hasError && isProcessing ? (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✕</span>
                  </div>
                  <span className="text-sm text-red-700 font-medium">
                    Audio processing encountered errors. Please check the error message above.
                  </span>
                </div>
              </div>
            ) : hasError ? (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">!</span>
                  </div>
                  <span className="text-sm text-yellow-700 font-medium">
                    Processing completed with warnings. You can still save the recording.
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                  <span className="text-sm text-green-700 font-medium">
                    Audio processing complete! Ready to save.
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
            title={isLoading ? "Please wait while saving" : "Close"}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Stepper */}
        <div className="flex-shrink-0">
          <ProgressStepper currentStep={currentStep} steps={recordingSteps} />
        </div>

        {/* Form - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {isProcessing && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-yellow-700">
                💡 <strong>Tip:</strong> Save time by filling out these details while your audio is being processed!
              </p>
            </div>
          )}
          {/* Recording Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <FileText className="w-4 h-4" />
              Recording Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter a descriptive name for this recording"
              disabled={isLoading}
            />
            {errors.name && (
              <p className="text-red-600 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Protocol */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Clipboard className="w-4 h-4" />
              Protocol *
            </label>
            <input
              type="text"
              value={formData.protocol}
              onChange={(e) => handleInputChange('protocol', e.target.value)}
              placeholder="Enter protocol (e.g., Narrative Sample, Conversation, etc.)"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.protocol ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={isLoading}
            />
            {errors.protocol && (
              <p className="text-red-600 text-xs mt-1">{errors.protocol}</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <StickyNote className="w-4 h-4" />
              Notes
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => handleInputChange('note', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any additional notes about this recording session..."
              disabled={isLoading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={isLoading || (isProcessing && processingProgress < 100)}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : isProcessing && processingProgress < 100 ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Processing... ({processingProgress}%)
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Recording
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordingMetadataForm;
