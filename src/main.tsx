import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from '@/contexts/AuthProvider'
import { StripeProvider } from '@/contexts/StripeProvider'
import { DeviceProvider } from '@/contexts/DeviceProvider'
import { AccessibilityProvider } from '@/contexts/AccessibilityProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/react-query'
import { PostHogProvider, PostHogErrorBoundary } from 'posthog-js/react'
import { ErrorFallback } from '@/components/Common/ErrorFallback'

const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider 
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY} 
          options={posthogOptions}
        >
          <PostHogErrorBoundary fallback={ErrorFallback}>
            <AccessibilityProvider>
              <AuthProvider>
                <StripeProvider>
                  <DeviceProvider>
                    <App />
                  </DeviceProvider>
                </StripeProvider>
              </AuthProvider>
            </AccessibilityProvider>
          </PostHogErrorBoundary>
        </PostHogProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
