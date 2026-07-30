import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import '../Auth.scss';
import logoMain from '../../../assets/logo-main.svg';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Check your inbox for password reset instructions.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-container">
      <div className="logo-layout" style={{ marginBottom: '2rem' }}>
        <img src={logoMain} alt="HertzSonic Logo" className="brand-logo" />
      </div>
      <h2 className="auth-title">Reset Password</h2>
      {error && <div className="auth-error" style={{ color: 'red', marginBottom: '1rem', fontSize: '14px' }}>{error}</div>}
      {message && <div className="auth-success" style={{ color: '#4ade80', marginBottom: '1rem', fontSize: '14px' }}>{message}</div>}
      <p className="description" style={{ marginBottom: '1.5rem', color: 'var(--color-secondary-text)' }}>
        Enter your email address and we'll send you a link to reset your password.
      </p>
      <form className="auth-form" onSubmit={handleReset}>
        <input 
          type="email" 
          className="auth-input" 
          placeholder="Email Address" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required 
        />
        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/auth/login">Back to Log In</Link>
      </div>
    </div>
  );
}
