import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import '../Auth.scss';
import LogoMain from '../../../assets/logo-main.svg?react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromSettings = location.state?.from === 'settings';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let loginEmail = identifier.trim();

      // If it doesn't contain an @, assume it's a username and fetch the email from Firestore
      if (!loginEmail.includes('@')) {
        const lowerUsername = loginEmail.toLowerCase();
        const usernameDocRef = doc(db, 'usernames', lowerUsername);
        const usernameDoc = await getDoc(usernameDocRef);
        
        if (usernameDoc.exists()) {
          loginEmail = usernameDoc.data().email;
        } else {
          throw new Error('Username not found');
        }
      }

      await signInWithEmailAndPassword(auth, loginEmail, password);
      localStorage.setItem('hertzsonic_setup_complete', 'true');
      
      if (fromSettings) {
        navigate('/dashboard', { state: { ...location.state, activeView: 'settings' } });
      } else {
        navigate('/sync');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-container">
      <div className="logo-layout" style={{ marginBottom: '2rem' }}>
        <LogoMain className="brand-logo" />
      </div>
      <h2 className="auth-title">Welcome Back</h2>
      {error && <div className="auth-error" style={{ color: 'red', marginBottom: '1rem', fontSize: '14px' }}>{error}</div>}
      <form className="auth-form" onSubmit={handleLogin}>
        <input 
          type="text" 
          className="auth-input" 
          placeholder="Username or Email" 
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required 
        />
        <input 
          type="password" 
          className="auth-input" 
          placeholder="Password" 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required 
        />
        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? 'Logging In...' : 'Log In'}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/auth/forgot-password">Forgot Password?</Link>
        <span>
          Don't have an account? <Link to="/auth/create-account" className="auth-link-primary">Sign up</Link>
        </span>
        
        <div className="auth-divider">
          <span>or</span>
        </div>
        
        {fromSettings ? (
          <button 
            type="button"
            onClick={() => navigate('/dashboard', { state: { ...location.state, activeView: 'settings' } })} 
            className="auth-cancel-btn"
          >
            Cancel
          </button>
        ) : (
          <Link to="/sync" className="auth-skip-link">Skip for now</Link>
        )}
      </div>
    </div>
  );
}
