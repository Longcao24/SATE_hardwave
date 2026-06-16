import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { supabase } from '@/lib/supabase';

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState(false);

  useEffect(() => {
    // Handle the recovery token from the URL hash
    const handleRecoveryToken = async () => {
      try {
        // Check if we have hash parameters (Supabase sends tokens in URL hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');
        
        console.log('Reset password page loaded');
        console.log('Hash params:', { accessToken: accessToken ? 'present' : 'none', type });
        
        // If we have a recovery token in the URL
        if (accessToken && type === 'recovery') {
          console.log('Recovery token found in URL');
          setValidSession(true);
          setError('');
          return;
        }
        
        // Otherwise check if we have a valid session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setError('Failed to verify reset link. Please try again.');
          return;
        }

        if (session) {
          console.log('Valid session found');
          setValidSession(true);
        } else {
          // If no session, the link might be invalid or expired
          console.log('No valid session found');
          setError('Invalid or expired password reset link. Please request a new one.');
        }
      } catch (err) {
        console.error('Error checking recovery session:', err);
        setError('An error occurred. Please request a new password reset link.');
      }
    };

    handleRecoveryToken();

    // Listen for auth state changes (in case token is being processed)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, _session) => {
      console.log('Auth state change:', event);
      if (event === 'PASSWORD_RECOVERY') {
        console.log('Password recovery event detected');
        setValidSession(true);
        setError('');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setError(error.message);
        console.error('Password update error:', error);
      } else {
        setSuccess(true);
        // Sign out the recovery session and redirect to login
        await supabase.auth.signOut();
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    } catch (error: any) {
      setError('An error occurred while resetting your password. Please try again.');
      console.error('Reset password exception:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-72 h-48 mb-1">
            <img 
              src="/LOGO.png" 
              alt="SATE Logo" 
              className="w-72 h-48 object-contain"
            />
          </div>
          <p className="text-gray-600">Speech Annotation and Transcription Enhancer</p>
        </div>

        {/* Reset Password Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {success ? (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                <h2 className="text-xl font-semibold text-green-900 mb-2">
                  Password Reset Successful!
                </h2>
                <p className="text-sm text-green-700 mb-4">
                  Your password has been successfully reset.
                </p>
                <p className="text-xs text-green-600">
                  Redirecting to login page...
                </p>
              </div>

              <Button
                onClick={() => navigate('/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                Go to Sign In
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
                Reset Your Password
              </h2>
              <p className="text-sm text-gray-600 mb-6 text-center">
                Enter your new password below
              </p>

              {!validSession ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-sm text-red-600 text-center mb-4">{error}</p>
                  <Button
                    onClick={() => navigate('/login')}
                    variant="outline"
                    className="w-full"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-6">
                  {/* New Password Field */}
                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="newPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          setError('');
                        }}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter new password"
                        disabled={isLoading}
                      />
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-gray-400 hover:text-gray-600 focus:outline-none"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Must be at least 6 characters long
                    </p>
                  </div>

                  {/* Confirm Password Field */}
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setError('');
                        }}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Confirm new password"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-md p-3">
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Resetting password...
                      </div>
                    ) : (
                      'Reset Password'
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">Copyright © 2025 SATE. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

