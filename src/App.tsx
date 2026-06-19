import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthProvider';
import './App.css';

// Import components
import { MainApp } from './components/MainApp';
import LoginPage from './components/Auth/LoginPage';
import ResetPasswordPage from './components/Auth/ResetPasswordPage';
import PatientList from './components/CRM/PatientList';
import PatientForm from './components/CRM/PatientForm';
import PatientDetails from './components/CRM/PatientDetails';
import InactivePatientsPage from './components/CRM/InactivePatientsPage';
import { PricingPage } from './components/Stripe/PricingPage';
import { BillingPage } from './components/Stripe/BillingPage';
import { PaymentSuccess } from './components/Stripe/PaymentSuccess';
import { PaymentCancel } from './components/Stripe/PaymentCancel';
import { UserProfilePage } from './components/Profile/UserProfilePage';
import InviteCodesPage from './components/Profile/InviteCodesPage';
import { DevicePage } from './components/Device/DevicePage';
import { AdminPage } from './components/Admin/AdminPage';

// Protected Route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-lightest">
        <p className="text-sm text-neutral-darker">Checking authentication…</p>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page but save the attempted location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Main App component with routing
function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        }
      />
      
      {/* Patient management routes */}
      <Route
        path="/patients"
        element={
          <ProtectedRoute>
            <PatientList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients/new"
        element={
          <ProtectedRoute>
            <PatientForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients/:id"
        element={
          <ProtectedRoute>
            <PatientDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients/:id/edit"
        element={
          <ProtectedRoute>
            <PatientForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patients/inactive"
        element={
          <ProtectedRoute>
            <InactivePatientsPage />
          </ProtectedRoute>
        }
      />
      
      {/* Report route */}
      <Route
        path="/report/:id"
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        }
      />

      {/* Sample data route */}
      <Route
        path="/sample"
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        }
      />
      
      {/* Devices Route */}
      <Route
        path="/devices"
        element={
          <ProtectedRoute>
            <DevicePage />
          </ProtectedRoute>
        }
      />
      
      {/* Admin Route (system-wide; page self-guards to admins) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      {/* User Profile Route */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />
      
      {/* Invite Codes Route */}
      <Route
        path="/invite-codes"
        element={
          <ProtectedRoute>
            <InviteCodesPage />
          </ProtectedRoute>
        }
      />
      
      {/* Stripe payment routes */}
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/settings/billing"
        element={
          <ProtectedRoute>
            <BillingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment/success"
        element={
          <ProtectedRoute>
            <PaymentSuccess />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payment/cancel"
        element={
          <ProtectedRoute>
            <PaymentCancel />
          </ProtectedRoute>
        }
      />
      
      {/* Redirect any unknown routes to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;