import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileAudio, X, Loader2, Users } from 'lucide-react';
import { Button } from '../ui/button';
import { type Patient, patientService } from '@/services/patientService';
import { ProgressStepper } from '../Common/ProgressStepper';

interface ImportPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload?: (file: File, patientId?: string) => void;
  isProcessing?: boolean;
  processingProgress?: number;
  preSelectedPatientId?: string;
  onBack?: () => void;
}

const ImportPopup: React.FC<ImportPopupProps> = ({
  isOpen,
  onClose,
  onFileUpload,
  isProcessing = false,
  processingProgress = 0,
  preSelectedPatientId,
  onBack
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // Load patients when popup opens
  useEffect(() => {
    if (isOpen) {
      loadPatients();
      
      // Use preSelectedPatientId prop first, then check sessionStorage as fallback
      if (preSelectedPatientId) {
        setSelectedPatientId(preSelectedPatientId);
      } else {
        // Check for pre-selected patient from sessionStorage (fallback for direct navigation)
        const importPatientId = sessionStorage.getItem('importPatientId');
        if (importPatientId) {
          setSelectedPatientId(importPatientId);
          // Clear the sessionStorage flag
          sessionStorage.removeItem('importPatientId');
        } else {
          // Reset selection if no pre-selected patient
          setSelectedPatientId('');
        }
      }
    }
  }, [isOpen, preSelectedPatientId]);

  const loadPatients = async () => {
    try {
      setLoadingPatients(true);
      const data = await patientService.getPatients();
      setPatients(data);
    } catch (error) {
      console.error('Failed to load patients:', error);
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleFileSelect = (file: File) => {
    // Validate file type
    const validTypes = [
      'audio/wav', 'audio/wave', 'audio/x-wav',
      'audio/mpeg', 'audio/mp3',
      'audio/mp4', 'audio/m4a',
      'audio/ogg', 'audio/webm',
      'audio/flac', 'audio/aac'
    ];
    
    const isValidType = validTypes.includes(file.type) || 
                       file.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i);
    
    // Validate file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (!isValidType) {
      alert('Please select a valid audio file (WAV, MP3, M4A, OGG, WebM, FLAC, or AAC)');
      return;
    }
    
    if (file.size > maxSize) {
      alert('File is too large. Please select a file smaller than 50MB.');
      return;
    }
    
    if (file.size === 0) {
      alert('File is empty. Please select a valid audio file.');
      return;
    }
    
    setSelectedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const truncateFileName = (fileName: string, maxLength: number = 50) => {
    if (fileName.length <= maxLength) return fileName;
    
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3);
    
    return `${truncatedName}...${extension}`;
  };

  const handleProcessFile = () => {
    if (selectedFile && onFileUpload) {
      onFileUpload(selectedFile, selectedPatientId);
      // Clear the file after processing starts
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  const recordingSteps = [
    { number: 1, title: 'Assign Patient', description: 'Select patient' },
    { number: 2, title: 'Import Audio', description: 'Upload file' },
    { number: 3, title: 'Fill Details', description: 'Add metadata' },
    { number: 4, title: 'Save', description: 'Complete' },
  ];

  // Determine processing stage based on progress
  const getProcessingStage = () => {
    if (processingProgress < 30) {
      return 'Uploading and caching audio file...';
    } else if (processingProgress < 100) {
      return 'Processing audio with AI...';
    } else {
      return 'Finalizing...';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 h-auto max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {preSelectedPatientId ? 'Import Audio for Patient' : 'Import Audio File'}
            </h2>
            {preSelectedPatientId && patients.length > 0 && (() => {
              const selectedPatient = patients.find(p => p.id === preSelectedPatientId);
              return selectedPatient ? (
                <p className="text-xs text-gray-600 mt-0.5">
                  {selectedPatient.first_name} {selectedPatient.last_name}
                </p>
              ) : null;
            })()}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isProcessing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Stepper */}
        <div className="flex-shrink-0">
          <ProgressStepper currentStep={2} steps={recordingSteps} />
        </div>

        {/* Content */}
        <div className="overflow-y-auto">
          <div className="px-6 py-4 space-y-2.5">
            {/* Drag and Drop Area */}
            <div
              className={`relative border-2 border-dashed rounded-lg transition-colors ${
                selectedFile ? 'p-4' : 'p-8'
              } ${
                dragActive
                  ? 'border-blue-400 bg-blue-50'
                  : selectedFile
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.webm,.flac,.aac,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/flac,audio/aac"
                onChange={handleFileInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isProcessing}
              />
              
              <div className="text-center">
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileAudio className="w-10 h-10 text-green-600 mx-auto" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-gray-900 break-all" title={selectedFile.name}>
                        {truncateFileName(selectedFile.name, 50)}
                      </p>
                      <p className="text-xs text-gray-600">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearSelectedFile();
                      }}
                      className="text-gray-500 hover:text-gray-700 h-7 text-xs"
                      disabled={isProcessing}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-base font-medium text-gray-900">
                        Drop your audio file here
                      </p>
                      <p className="text-sm text-gray-600">
                        or click to browse
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Supports WAV, MP3, M4A, OGG, WebM, FLAC, and AAC (max 50MB)
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Patient Selection - Show only when no patient is pre-selected */}
            {selectedFile && !isProcessing && !preSelectedPatientId && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  <Users className="w-3.5 h-3.5 inline mr-1" />
                  Associate with Patient (Optional)
                </label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loadingPatients}
                >
                  <option value="">No patient selected</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.first_name} {patient.last_name}
                      {patient.diagnosis && ` - ${patient.diagnosis}`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  You can associate this recording with a patient for better organization
                </p>
              </div>
            )}

            {/* Pre-selected Patient Display - Show when patient is already selected from route */}
            {selectedFile && !isProcessing && preSelectedPatientId && (() => {
              const selectedPatient = patients.find(p => p.id === preSelectedPatientId);
              return selectedPatient ? (
                <div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-blue-900">
                          Recording will be associated with:
                        </p>
                        <p className="text-xs text-blue-700 truncate">
                          {selectedPatient.first_name} {selectedPatient.last_name}
                          {selectedPatient.diagnosis && ` - ${selectedPatient.diagnosis}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Processing Progress */}
            {isProcessing && (
              <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">{getProcessingStage()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${processingProgress}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-600">
                    {processingProgress < 30 ? 'Step 1 of 2: File Upload' : 'Step 2 of 2: AI Processing'}
                  </p>
                  <p className="text-xs font-semibold text-blue-600">
                    {processingProgress}%
                  </p>
                </div>
              </div>
            )}

            {/* Process File Button - shown when file is selected */}
            {selectedFile && !isProcessing && (
              <Button
                onClick={handleProcessFile}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={isProcessing}
                title={`Process "${selectedFile.name}"`}
              >
                <Upload className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="truncate">
                  Process "{truncateFileName(selectedFile.name, 35)}"
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex gap-3">
            <Button
              onClick={onBack || onClose}
              variant="outline"
              className="flex-1"
              disabled={isProcessing}
            >
              ← Back
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="flex-1"
              disabled={isProcessing}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportPopup; 