import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import '../Auth.scss';
import logoMain from '../../../assets/logo-main.svg';

export default function CreateAccount() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      return setError('Username is required');
    }

    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }

    setLoading(true);
    try {
      const lowerUsername = username.toLowerCase().trim();
      
      // Check if username already exists
      const usernameDocRef = doc(db, 'usernames', lowerUsername);
      const usernameDoc = await getDoc(usernameDocRef);
      if (usernameDoc.exists()) {
        throw new Error('Username is already taken');
      }

      // Create the user in Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update Auth Profile
      await updateProfile(userCredential.user, {
        displayName: username.trim()
      });

      // Save mapping in Firestore
      await setDoc(usernameDocRef, {
        email: email,
        createdAt: new Date().toISOString()
      });

      navigate('/sync');
    } catch (err: any) {
      setError(err.message || 'Failed to create an account');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-container">
      <div className="logo-layout" style={{ marginBottom: '2rem' }}>
        <img src={logoMain} alt="HertzSonic Logo" className="brand-logo" />
      </div>
      <h2 className="auth-title">Create Account</h2>
      {error && <div className="auth-error" style={{ color: 'red', marginBottom: '1rem', fontSize: '14px' }}>{error}</div>}
      <form className="auth-form" onSubmit={handleCreateAccount}>
        <input 
          type="text" 
          className="auth-input" 
          placeholder="Username" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required 
        />
        <input 
          type="email" 
          className="auth-input" 
          placeholder="Email Address"  
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
        <input 
          type="password" 
          className="auth-input" 
          placeholder="Confirm Password" 
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required 
        />
        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? 'Creating...' : 'Sign Up'}
        </button>
      </form>
      <div className="auth-links">
        <span>
          Already have an account? <Link to="/auth/login" className="auth-link-primary">Log In</Link>
        </span>
      </div>
    </div>
  );
}
