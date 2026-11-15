import React, { useState } from 'react';
import { ArrowRight, GraduationCap, LoaderCircle, ShieldCheck } from 'lucide-react';
import { request } from '../../api/client.js';
import { normalizeIndianPhone } from '../../lib/phone.js';

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ full_name: '', email: '', phone_number: '', password: '', student_id: '', department: '', academic_year: '2' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setError('');

    const email = form.email.trim().toLowerCase();
    const phone_number = normalizeIndianPhone(form.phone_number);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address, for example student@example.com.');
      return;
    }
    if (!phone_number) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.');
      return;
    }

    setBusy(true);
    try {
      const signup = mode === 'signup';
      const payload = signup ? {
        ...form,
        email,
        phone_number,
        academic_year: form.academic_year ? Number(form.academic_year) : null
      } : { email, phone_number, password: form.password };
      const data = await request(`/auth/${signup ? 'signup' : 'login'}`, {
        method: 'POST', body: JSON.stringify(payload)
      });
      onAuthenticated(data.access_token, data.user, data.refresh_token || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-screen">
    <div className="auth-brand"><div className="brand-icon"><GraduationCap size={25}/></div><span>CampusOS</span></div>
    <div className="auth-card">
      
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="muted">{mode === 'login' ? 'Sign in to continue to your student workspace.' : 'Set up your CampusOS student account.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label>Full name<input value={form.full_name} onChange={e => update('full_name', e.target.value)} autoComplete="name" required minLength={2}/></label>}
        <label>College email<input type="email" value={form.email} onChange={e => update('email', e.target.value)} autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={254} placeholder="student@example.com" required/></label>
        <label>Mobile number<input type="tel" value={form.phone_number} onChange={e => update('phone_number', e.target.value)} autoComplete="tel" inputMode="tel" maxLength={18} placeholder="9876543210 or +91 9876543210" required/><small>Enter a 10-digit Indian mobile number. +91 is also accepted.</small></label>
        <label>Password<input type="password" value={form.password} onChange={e => update('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 12 : 1} required/><small>{mode === 'signup' ? 'Use at least 12 characters.' : 'Your CampusOS password is separate from your college portal passwords.'}</small></label>
        {mode === 'signup' && <>
          <label>Student ID <span className="optional">Optional</span><input value={form.student_id} onChange={e => update('student_id', e.target.value)} /></label>
          <div className="form-grid">
            <label>Department<input value={form.department} onChange={e => update('department', e.target.value)} placeholder="e.g. CSE"/></label>
            <label>Academic year<select value={form.academic_year} onChange={e => update('academic_year', e.target.value)}><option value="1">1st year</option><option value="2">2nd year</option><option value="3">3rd year</option><option value="4">4th year</option></select></label>
          </div>
        </>}
        {error && <div className="error-banner">{error}</div>}
        <button className="primary-btn full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight size={17}/></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? "Don't have an account?" : 'Already registered?'} <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></div>
      <div className="auth-security"><ShieldCheck size={15}/> Your college email and password are not used as your CampusOS login password.</div>
    </div>
    <div className="auth-footer">CampusOS · Student workspace · Development build</div>
  </div>;
}
