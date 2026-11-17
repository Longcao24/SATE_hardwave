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
  /** 'monthly' | 'yearly': the server resolves it by Stripe lookup key (create-checkout-session in the repo). */
  plan?: SatePlan;
  successUrl?: string;
  cancelUrl?: string;
  mode?: 'payment' | 'subscription';
  metadata?: Record<string, string>;
}

// The SATE Plan, billed by Stripe account Auspex Medix LLC (live since 2026-11-17).
// The checkout sends BOTH: the deployed create-checkout-session reads priceId, the repo one reads plan
// (lookup keys sate_plan_monthly / sate_plan_yearly). Both prices write tier_id 'pro' through the webhook,
// which is what the database treats as premium.
export type SatePlan = 'monthly' | 'yearly';
export const SATE_PLAN_PRICE_IDS: Record<SatePlan, string> = {
  monthly: 'price_1Ucrk00fluIK4pHvP6bxqfWK', // $20 / month
  yearly: 'price_1Ucrk00fluIK4pHvXtEC2Bwp',  // $200 / year
};

export interface SubscriptionTier {
  id: string;
  plan?: SatePlan;
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
    plan: 'monthly',
    name: 'Monthly',
    price: 20,
    interval: 'month',
    stripePriceId: SATE_PLAN_PRICE_IDS.monthly,
    features: [
      'Unlimited recordings',
      'Full-length transcription and analysis',
      'Speaker diarization',
      'Export reports',
      'Cancel anytime'
    ]
  },
  {
    id: 'pro_yearly',
    plan: 'yearly',
    name: 'Yearly',
    price: 200,
    interval: 'year',
    stripePriceId: SATE_PLAN_PRICE_IDS.yearly,
    features: [
      'Everything in Monthly',
      'Two months free ($200 instead of $240)',
      'Billed once a year'
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
        plan: params.plan,
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
  // Go to the session's own URL: no publishable key in the build, so the web app can never point at
  // a different Stripe account (or mode) than the server's secret key.
  const session = await createCheckoutSession(params);
  if (!session?.url) {
    throw new Error('Failed to create checkout session');
  }
  window.location.href = session.url;
};

/**
 * Statuses that mean the user still has a Stripe subscription: `past_due` and
 * `trialing` customers keep their plan and must keep the portal button that lets
 * them fix their card. Only `canceled` reads as no subscription.
 */
export const LIVE_SUBSCRIPTION_STATUSES: string[] = ['active', 'trialing', 'past_due'];

export const isLiveSubscriptionStatus = (status: string): boolean =>
  LIVE_SUBSCRIPTION_STATUSES.includes(status);

/**
 * Get current user's subscription
 */
export const getCurrentSubscription = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    // A plan change can briefly leave two live rows (the old one is canceled by
    // the webhook), so take the newest instead of erroring out on multiple rows
    // and reporting a paying customer as free.
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', LIVE_SUBSCRIPTION_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }

    return data?.[0] ?? null;
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
  return subscription !== null && isLiveSubscriptionStatus(subscription.status);
};

/**
 * Change subscription plan (upgrade/downgrade)
 * Automatically cancels the old subscription and creates a new one
 */
export const changeSubscriptionPlan = async (
  newPriceId: string,
  plan?: SatePlan
): Promise<{ sessionId: string; url: string } | null> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated');
    }

    // Get the subscription being replaced
    const currentSub = await getCurrentSubscription();

    // The old subscription is canceled server-side once the new one activates —
    // canceling it here would leave the user with no plan if they abandon
    // checkout. Carry its Stripe id so the webhook cancels exactly this one.
    return await createCheckoutSession({
      priceId: newPriceId,
      plan,
      successUrl: `${window.location.origin}/payment/success?upgraded=true`,
      cancelUrl: `${window.location.origin}/pricing`,
      mode: 'subscription',
      metadata: {
        upgrade_from: currentSub?.tier_id || 'free',
        ...(currentSub?.stripe_subscription_id
          ? { replaces_subscription_id: currentSub.stripe_subscription_id }
          : {})
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

