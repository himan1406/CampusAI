import React, { useState, useEffect } from 'react';
import { login, refreshSession } from '../../features/store/store';
import { useDispatch } from 'react-redux';
import { AuthStatus } from '../../features/store/store';

// Design tokens from the web app
const tokens = {
  font: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  bg: '#f6f7f9',
  surface: '#ffffff',
  border: '#e3e6eb',
  text: '#14181f',
  text2: '#4a5260',
  accent: '#2f54c8',
  accentHover: '#2744a8',
  radius: '8px'
};

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useDispatch();

  useEffect(() => {
    // Check if we already have a token
    const checkToken = async () => {
      const token = window.electron.store.get('accessToken');
      if (token) {
        await dispatch(refreshSession());
        // Render dashboard instead
        // In a real app, we'd switch routes
      }
    };
    checkToken();
  }, [dispatch]);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    dispatch(login(email, password));
    // After dispatch, check state
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: tokens.bg,
      color: tokens.text,
      fontFamily: tokens.font
    }}>
      <div style={{ maxWidth: 360, width: '100%' }}>
        <header style={{
          background: tokens.surface,
          borderRadius: tokens.radius,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: tokens.text,
          fontFamily: tokens.font
        }}>
          <h1 style={{
            fontWeight: 600,
            fontSize: '1.25rem'
          }}>CampusOS</h1>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: tokens.text,
              fontSize: '1.25rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
            onClick={() => window.close()}
            aria-label="Close window"
            title="Close"
          >×</button>
        </header>
        <h2 style={{
          marginBottom: '1rem',
          fontWeight: 600,
          color: tokens.text,
          fontSize: '1.5rem'
        }}>CampusOS</h2>
        
        <p style={{
          marginBottom: '1.5rem',
          color: tokens.text2,
          fontSize: '0.9rem'
        }}>Student workspace</p>
        
        {error && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: tokens.radius,
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            width: '100%',
            color: '#b3261e',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}
        
        <form style={{ width: '100%' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.375rem',
              fontSize: '0.875rem',
              color: tokens.text2
            }}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@student.edu"
              type="email"
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: `1px solid ${tokens.border}`,
                borderRadius: tokens.radius,
                fontFamily: tokens.font,
                fontSize: '0.875rem',
                background: '#fff',
                color: tokens.text
              }}
            />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.375rem',
              fontSize: '0.875rem',
              color: tokens.text2
            }}>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              type="password"
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                border: `1px solid ${tokens.border}`,
                borderRadius: tokens.radius,
                fontFamily: tokens.font,
                fontSize: '0.875rem',
                background: '#fff',
                color: tokens.text
              }}
            />
          </div>
          
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: tokens.accent,
              color: '#fff',
              border: 'none',
              borderRadius: tokens.radius,
              fontFamily: tokens.font,
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: '0.5rem',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = tokens.accentHover}
            onMouseOut={(e) => e.target.style.background = tokens.accent}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        
        <p style={{
          marginTop: '1.5rem',
          marginBottom: '0.5rem',
          color: tokens.text2,
          fontSize: '0.875rem'
        }}>
          Don't have an account? <span style={{ cursor: 'pointer', textDecoration: 'underline' }}>, Sign up</span>
        </p>
      </div>
    </div>
  );
}