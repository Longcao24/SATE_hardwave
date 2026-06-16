import React, { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useStripe } from '@/contexts/StripeProvider';

export const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const { refreshSubscription } = useStripe();

  useEffect(() => {
    // Refresh subscription data after successful payment
    refreshSubscription();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Payment Successful!
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Your subscription has been activated. You now have access to all premium features.
        </p>
        
        <div className="space-y-4">
          <Button
            onClick={() => navigate('/dashboard')}
            className="w-full"
          >
            Go to Dashboard
          </Button>
          
          <Button
            onClick={() => navigate('/settings/billing')}
            variant="outline"
            className="w-full"
          >
            View Billing Details
          </Button>
        </div>
      </div>
    </div>
  );
};




