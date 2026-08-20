import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Mail, Lock, User, CheckCircle, AlertCircle, ArrowLeft, Sun, Moon, Loader2, Eye, EyeOff } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: () => void;
  setView: (view: 'login' | 'register' | 'forgot-password' | 'dashboard' | 'reset-password') => void;
  currentView: 'login' | 'register' | 'forgot-password';
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess, setView, currentView, theme, onToggleTheme }) => {
  // Common states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Register states
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState<string[]>(Array(8).fill(''));
  const [timer, setTimer] = useState(0);
  const [sentEmailAddress, setSentEmailAddress] = useState(''); // Tracks the email OTP was sent to

  // Visibility states
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Reset visibility states on view changes
  useEffect(() => {
    setShowLoginPassword(false);
    setShowRegisterPassword(false);
    setShowConfirmPassword(false);
  }, [currentView]);

  // Refs for OTP input fields to handle auto-focus shifting
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Count down timer for resending OTP
  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  // Reset verification state if the user edits the email they verified
  useEffect(() => {
    if (otpSent && email !== sentEmailAddress) {
      setOtpSent(false);
      setOtpCode(Array(8).fill(''));
      setSuccessMsg('');
    }
  }, [email, otpSent, sentEmailAddress]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      onAuthSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Send OTP
  const handleSendOTP = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setErrorMsg('All fields (Name, Email, Password, Confirm Password) are compulsory.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Check if the user already exists in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (profile) {
        throw new Error('This email is already registered. Please log in.');
      }

      // 2. Call signUp (sends Signup OTP code using Confirm sign up template)
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password, // Use actual password entered by the user
        options: {
          data: {
            full_name: fullName,
          }
        }
      });

      if (error) throw error;

      setOtpSent(true);
      setSentEmailAddress(email);
      setTimer(60); // 1-minute countdown
      setSuccessMsg('OTP code sent to your email. Please check your inbox.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP digit changes
  const handleOtpChange = (value: string, index: number) => {
    const cleanValue = value.replace(/[^0-9]/g, '');
    const newOtp = [...otpCode];
    newOtp[index] = cleanValue.substring(cleanValue.length - 1); // Get last digit
    setOtpCode(newOtp);

    // Auto-focus next input
    if (cleanValue && index < 7) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  // Handle OTP verification
  const handleVerifyOTP = async () => {
    const codeString = otpCode.join('');
    if (codeString.length < 8) {
      setErrorMsg('Please enter all 8 digits of the OTP.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: sentEmailAddress.trim().toLowerCase(),
        token: codeString,
        type: 'signup', // uses confirm signup OTP verification flow
      });

      if (error) throw error;

      // Upsert profile fallback details
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: fullName,
          email: email.trim().toLowerCase(),
        });
      }

      setSuccessMsg('Registration completed successfully!');
      setTimeout(() => {
        onAuthSuccess();
      }, 500);
    } catch (err: any) {
      setErrorMsg(err.message || 'OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Password Reset Request (Forgot Password)
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Please enter your email.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Verify if user email exists in database (profiles table)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (!profile) {
        throw new Error('This email is not verified and no user exists with this email id, please enter valid email id.');
      }

      // 2. Send Reset Link (Redirect to our SPA reset route)
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/#/reset-password`,
      });

      if (error) throw error;
      setSuccessMsg('Password reset link sent to your email. Please check your inbox.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-container">
      {/* Floating Theme Toggler */}
      <button 
        type="button"
        className="back-btn auth-theme-toggler" 
        onClick={onToggleTheme} 
        title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      {/* Visual Landing Page Panel (Desktop Only) */}
      <div className="auth-banner-side">
        <div className="auth-banner-content">
          <div className="auth-banner-logo">Eventra</div>
          <h1 className="auth-banner-title">Calculate event costs & incomes with precision</h1>
          <p className="auth-banner-desc">
            Organize funds, manage members, log expense updates dynamically, and analyze budgets inside a premium workspace designed for committees and planners.
          </p>

          {/* Premium Interactive Mockup Card */}
          <div className="mock-event-card">
            <div className="mock-card-header">
              <div>
                <span className="mock-tag">Live Preview</span>
                <h3>Tech Summit 2026</h3>
              </div>
              <span className="mock-status">Active</span>
            </div>
            
            <div className="mock-stats-row">
              <div className="mock-stat">
                <span>Total Fund</span>
                <span className="val success">₹25,430.00</span>
              </div>
              <div className="mock-stat">
                <span>Expenses</span>
                <span className="val danger">₹14,210.00</span>
              </div>
              <div className="mock-stat">
                <span>Available</span>
                <span className="val primary">₹11,220.00</span>
              </div>
            </div>

            <div className="mock-recent-activities">
              <div className="mock-activity">
                <span className="activity-label">Grand Hall Catering (Updated)</span>
                <span className="activity-amount danger">-₹3,400.00</span>
              </div>
              <div className="mock-activity">
                <span className="activity-label">Ticket Registration (Income)</span>
                <span className="activity-amount success">+₹5,800.00</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth Interaction Panel */}
      <div className="auth-form-side">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 className="auth-title">
              {currentView === 'login' && 'Welcome Back'}
              {currentView === 'register' && 'Create Account'}
              {currentView === 'forgot-password' && 'Reset Password'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {currentView === 'login' && 'Enter your credentials to manage your events'}
              {currentView === 'register' && 'Verify your email to get started'}
              {currentView === 'forgot-password' && 'Enter your email for the recovery link'}
            </p>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form Content */}
          {currentView === 'login' && (
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    className="form-input"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Password</label>
                  <button type="button" onClick={() => setView('forgot-password')} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    Forgot Password?
                  </button>
                </div>
                <div className="input-wrapper" style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? 'Logging in...' : 'Log In'}
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Don't have an account?{' '}
                <button type="button" onClick={() => setView('register')} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
                  Register
                </button>
              </p>
            </form>
          )}

          {currentView === 'register' && (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (!otpSent) {
                  handleSendOTP();
                } else {
                  handleVerifyOTP();
                }
              }} 
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              {/* Full Name - Hide during OTP Verification step */}
              {!otpSent && (
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <div className="input-wrapper">
                    <User size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: '2.75rem' }}
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Email Address - Always visible (resets OTP state if changed) */}
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="auth-email-row">
                  <div className="input-wrapper">
                    <Mail size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                    <input
                      type="email"
                      className="form-input"
                      style={{ paddingLeft: '2.75rem' }}
                      placeholder="name@domain.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (otpSent) {
                          setOtpSent(false);
                          setTimer(0);
                        }
                      }}
                      required
                    />
                  </div>
                  {!otpSent && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSendOTP}
                      disabled={loading || !email || !fullName || !password || !confirmPassword || timer > 0}
                      style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="spinner" size={16} />
                          <span>Sending...</span>
                        </>
                      ) : (
                        'Send OTP'
                      )}
                    </button>
                  )}
                  {otpSent && timer > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled
                      style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                    >
                      Resend in {timer}s
                    </button>
                  )}
                  {otpSent && timer === 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSendOTP}
                      disabled={loading}
                      style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="spinner" size={16} />
                          <span>Sending...</span>
                        </>
                      ) : (
                        'Resend OTP'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 8-Digit OTP entering boxes - Only visible when otpSent is true */}
              {otpSent && (
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem', wordBreak: 'break-all' }}>
                    <span>Enter 8-Digit OTP Code</span>
                    <span style={{ color: 'var(--color-primary)' }}>Sent to {sentEmailAddress}</span>
                  </label>
                  <div className="otp-container">
                    {otpCode.map((digit, i) => (
                      <input
                        key={i}
                        type="text"
                        maxLength={1}
                        className="otp-box"
                        value={digit}
                        onChange={(e) => handleOtpChange(e.target.value, i)}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        required
                      />
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || otpCode.some(d => d === '')}
                    style={{ width: '100%', fontSize: '0.95rem', padding: '0.85rem' }}
                  >
                    {loading ? 'Registering...' : 'Verify OTP & Register'}
                  </button>
                </div>
              )}

              {/* Password & Confirm Password - Hide during OTP Verification step */}
              {!otpSent && (
                <>
                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <div className="input-wrapper" style={{ position: 'relative' }}>
                      <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                      <input
                        type={showRegisterPassword ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                        placeholder="Min 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        style={{
                          position: 'absolute',
                          right: '1rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confirm Password</label>
                    <div className="input-wrapper" style={{ position: 'relative' }}>
                      <Lock size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="form-input"
                        style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                        placeholder="Repeat password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{
                          position: 'absolute',
                          right: '1rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    disabled={loading}
                  >
                    Send OTP
                  </button>
                </>
              )}

              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Already have an account?{' '}
                <button type="button" onClick={() => setView('login')} style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
                  Log In
                </button>
              </p>
            </form>
          )}

          {currentView === 'forgot-password' && (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={18} style={{ position: 'absolute', left: '1rem', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    className="form-input"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
                {loading ? 'Checking Database...' : 'Send Recovery Link'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setView('login')}
                style={{ width: '100%', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center' }}
              >
                <ArrowLeft size={16} /> Back to Login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
