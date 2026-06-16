import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '@/contexts/AuthProvider';
import { validateInviteCode } from '@/services/inviteCodeService';
import { supabase } from '@/lib/supabase';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  confirmPassword: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const LoginPage: React.FC = () => {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Invite code validation state
  const [inviteCodeStep, setInviteCodeStep] = useState(true); // Start with invite code step
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [validatedInviteCode, setValidatedInviteCode] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState('');
  
  // Forgot password state
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');
  
  // Determine if we're on signup route
  const isSignUpMode = location.pathname === '/signup';
  
  // Get the redirect location from state or default to home
  const from = location.state?.from?.pathname || '/';
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  // Handle invite code validation (Step 1)
  const handleInviteCodeValidation = async () => {
    if (!inviteCodeInput || inviteCodeInput.trim().length === 0) {
      setCodeError('Please enter an invite code');
      return;
    }

    setValidatingCode(true);
    setCodeError('');

    try {
      const result = await validateInviteCode(inviteCodeInput.trim());
      
      if (result.valid) {
        setValidatedInviteCode(inviteCodeInput.trim().toUpperCase());
        setInviteCodeStep(false); // Move to signup form
        setCodeError('');
      } else {
        setCodeError(result.error || 'Invalid invite code');
      }
    } catch (error: any) {
      setCodeError('Error validating invite code. Please try again.');
    } finally {
      setValidatingCode(false);
    }
  };

  // Handle forgot password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail || resetEmail.trim().length === 0) {
      setResetError('Please enter your email address');
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      setResetError('Please enter a valid email address');
      return;
    }

    setResetLoading(true);
    setResetError('');

    try {
      // Use Supabase's reset password method
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setResetError(error.message);
      } else {
        setResetSuccess(true);
      }
    } catch (error: any) {
      setResetError('An error occurred. Please try again.');
      console.error('Reset password error:', error);
    } finally {
      setResetLoading(false);
    }
  };

  // Handle account creation (Step 2)
  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    setAuthError('');
    setSuccessMessage('');
    if (isSignUpMode && data.password !== data.confirmPassword) {
        setIsLoading(false);
      setAuthError('Passwords do not match');
      return;
    }
    try {
      if (isSignUpMode) {
        // Use the validated invite code
        if (!validatedInviteCode) {
          setAuthError('Invite code validation error. Please refresh and try again.');
          setIsLoading(false);
          return;
        }
        await signUp(data.email, data.password, validatedInviteCode);
        setSuccessMessage('Account created! Please check your email to confirm your account.');
        // Navigate to login page after successful signup
        setTimeout(() => navigate('/login'), 1500);
    } else {
        await signIn(data.email, data.password);
        // Navigation will happen automatically via useEffect when user state updates
      }
    } catch (error: any) {
      const message =
        error?.message === 'Invalid login credentials'
          ? 'Incorrect email or password'
          : error?.message || 'Authentication failed';
      setAuthError(message);
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

        {/* Auth Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Forgot Password Form */}
          {showForgotPassword && !isSignUpMode ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Reset Password
                </h2>
                <p className="text-sm text-gray-600">
                  Enter your email address and we'll send you a link to reset your password
                </p>
              </div>

              {!resetSuccess ? (
                <form onSubmit={handleForgotPassword} className="space-y-6">
                  <div>
                    <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="resetEmail"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => {
                          setResetEmail(e.target.value);
                          setResetError('');
                        }}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter your email"
                        disabled={resetLoading}
                      />
                    </div>
                    {resetError && (
                      <p className="text-xs text-red-600 mt-2">{resetError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resetLoading ? (
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Sending reset link...
                      </div>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                      setResetError('');
                    }}
                    className="w-full text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Back to sign in
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                    <p className="text-sm text-green-800 font-medium mb-2">
                      Password reset email sent!
                    </p>
                    <p className="text-xs text-green-700">
                      Check your email inbox for a link to reset your password.
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetSuccess(false);
                      setResetEmail('');
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    Back to Sign In
                  </Button>
                </div>
              )}
            </div>
          ) : isSignUpMode && inviteCodeStep ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                  Enter Invite Code
                </h2>
                <p className="text-sm text-gray-600">
                  You need an invite code from an existing user to create an account
                </p>
              </div>

              <div>
                <label htmlFor="inviteCodeInput" className="block text-sm font-medium text-gray-700 mb-2">
                  Invite Code <span className="text-red-500">*</span>
                </label>
                <input
                  id="inviteCodeInput"
                  type="text"
                  value={inviteCodeInput}
                  onChange={(e) => {
                    setInviteCodeInput(e.target.value.toUpperCase());
                    setCodeError('');
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInviteCodeValidation();
                    }
                  }}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 uppercase text-center text-lg font-mono tracking-widest"
                  placeholder="XXXXXXXX"
                  disabled={validatingCode}
                  maxLength={8}
                  style={{ textTransform: 'uppercase' }}
                />
                {codeError && (
                  <p className="text-xs text-red-600 mt-2 text-center">{codeError}</p>
                )}
              </div>

              <Button
                type="button"
                onClick={handleInviteCodeValidation}
                disabled={validatingCode || !inviteCodeInput}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md font-medium transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {validatingCode ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Validating code...
                  </div>
                ) : (
                  <div className="flex items-center justify-center">
                    Continue
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </div>
                )}
              </Button>

              <div className="text-center">
                <p className="text-sm text-gray-600">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="text-blue-600 hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              </div>

              {/* Waitlist Section */}
              <div className="pt-6 border-t border-gray-200">
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-600">Don't have an invite code?</p>
                  <a
                    href="https://docs.google.com/forms/d/e/1FAIpQLScRXmrO3hMTha_gd0bqkzWIg71wGEVEuBQj9QafqYTpLeOV5g/viewform"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors duration-200"
                  >
                    Join Waitlist
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">
                  {isSignUpMode ? 'Create Account' : 'Sign In'}
                </h2>
                {isSignUpMode && validatedInviteCode && (
                  <div className="mt-3 inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm text-green-700">
                      Invite code <strong className="font-mono">{validatedInviteCode}</strong> verified
                    </span>
                  </div>
                )}
              </div>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  {...register('email')}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter email"
                  disabled={isLoading}
                />
              </div>
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter password"
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
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
              
              {/* Forgot Password Link - Login Only */}
              {!isSignUpMode && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>

            {/* Confirm Password Field - Sign Up Only */}
            {isSignUpMode && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    {...register('confirmPassword')}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirm password"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            {/* Success & Error Messages */}
            {successMessage && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <p className="text-sm text-green-700">{successMessage}</p>
              </div>
            )}
            {authError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <p className="text-sm text-red-600">{authError}</p>
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
                  {isSignUpMode ? 'Creating account...' : 'Signing in...'}
                </div>
              ) : isSignUpMode ? (
                'Sign Up'
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Toggle */}
          <div className="mt-4">
            {isSignUpMode && validatedInviteCode && (
              <button
                type="button"
                onClick={() => {
                  setInviteCodeStep(true);
                  setValidatedInviteCode(null);
                  setInviteCodeInput('');
                }}
                className="text-sm text-gray-600 hover:text-gray-900 mb-2 block text-center w-full"
              >
                ← Change invite code
              </button>
            )}
            <p className="text-sm text-gray-600 text-center">
              {isSignUpMode ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => navigate(isSignUpMode ? '/login' : '/signup')}
                className="text-blue-600 hover:underline"
              >
                {isSignUpMode ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </div>
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

export default LoginPage; 