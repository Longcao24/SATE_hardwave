import React, { useState, useEffect } from 'react';
import { CreditCard, Calendar, AlertCircle, ExternalLink, Loader2, ArrowLeft, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStripe } from '@/contexts/StripeProvider';
import { useNavigate } from 'react-router-dom';
import {
  createCustomerPortalSession,
  getInvoiceHistory,
  downloadInvoice,
  type Invoice
} from '@/services/stripeService';

export const BillingPage: React.FC = () => {
  const { subscription, currentTier, isLoading } = useStripe();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  useEffect(() => {
    loadInvoiceHistory();
  }, []);

  const loadInvoiceHistory = async () => {
    setLoadingInvoices(true);
    try {
      console.log('Fetching invoice history...');
      const history = await getInvoiceHistory();
      console.log('Invoice history received:', history);
      setInvoices(history);
    } catch (error) {
      console.error('Error loading invoice history:', error);
      // Show error to user
      alert('Failed to load invoice history. Please refresh the page.');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    if (!invoice.invoice_pdf && !invoice.hosted_invoice_url) {
      alert('Invoice PDF is not available for this invoice.');
      return;
    }

    setDownloadingInvoice(invoice.id);
    try {
      const url = invoice.invoice_pdf || invoice.hosted_invoice_url;
      if (url) {
        await downloadInvoice(url);
      }
    } catch (error) {
      console.error('Error downloading invoice:', error);
      alert('Failed to download invoice. Please try again.');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handleManageSubscription = async () => {
    setLoadingPortal(true);
    try {
      const portalUrl = await createCustomerPortalSession();
      if (portalUrl) {
        window.location.href = portalUrl;
      } else {
        alert('Failed to open customer portal. Please try again.');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      alert('Failed to open customer portal. Please try again.');
    } finally {
      setLoadingPortal(false);
    }
  };

  const formatDate = (dateString: string | number) => {
    const date = typeof dateString === 'number' ? new Date(dateString * 1000) : new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getNextBillingDate = () => {
    // Calculate 1 month from today
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);
    
    return nextMonth.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(amount / 100);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'open':
        return 'bg-blue-100 text-blue-800';
      case 'void':
        return 'bg-gray-100 text-gray-800';
      case 'uncollectible':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
          
          <a href="/">
            <img src="/LOGO.png" alt="SATE" className="h-24" />
          </a>
          <div className="w-32" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Page Title */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Billing & Subscription
          </h2>
          <p className="text-gray-600">
            Manage your subscription and view payment history
          </p>
        </div>

        {/* Current Subscription Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-8 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center mb-6">
                <div className="p-2 bg-blue-100 rounded-lg mr-3">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">
                  Current Plan
                </h3>
              </div>

              {subscription ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl font-bold text-gray-900 mb-1">
                      {currentTier?.name}
                    </p>
                    <p className="text-lg text-gray-600">
                      ${currentTier?.price}/{currentTier?.interval}
                    </p>
                  </div>

                  <div className="flex items-center text-gray-600">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span className="text-sm">
                      Next billing date: <span className="font-medium text-gray-900">{getNextBillingDate()}</span>
                    </span>
                  </div>

                  <div>
                    <span
                      className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${
                        subscription.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : subscription.status === 'past_due'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {subscription.status === 'active' && 'Active'}
                      {subscription.status === 'past_due' && 'Past Due'}
                      {subscription.status === 'canceled' && 'Canceled'}
                      {subscription.status === 'trialing' && 'Trial'}
                    </span>
                  </div>

                  {subscription.cancel_at_period_end && (
                    <div className="flex items-start bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-yellow-900">
                          Subscription will be canceled
                        </p>
                        <p className="text-sm text-yellow-800 mt-1">
                          Your subscription will end on {getNextBillingDate()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center mb-4">
                    {/* <Sparkles className="w-5 h-5 text-gray-600 mr-2" /> */}
                    <p className="text-xl font-semibold text-gray-900">
                      Free Plan
                    </p>
                  </div>
                  <p className="text-gray-600 mb-6">
                    You're currently on the free plan. Upgrade to unlock advanced features and unlimited recordings!
                  </p>
                  <Button
                    onClick={() => navigate('/pricing')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    View Plans
                  </Button>
                </div>
              )}
            </div>

            {subscription && (
              <Button
                onClick={handleManageSubscription}
                disabled={loadingPortal}
                className="ml-6 bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50"
              >
                {loadingPortal ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Invoice History */}
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <div className="flex items-center mb-6">
            <div className="p-2 bg-blue-100 rounded-lg mr-3">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">
              Invoice History
            </h3>
          </div>

          {loadingInvoices ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-lg">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">
                No invoices available yet
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Invoices will appear here once you have an active subscription
              </p>
            </div>
          ) : (
            <div className="overflow-hidden border border-gray-200 rounded-lg">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                      Invoice
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                      Date
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                      Amount
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-4 px-6 text-sm text-gray-900 font-medium">
                        {invoice.number || 'Draft'}
                      </td>
                      <td className="py-4 px-6 text-sm text-gray-900">
                        {formatDate(invoice.created)}
                      </td>
                      <td className="py-4 px-6 text-sm font-semibold text-gray-900">
                        {formatAmount(invoice.amount_paid, invoice.currency)}
                      </td>
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(invoice.status)}`}
                        >
                          {invoice.status}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <Button
                          onClick={() => handleDownloadInvoice(invoice)}
                          disabled={(!invoice.invoice_pdf && !invoice.hosted_invoice_url) || downloadingInvoice === invoice.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4"
                          size="sm"
                        >
                          {downloadingInvoice === invoice.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 mr-2" />
                              Download
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

