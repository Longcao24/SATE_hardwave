import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import { supabase } from '@/lib/supabase';

// Initialize Stripe
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      console.error('Stripe publishable key is missing');
      return null;
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};

// Types for Stripe integration
export interface CreateCheckoutSessionParams {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
  mode?: 'payment' | 'subscription';
  metadata?: Record<string, string>;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  stripePriceId: string;
  features: string[];
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  number: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  subscription_id?: string;
}

// Subscription tiers configuration
export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    stripePriceId: '', // No Stripe price for free tier
    features: [
      'Up to 10 recordings per month',
      'Basic transcription',
      'Standard support'
    ]
  },
  {
    id: 'pro',
    name: 'Professional',
    price: 29,
    interval: 'month',
    stripePriceId: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '',
    features: [
      'Unlimited recordings',
      'Advanced transcription',
      'Speaker diarization',
      'Priority support',
      'Export reports'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 99,
    interval: 'month',
    stripePriceId: import.meta.env.VITE_STRIPE_ENTERPRISE_PRICE_ID || '',
    features: [
      'Everything in Pro',
      'Custom integrations',
      'Dedicated support',
      'Advanced analytics',
      'Team collaboration',
      'SSO & SAML'
    ]
  }
];

/**
 * Create a Stripe checkout session
 */
export const createCheckoutSession = async (
  params: CreateCheckoutSessionParams
): Promise<{ sessionId: string; url: string } | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to create a checkout session');
    }

    // Call Supabase Edge Function to create checkout session
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        priceId: params.priceId,
        successUrl: params.successUrl || `${window.location.origin}/payment/success`,
        cancelUrl: params.cancelUrl || `${window.location.origin}/payment/cancel`,
        mode: params.mode || 'subscription',
        customerId: user.id,
        metadata: params.metadata
      }
    });

    if (error) {
      console.error('Error creating checkout session:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return null;
  }
};

/**
 * Redirect to Stripe Checkout
 */
export const redirectToCheckout = async (
  params: CreateCheckoutSessionParams
): Promise<void> => {
  const stripe = await getStripe();
  if (!stripe) {
    throw new Error('Stripe is not initialized');
  }

  const session = await createCheckoutSession(params);
  if (!session) {
    throw new Error('Failed to create checkout session');
  }

  const { error } = await stripe.redirectToCheckout({
    sessionId: session.sessionId
  });

  if (error) {
    console.error('Error redirecting to checkout:', error);
    throw error;
  }
};

/**
 * Get current user's subscription
 */
export const getCurrentSubscription = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting current subscription:', error);
    return null;
  }
};

/**
 * Create a customer portal session
 */
export const createCustomerPortalSession = async (): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated');
    }

    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: {
        customerId: user.id,
        returnUrl: `${window.location.origin}/settings/billing`
      }
    });

    if (error) {
      console.error('Error creating portal session:', error);
      return null;
    }

    return data.url;
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    return null;
  }
};

/**
 * Cancel subscription
 */
export const cancelSubscription = async (subscriptionId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.functions.invoke('cancel-subscription', {
      body: { subscriptionId }
    });

    if (error) {
      console.error('Error canceling subscription:', error);
      return false;
    }

    return data.success;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return false;
  }
};

/**
 * Get payment history
 */
export const getPaymentHistory = async (): Promise<PaymentIntent[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting payment history:', error);
    return [];
  }
};

/**
 * Get invoice history from Stripe
 */
export const getInvoiceHistory = async (): Promise<Invoice[]> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('No user found when fetching invoices');
      return [];
    }

    console.log('Fetching invoices for user:', user.id);

    // Call Supabase Edge Function to get invoices from Stripe
    const { data, error } = await supabase.functions.invoke('get-invoices', {
      body: { customerId: user.id }
    });

    if (error) {
      console.error('Supabase function error:', error);
      return [];
    }

    console.log('Raw response from edge function:', data);

    if (!data || !data.invoices) {
      console.warn('No invoices in response');
      return [];
    }

    console.log(`Received ${data.invoices.length} invoices`);
    return data.invoices || [];
  } catch (error) {
    console.error('Error getting invoice history:', error);
    return [];
  }
};

/**
 * Download invoice PDF
 */
export const downloadInvoice = async (invoiceUrl: string): Promise<void> => {
  try {
    // Open invoice PDF in new tab
    window.open(invoiceUrl, '_blank');
  } catch (error) {
    console.error('Error downloading invoice:', error);
    throw error;
  }
};

/**
 * Create one-time payment for additional features
 */
export const createOneTimePayment = async (
  amount: number,
  description: string
): Promise<string | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated');
    }

    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        amount,
        currency: 'usd',
        description,
        customerId: user.id
      }
    });

    if (error) {
      console.error('Error creating payment intent:', error);
      return null;
    }

    return data.clientSecret;
  } catch (error) {
    console.error('Error creating one-time payment:', error);
    return null;
  }
};

/**
 * Check if user has active subscription
 */
export const hasActiveSubscription = async (): Promise<boolean> => {
  const subscription = await getCurrentSubscription();
  return subscription !== null && subscription.status === 'active';
};

/**
 * Change subscription plan (upgrade/downgrade)
 * Automatically cancels the old subscription and creates a new one
 */
export const changeSubscriptionPlan = async (
  newPriceId: string
): Promise<{ sessionId: string; url: string } | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated');
    }

    // Get current active subscription
    const currentSub = await getCurrentSubscription();
    
    // If user has an active subscription, cancel it first
    if (currentSub) {
      // Note: The webhook will auto-cancel the old subscription when the new one becomes active
    }

    // Create new checkout session
    return await createCheckoutSession({
      priceId: newPriceId,
      successUrl: `${window.location.origin}/payment/success?upgraded=true`,
      cancelUrl: `${window.location.origin}/pricing`,
      mode: 'subscription',
      metadata: {
        upgrade_from: currentSub?.tier_id || 'free',
      }
    });
  } catch (error) {
    console.error('Error changing subscription plan:', error);
    return null;
  }
};

/**
 * Get subscription tier by ID
 */
export const getSubscriptionTier = (tierId: string): SubscriptionTier | undefined => {
  return SUBSCRIPTION_TIERS.find(tier => tier.id === tierId);
};

