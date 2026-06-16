import React from 'react';
import { Check } from 'lucide-react';

interface Step {
  number: number;
  title: string;
  description: string;
}

interface ProgressStepperProps {
  currentStep: number;
  steps: Step[];
}

export const ProgressStepper: React.FC<ProgressStepperProps> = ({ currentStep, steps }) => {
  return (
    <div className="w-full py-3 px-6 bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto">
        {/* Steps */}
        <div className="flex items-start justify-between relative">
          {/* Background Progress Line (Gray) */}
          <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200" style={{ zIndex: 0 }} />
          
          {/* Progress Line (Green for completed steps) */}
          {currentStep > 1 && (
            <div 
              className="absolute top-3 left-0 h-0.5 bg-green-500 transition-all duration-500 ease-out" 
              style={{ 
                width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
                zIndex: 0 
              }} 
            />
          )}

          {steps.map((step) => {
            const isCompleted = currentStep > step.number;
            const isCurrent = currentStep === step.number;

            return (
              <div key={step.number} className="flex flex-col items-center flex-1 relative" style={{ zIndex: 1 }}>
                {/* Step Circle */}
                <div className="relative mb-1.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs transition-all duration-300 border-2 ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white shadow-sm'
                        : isCurrent
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200'
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : (
                      <span className="font-semibold">{step.number}</span>
                    )}
                  </div>
                </div>

                {/* Step Label */}
                <div className="text-center px-1">
                  <p
                    className={`text-xs font-semibold transition-colors duration-300 leading-tight ${
                      isCurrent
                        ? 'text-blue-700'
                        : isCompleted
                        ? 'text-green-700'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p
                    className={`text-xs mt-0.5 transition-colors duration-300 leading-tight ${
                      isCurrent
                        ? 'text-blue-600'
                        : isCompleted
                        ? 'text-green-600'
                        : 'text-gray-400'
                    }`}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

