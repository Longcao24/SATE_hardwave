import React from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export const PaymentCancel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <XCircle className="w-20 h-20 text-yellow-500 mx-auto" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Payment Canceled
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your payment was canceled. No charges have been made to your account.
        </p>
        
        <div className="space-y-4">
          <Button
            onClick={() => navigate('/pricing')}
            className="w-full"
          >
            View Plans Again
          </Button>
          
          <Button
            onClick={() => navigate('/dashboard')}
            variant="outline"
            className="w-full"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};




