import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Play, Upload, FileAudio, BarChart3, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';

interface FirstTimeGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onImportAudio: () => void;
  onTrySample: () => void;
}

interface GuideStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
}

const FirstTimeGuide: React.FC<FirstTimeGuideProps> = ({ 
  isOpen, 
  onClose, 
  onImportAudio, 
  onTrySample 
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: GuideStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to SATE',
      description: 'Speech Annotation and Transcription Enhancer',
      icon: <CheckCircle className="w-12 h-12 text-green-500" />,
      content: (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-10 h-10 text-blue-600" />
            </div>
            <p className="text-gray-600 text-lg leading-relaxed">
              SATE helps you analyze speech patterns and improve communication by detecting 
              pauses, fillers, repetitions, and other speech quality metrics.
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">What you can analyze:</h3>
            <div className="grid grid-cols-2 gap-2 text-sm text-blue-700">
              <div>• Pauses & timing</div>
              <div>• Filler words</div>
              <div>• Speech repetitions</div>
              <div>• Pronunciation issues</div>
              <div>• Morphological complexity</div>
              <div>• Speaking pace</div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'import',
      title: 'Import Audio Files',
      description: 'Upload existing audio files for analysis',
      icon: <Upload className="w-12 h-12 text-blue-500" />,
      content: (
        <div>
          <div className="mb-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-10 h-10 text-blue-600" />
            </div>
            <p className="text-gray-600 mb-4">
              Already have audio files? Upload them for instant analysis.
            </p>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900 mb-3">Supported formats:</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="flex items-center text-gray-600">
                  <FileAudio className="w-4 h-4 mr-2" />
                  MP3 files
                </div>
                <div className="flex items-center text-gray-600">
                  <FileAudio className="w-4 h-4 mr-2" />
                  WAV files
                </div>
                <div className="flex items-center text-gray-600">
                  <FileAudio className="w-4 h-4 mr-2" />
                  M4A files
                </div>
                <div className="flex items-center text-gray-600">
                  <FileAudio className="w-4 h-4 mr-2" />
                  WEBM files
                </div>
              </div>
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-sm">
              <strong>Best quality:</strong> Use uncompressed audio files (WAV) for the most 
              accurate analysis results.
            </p>
          </div>
        </div>
      ),
      action: {
        label: 'Import Audio File',
        onClick: () => {
          onClose();
          onImportAudio();
        },
        variant: 'primary'
      }
    },
    {
      id: 'sample',
      title: 'Try Sample Data',
      description: 'Explore SATE with pre-analyzed sample audio',
      icon: <Play className="w-12 h-12 text-purple-500" />,
      content: (
        <div>
          <div className="mb-6">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play className="w-10 h-10 text-purple-600" />
            </div>
            <p className="text-gray-600 mb-4">
              Not ready to upload your own audio? Start with our sample data to explore all features.
            </p>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900 mb-3">Sample includes:</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center">
                  <BarChart3 className="w-4 h-4 text-purple-500 mr-2" />
                  Pre-analyzed speech transcript
                </li>
                <li className="flex items-center">
                  <BarChart3 className="w-4 h-4 text-purple-500 mr-2" />
                  Identified speech errors and patterns
                </li>
                <li className="flex items-center">
                  <BarChart3 className="w-4 h-4 text-purple-500 mr-2" />
                  Interactive playback controls
                </li>
                <li className="flex items-center">
                  <BarChart3 className="w-4 h-4 text-purple-500 mr-2" />
                  Detailed analytics dashboard
                </li>
              </ul>
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-purple-800 text-sm">
              <strong>Perfect for learning:</strong> Use sample data to understand how 
              SATE analyzes speech before working with your own audio.
            </p>
          </div>
        </div>
      ),
      action: {
        label: 'Load Sample Data',
        onClick: () => {
          onClose();
          onTrySample();
        },
        variant: 'primary'
      }
    },
    {
      id: 'features',
      title: 'Key Features',
      description: 'Discover what makes SATE powerful',
      icon: <BarChart3 className="w-12 h-12 text-green-500" />,
      content: (
        <div>
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-10 h-10 text-green-600" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <Play className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Interactive Playback</h3>
                  <p className="text-sm text-gray-600">Click on any word to jump to that moment in the audio</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <BarChart3 className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Real-time Analysis</h3>
                  <p className="text-sm text-gray-600">See live statistics as you edit transcripts</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircle className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Clinical Assessment Tools</h3>
                  <p className="text-sm text-gray-600">Filter by specific error types for targeted SLP evaluation</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">User-Friendly Interface</h3>
                  <p className="text-sm text-gray-600">Intuitive design for easy navigation and analysis</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'get-started',
      title: "You're Ready!",
      description: 'Choose how you want to get started',
      icon: <CheckCircle className="w-12 h-12 text-green-500" />,
      content: (
        <div className="text-center">
          <div className="mb-6">
            <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600 text-lg mb-6">
              You're all set! Choose your preferred way to start analyzing speech:
            </p>
          </div>
          <div className="grid gap-3">
            <Button
              onClick={() => {
                onClose();
                onImportAudio();
              }}
              variant="outline"
              className="w-full h-16 border-2 hover:bg-gray-50 flex items-center justify-center gap-3 text-lg"
            >
              <Upload className="w-6 h-6 text-gray-600" />
              Import Audio File
            </Button>
            <Button
              onClick={() => {
                onClose();
                onTrySample();
              }}
              variant="outline"
              className="w-full h-16 border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 flex items-center justify-center gap-3 text-lg"
            >
              <Play className="w-6 h-6" />
              Try Sample Data
            </Button>
          </div>
        </div>
      )
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  const currentStepData = steps[currentStep];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{currentStepData.title}</h2>
            <p className="text-gray-600 mt-1">{currentStepData.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(((currentStep + 1) / steps.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[60vh]">
          {currentStepData.content}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div>
            {currentStep > 0 && (
              <Button
                onClick={prevStep}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Step Action Button (if available) */}
            {currentStepData.action && (
              <Button
                onClick={currentStepData.action.onClick}
                className={
                  currentStepData.action.variant === 'secondary' 
                    ? "bg-gray-600 hover:bg-gray-700 text-white" 
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }
              >
                {currentStepData.action.label}
              </Button>
            )}

            {/* Next/Finish Button */}
            {currentStep < steps.length - 1 ? (
              <Button
                onClick={nextStep}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={onClose}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Get Started!
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstTimeGuide; 