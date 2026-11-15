import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login, signup, AuthStatus } from '../store/store';
import { normalizeIndianPhone } from '../../lib/phone';

const fieldStyle = {
  width: '100%',
  padding: '0.625rem 0.75rem',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font)',
  fontSize: '0.875rem',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  outline: 'none'
};

const labelStyle = {
  display: 'block',
  marginBottom: '0.375rem',
  fontSize: '0.8125rem',
  color: 'var(--text-2)'
};

const hintStyle = {
  display: 'block',
  marginTop: '0.25rem',
  fontSize: '0.75rem',
  color: 'var(--text-3)'
};

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: '0.875rem' }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint ? <small style={hintStyle}>{hint}</small> : null}
    </label>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    password: '',
    student_id: '',
    department: '',
    academic_year: '2'
  });
  const [validationError, setValidationError] = useState('');
  const dispatch = useDispatch();
  const { status, error } = useSelector(state => state.auth);
  const busy = status === AuthStatus.AUTHENTICATING;
  const isSignup = mode === 'signup';

  const update = (key) => (event) => setForm(current => ({ ...current, [key]: event.target.value }));

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setValidationError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setValidationError('');

    const email = form.email.trim().toLowerCase();
    const phone_number = normalizeIndianPhone(form.phone_number);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setValidationError('Enter a valid email address, for example student@example.com.');
      return;
    }
    if (!phone_number) {
      setValidationError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.');
      return;
    }

    if (isSignup) {
      await dispatch(signup({
        full_name: form.full_name.trim(),
        email,
        phone_number,
        password: form.password,
        student_id: form.student_id.trim() || null,
        department: form.department.trim() || null,
        academic_year: form.academic_year ? Number(form.academic_year) : null
      }));
    } else {
      await dispatch(login({ email, phone_number, password: form.password }));
    }
  };

  const shownError = validationError || error;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)',
      overflow: 'hidden'
    }}>
      {/* Draggable title bar with the custom close button */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.625rem 0.75rem 0.625rem 1rem',
        WebkitAppRegion: 'drag',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 22,
            height: 22,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>C</span>
          <strong style={{ fontSize: '0.875rem', letterSpacing: '0.01em' }}>CampusOS</strong>
        </div>
        <button
          onClick={() => window.close()}
          aria-label="Close window"
          title="Close"
          style={{
            WebkitAppRegion: 'no-drag',
            width: 26,
            height: 26,
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'transparent',
            color: 'var(--text-2)',
            fontSize: '1rem',
            lineHeight: 1,
            cursor: 'pointer'
          }}
          onMouseOver={(e) => { e.currentTarget.style.background = 'var(--danger-bg)'; e.currentTarget.style.color = 'var(--danger)'; }}
          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
        >×</button>
      </header>

      <main style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        alignItems: isSignup ? 'flex-start' : 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '1.25rem' }}>
            {isSignup
              ? 'Set up your CampusOS student account.'
              : 'Sign in to continue to your student workspace.'}
          </p>

          {shownError && (
            <div style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.625rem 0.75rem',
              marginBottom: '1rem',
              color: 'var(--danger)',
              fontSize: '0.8125rem',
              lineHeight: 1.4
            }}>
              {shownError}
            </div>
          )}

          <form onSubmit={submit}>
            {isSignup && (
              <Field label="Full name">
                <input
                  style={fieldStyle}
                  value={form.full_name}
                  onChange={update('full_name')}
                  autoComplete="name"
                  minLength={2}
                  required
                />
              </Field>
            )}

            <Field label="College email">
              <input
                style={fieldStyle}
                type="email"
                value={form.email}
                onChange={update('email')}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                placeholder="student@example.com"
                required
              />
            </Field>

            <Field label="Mobile number" hint="10-digit Indian number. +91 is also accepted.">
              <input
                style={fieldStyle}
                type="tel"
                value={form.phone_number}
                onChange={update('phone_number')}
                autoComplete="tel"
                inputMode="tel"
                maxLength={18}
                placeholder="9876543210"
                required
              />
            </Field>

            <Field
              label="Password"
              hint={isSignup ? 'Use at least 12 characters.' : undefined}
            >
              <input
                style={fieldStyle}
                type="password"
                value={form.password}
                onChange={update('password')}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                minLength={isSignup ? 12 : 1}
                required
              />
            </Field>

            {isSignup && (
              <>
                <Field label="Student ID (optional)">
                  <input style={fieldStyle} value={form.student_id} onChange={update('student_id')} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <Field label="Department">
                    <input
                      style={fieldStyle}
                      value={form.department}
                      onChange={update('department')}
                      placeholder="e.g. CSE"
                    />
                  </Field>
                  <Field label="Academic year">
                    <select style={fieldStyle} value={form.academic_year} onChange={update('academic_year')}>
                      <option value="1">1st year</option>
                      <option value="2">2nd year</option>
                      <option value="3">3rd year</option>
                      <option value="4">4th year</option>
                    </select>
                  </Field>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%',
                marginTop: '0.25rem',
                padding: '0.6875rem 1rem',
                background: busy ? 'var(--surface-3)' : 'var(--accent)',
                color: busy ? 'var(--text-3)' : '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font)',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer'
              }}
              onMouseOver={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent)'; }}
            >
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div style={{
            marginTop: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.375rem',
            fontSize: '0.8125rem',
            color: 'var(--text-3)'
          }}>
            <span>{isSignup ? 'Already registered?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={switchMode}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--accent-text)',
                fontFamily: 'var(--font)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              {isSignup ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
