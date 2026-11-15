import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LmsPage from './LmsPage.jsx';
import {
  ArrowRight, Bell, BookOpen, Bot, CalendarDays, Check, ChevronDown, CircleHelp, Home,
  ExternalLink, GraduationCap, Inbox, Link2, LoaderCircle, LogOut, Mail,
  Menu, MessageSquare, Plus, RefreshCw, Search, Send, Settings, ShieldCheck,
  Paperclip, FileText, UserRound, X
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

async function request(path, options = {}, token = null) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiError = payload.error;
    const fieldMessage = apiError?.fieldErrors ? Object.values(apiError.fieldErrors).flat().find(Boolean) : null;
    const message = typeof apiError === 'string' ? apiError : apiError?.message || fieldMessage || apiError?.formErrors?.[0] || `Request failed (${response.status})`;
    const error = new Error(message); error.status = response.status; throw error;
  }
  return payload;
}

const ATTACH_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'csv'];
const ATTACH_MAX_MB = 12;
const ATTACH_MAX_FILES = 3;

function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(localNumber) ? `+91${localNumber}` : '';
}

function AuthScreen({ onAuthenticated }) {
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
function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [syncing, setSyncing] = useState('');
  const [busyProvider, setBusyProvider] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [toolActivity, setToolActivity] = useState([]);
  const [chatSources, setChatSources] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [lmsStatus, setLmsStatus] = useState(null);
  const [lmsItems, setLmsItems] = useState([]);
  const [lmsBusy, setLmsBusy] = useState('');
  const chatEndRef = useRef(null);
  const attachInputRef = useRef(null);
  const sessionIdRef = useRef(null);

  const api = useCallback(async (path, options = {}) => {
    try {
      return await request(path, options, token);
    } catch (error) {
      if (error.status !== 401 || path.startsWith('/auth/')) throw error;
      const refreshed = await request('/auth/refresh', { method: 'POST' });
      setToken(refreshed.access_token);
      return request(path, options, refreshed.access_token);
    }
  }, [token]);

  const loadAccounts = useCallback(async () => {
    const data = await api('/email/accounts');
    setAccounts(data.accounts || []);
  }, [api]);
  const loadMessages = useCallback(async (query = '') => {
    const suffix = query ? `&q=${encodeURIComponent(query)}` : '';
    const data = await api(`/email/messages?limit=75${suffix}`);
    setMessages(data.messages || []);
  }, [api]);
  const loadLms = useCallback(async () => {
    const [status, data] = await Promise.all([
      api('/lms/status'),
      api('/lms/items?limit=400&type=all')
    ]);
    setLmsStatus(status);
    setLmsItems(data.items || []);
  }, [api]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await request('/auth/refresh', { method: 'POST' });
        if (!alive) return;
        setToken(data.access_token);
        const profile = await request('/auth/me', {}, data.access_token);
        if (alive) setUser(profile.user);
      } catch {
        if (alive) { setToken(null); setUser(null); }
      } finally {
        if (alive) setAuthLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([loadAccounts(), loadMessages()]).then(results => {
      const failed = results.find(result => result.status === 'rejected');
      if (failed) setError(failed.reason.message);
    });
    loadChatSessions();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadLms().catch(err => setError(err.message));
  }, [token, loadLms]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('email_connection');
    const provider = params.get('provider');
    if (status) {
      setToast(status === 'connected' ? `${provider || 'Email'} connected successfully.` : `Email connection: ${status.replaceAll('_', ' ')}.`);
      window.history.replaceState({}, document.title, window.location.pathname);
      if (token) { loadAccounts().catch(() => {}); loadMessages().catch(() => {}); }
    }
  }, [token, loadAccounts, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatBusy]);

  async function loadChatSessions() {
    try {
      const data = await api('/chat/sessions');
      setSessions(data.sessions || []);
      if (data.sessions?.length) await openChatSession(data.sessions[0].id);
      else await createChatSession();
    } catch (err) { setError(err.message); }
  }
  async function createChatSession() {
    const data = await api('/chat/sessions', { method: 'POST', body: JSON.stringify({ mode: 'global', platform: null, title: 'Campus AI conversation' }) });
    setSessions(current => [data.session, ...current]);
    sessionIdRef.current = data.session.id;
    setActiveSession(data.session);
    setChatMessages([]); setToolActivity([]); setChatSources([]); setAttachments([]);
  }
  async function openChatSession(id) {
    const data = await api(`/chat/sessions/${id}`);
    sessionIdRef.current = id;
    setActiveSession(data.session);
    setChatMessages(data.messages || []); setToolActivity([]); setChatSources([]); setAttachments([]);
    loadAttachments(id);
  }
  async function loadAttachments(sessionId) {
    try {
      const data = await api(`/chat/sessions/${sessionId}/attachments`);
      if (sessionIdRef.current !== sessionId) return;
      setAttachments((data.attachments || []).map(item => ({ ...item, status: 'ready' })));
    } catch { if (sessionIdRef.current === sessionId) setAttachments([]); }
  }
  async function attachFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || !activeSession || chatBusy) return;
    setError('');
    const sessionId = activeSession.id;
    const batch = [];
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ATTACH_EXTENSIONS.includes(ext)) { setError(`${file.name}: only PDF, DOCX, PPTX, TXT, MD and CSV files can be attached.`); continue; }
      if (file.size > ATTACH_MAX_MB * 1024 * 1024) { setError(`${file.name} is larger than ${ATTACH_MAX_MB} MB.`); continue; }
      if (batch.length < ATTACH_MAX_FILES) batch.push(file);
      else setError(`Up to ${ATTACH_MAX_FILES} files can be attached at a time.`);
    }
    if (!batch.length) return;
    const pending = batch.map((file, index) => ({ id: `pending-${Date.now()}-${index}`, name: file.name, status: 'uploading' }));
    const pendingIds = new Set(pending.map(item => item.id));
    setAttachments(current => [...current, ...pending]);
    try {
      const form = new FormData();
      batch.forEach(file => form.append('files', file));
      const data = await api(`/chat/sessions/${sessionId}/attachments`, { method: 'POST', body: form });
      if (sessionIdRef.current !== sessionId) return;
      setAttachments((data.attachments || []).map(item => ({ ...item, status: 'ready' })));
      const failed = (data.results || []).filter(item => !item.ok);
      if (failed.length) setError(failed.map(item => `${item.name}: ${item.error}`).join(' '));
      else if (data.warnings?.length) setToast(data.warnings[0]);
    } catch (err) {
      if (sessionIdRef.current === sessionId) setAttachments(current => current.filter(item => !pendingIds.has(item.id)));
      setError(err.message);
    }
  }
  async function removeAttachment(id) {
    if (!activeSession) return;
    const previous = attachments;
    setAttachments(current => current.filter(item => item.id !== id));
    try { await api(`/chat/sessions/${activeSession.id}/attachments/${id}`, { method: 'DELETE' }); }
    catch (err) { setAttachments(previous); setError(err.message); }
  }
  async function sendChat(event) {
    event?.preventDefault();
    const text = chatInput.trim();
    if (!text || !activeSession || chatBusy || attachments.some(item => item.status === 'uploading')) return;
    setChatInput(''); setChatBusy(true); setError(''); setToolActivity([]); setChatSources([]);
    setChatMessages(current => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    try {
      const chatBody = JSON.stringify({ session_id: activeSession.id, message: text });
      let activeToken = token;
      let response = await fetch(`${API}/chat/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` }, body: chatBody
      });
      if (response.status === 401) {
        const refreshed = await request('/auth/refresh', { method: 'POST' });
        activeToken = refreshed.access_token; setToken(activeToken);
        response = await fetch(`${API}/chat/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` }, body: chatBody
        });
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error?.message || payload.error || `Chat failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = ''; let answer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const block of events) {
          const eventName = block.split('\n').find(line => line.startsWith('event:'))?.slice(6).trim();
          const dataLine = block.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim();
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine);
          if (eventName === 'tool.start') {
            setToolActivity(current => [...current, { name: payload.name, label: payload.label, status: 'running' }]);
          }
          if (eventName === 'tool.done') {
            setToolActivity(current => current.map((item, index) => index === current.length - 1 && item.name === payload.name ? { ...item, status: payload.ok ? 'done' : 'error', count: payload.count } : item));
          }
          if (eventName === 'message.sources') setChatSources(payload.sources || []);
          if (eventName === 'message.delta') {
            answer += payload.text || '';
            setChatMessages(current => {
              const next = [...current]; next[next.length - 1] = { role: 'assistant', content: answer }; return next;
            });
          }
          if (eventName === 'message.error') throw new Error(payload.error || 'AI request failed');
        }
      }
      const data = await api('/chat/sessions');
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err.message);
      setChatMessages(current => current[current.length - 1]?.content ? current : current.slice(0, -1));
    } finally { setChatBusy(false); }
  }

  async function connectEmail(provider) {
    setBusyProvider(provider); setError('');
    try {
      const data = await api(`/email/connect/${provider}?client=web`);
      window.location.assign(data.authorization_url);
    } catch (err) { setError(err.message); setBusyProvider(''); }
  }
  async function syncEmail(provider) {
    setSyncing(provider); setError('');
    try {
      const data = await api(`/email/sync/${provider}`, { method: 'POST', body: JSON.stringify({ limit: 50 }) });
      setToast(`${provider === 'gmail' ? 'Gmail' : 'Outlook'}: ${data.synced} messages synchronized; ${data.indexed_documents || 0} indexed for Campus AI.${data.warnings?.length ? ` ${data.warnings[0]}` : ''}`);
      await loadMessages(inboxSearch);
      await loadAccounts();
    } catch (err) { setError(err.message); }
    finally { setSyncing(''); }
  }
  async function disconnectEmail(provider) {
    if (!window.confirm(`Disconnect ${provider} and delete its locally synchronized email cache?`)) return;
    try {
      await api(`/email/accounts/${provider}`, { method: 'DELETE' });
      await loadAccounts(); await loadMessages(); setSelectedMessage(null);
      setToast(`${provider} disconnected and local email cache deleted.`);
    } catch (err) { setError(err.message); }
  }
  async function connectLms(username, password) {
    setLmsBusy('connect'); setError('');
    try {
      const result = await api('/lms/connect', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      await loadLms();
      setToast(`Connected to ${result.site_name || 'BennettTech iLearn'} as ${result.fullname || 'your student account'}.`);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLmsBusy('');
    }
  }
  async function syncLms() {
    setLmsBusy('sync'); setError('');
    try {
      const result = await api('/lms/sync', { method: 'POST', body: JSON.stringify({}) });
      await loadLms();
      const base = `iLearn sync complete: ${result.courses_synced} courses, ${result.calendar_synced ?? 'no'} calendar events, and ${result.documents_indexed || 0} course documents indexed.`;
      setToast(result.warnings?.length ? `${base} Note: ${result.warnings[0]}` : base);
    } catch (err) {
      setError(err.message);
      if (err.status === 401) await loadLms();
    } finally {
      setLmsBusy('');
    }
  }
  async function disconnectLms() {
    if (!window.confirm('Disconnect iLearn and delete the encrypted Moodle token and synchronized courses/calendar?')) return;
    try {
      await api('/lms/disconnect', { method: 'DELETE' });
      setLmsStatus({ connected: false, account: null });
      setLmsItems([]);
      setToast('iLearn disconnected and local courses/calendar deleted.');
    } catch (err) { setError(err.message); }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    setToken(null); setUser(null); setAccounts([]); setMessages([]); setLmsStatus(null); setLmsItems([]); setSessions([]); setActiveSession(null); setAttachments([]); setChatMessages([]); setToolActivity([]); setChatSources([]);
  }
  function setPageAndClose(next) { setPage(next); setMobileNav(false); setError(''); }

  const gmail = accounts.find(account => account.provider === 'gmail');
  const outlook = accounts.find(account => account.provider === 'outlook');
  const unread = messages.filter(message => !message.is_read).length;
  const filteredMessages = useMemo(() => messages.filter(message => {
    if (!inboxSearch) return true;
    const q = inboxSearch.toLowerCase();
    return [message.subject, message.from_email, message.from_name, message.snippet].some(value => String(value || '').toLowerCase().includes(q));
  }), [messages, inboxSearch]);

  if (authLoading) return <div className="loading-screen"><LoaderCircle className="spin"/> Restoring your CampusOS session…</div>;
  if (!token || !user) return <AuthScreen onAuthenticated={(nextToken, nextUser) => { setToken(nextToken); setUser(nextUser); }}/ >;

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'inbox', label: 'Unified inbox', icon: Inbox, count: unread || null },
    { id: 'lms', label: 'iLearn LMS', icon: GraduationCap },
    { id: 'assistant', label: 'Campus AI', icon: Bot },
    { id: 'connections', label: 'Connections', icon: Link2 },
    { id: 'profile', label: 'Profile', icon: UserRound }
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><GraduationCap size={22}/></div><div><strong>CampusOS</strong><span>Student workspace</span></div><button className="close-nav" onClick={() => setMobileNav(false)}><X size={18}/></button></div>
      
      <nav>{nav.map(item => <button key={item.id} className={`nav-link ${page === item.id ? 'active' : ''}`} onClick={() => setPageAndClose(item.id)}><item.icon size={18}/><span>{item.label}</span>{item.count ? <small>{item.count}</small> : null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="avatar">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div><div className="user-mini"><strong>{user.full_name}</strong><span>{user.email}</span></div><button title="Sign out" onClick={logout}><LogOut size={17}/></button></div>
    </aside>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-panel">
      <header className="topbar"><button className="menu-toggle" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="top-title">{nav.find(item => item.id === page)?.label || 'CampusOS'}</div><div className="top-right"><span className="connected-pill"><i/> CampusOS account active</span><button className="icon-btn" title="Help"><CircleHelp size={18}/></button><div className="avatar small">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div></div></header>
      <div className="content-wrap">
        {error && <div className="error-banner page-error">{error}<button onClick={() => setError('')}><X size={14}/></button></div>}
        {toast && <div className="toast-banner"><Check size={16}/>{toast}<button onClick={() => setToast('')}><X size={14}/></button></div>}

        {page === 'dashboard' && <>
          <section className="page-heading"><div><h1>Welcome back, {user.full_name?.split(' ')[0] || 'student'}</h1><p>A summary of your connected email and iLearn accounts.</p></div><button className="secondary-btn" onClick={() => { loadAccounts(); loadMessages(); loadLms(); }}><RefreshCw size={16}/> Refresh overview</button></section>
          <section className="stats-grid">
            <div className="stat-card"><div className="stat-icon blue"><Mail size={19}/></div><span>Synced emails</span><strong>{messages.length}</strong><small>Across connected inboxes</small></div>
            <div className="stat-card"><div className="stat-icon amber"><Bell size={19}/></div><span>Unread emails</span><strong>{unread}</strong><small>In the local inbox cache</small></div>
            <div className="stat-card"><div className="stat-icon green"><Link2 size={19}/></div><span>Connected email accounts</span><strong>{accounts.length}/2</strong><small>Gmail and Outlook</small></div>
            <div className="stat-card"><div className="stat-icon blue"><GraduationCap size={19}/></div><span>iLearn course pages</span><strong>{lmsStatus?.account?.course_count || 0}</strong><small>{lmsStatus?.connected ? 'Connected LMS account' : 'iLearn not connected'}</small></div>
          </section>
          <section className="dashboard-grid">
            <div className="panel-card"><div className="panel-head"><div><h2>Connect your email</h2><p>Bring your college and personal email into one inbox.</p></div><Mail size={20}/></div>
              <div className="provider-row"><div className="provider-logo gmail-logo">G</div><div className="provider-copy"><strong>Gmail</strong><span>{gmail?.email_address || 'Not connected'}</span></div>{gmail ? <span className="status-chip ok">Connected</span> : <button className="small-primary" onClick={() => connectEmail('gmail')} disabled={!!busyProvider}>{busyProvider === 'gmail' ? 'Opening…' : 'Connect'}</button>}</div>
              <div className="provider-row"><div className="provider-logo outlook-logo">O</div><div className="provider-copy"><strong>Outlook</strong><span>{outlook?.email_address || 'Not connected'}</span></div>{outlook ? <span className="status-chip ok">Connected</span> : <button className="small-primary" onClick={() => connectEmail('outlook')} disabled={!!busyProvider}>{busyProvider === 'outlook' ? 'Opening…' : 'Connect'}</button>}</div>
              <button className="text-link" onClick={() => setPage('connections')}>Manage connected accounts <ArrowRight size={14}/></button>
            </div>
            <div className="panel-card ai-card"><div className="ai-symbol"><MessageSquare size={20}/></div><h2>Meet Campus AI</h2><p>Ask about your courses, course materials, calendar and synchronized inboxes in one conversation.</p><button className="primary-btn" onClick={() => setPage('assistant')}>Open Campus AI <ArrowRight size={16}/></button></div>
          </section>
          <section className="panel-card next-panel"><div><h2>Connect BennettTech iLearn</h2><p>Bring your enrolled courses and iLearn calendar events into CampusOS.</p></div><button className="primary-btn" onClick={() => setPage('lms')}>Open iLearn integration <ArrowRight size={16}/></button></section>
        </>}

        {page === 'connections' && <>
          <section className="page-heading"><div><h1>Accounts and connections</h1><p>Authorize CampusOS to read selected email data. You can disconnect at any time.</p></div></section>
          <div className="connection-grid">
            {[{ provider: 'gmail', name: 'Gmail', description: 'Read inbox messages through the Gmail API.', logo: 'G' }, { provider: 'outlook', name: 'Outlook', description: 'Read inbox messages through Microsoft Graph.', logo: 'O' }].map(item => {
              const account = accounts.find(value => value.provider === item.provider);
              return <div className="connection-card" key={item.provider}><div className={`provider-logo large ${item.provider}-logo`}>{item.logo}</div><h2>{item.name}</h2><p>{item.description}</p>{account ? <><span className={`status-chip ${account.status === 'connected' ? 'ok' : 'warning'}`}>{account.status.replace('_', ' ')}</span><div className="account-email">{account.email_address}</div><div className="connection-meta">Last sync: {account.last_sync_at ? new Date(account.last_sync_at).toLocaleString() : 'Not synchronized yet'}</div><div className="button-row"><button className="secondary-btn" onClick={() => syncEmail(item.provider)} disabled={!!syncing}>{syncing === item.provider ? <LoaderCircle className="spin" size={15}/> : <RefreshCw size={15}/>} Sync inbox</button><button className="danger-text" onClick={() => disconnectEmail(item.provider)}>Disconnect</button></div></> : <><span className="status-chip">Not connected</span><button className="primary-btn full" onClick={() => connectEmail(item.provider)} disabled={!!busyProvider}>{busyProvider === item.provider ? 'Opening provider…' : `Connect ${item.name}`} <ExternalLink size={15}/></button></>}</div>;
            })}
          </div>
          <div className="notice-card"><ShieldCheck size={19}/><div><strong>Permission and privacy</strong><p>CampusOS requests read-only email access. OAuth tokens and synchronized message content are encrypted at rest. Disconnecting deletes the locally synchronized messages and stored token. Provider-side permissions may need to be revoked separately in Google or Microsoft account settings.</p></div></div>
        </>}

        {page === 'inbox' && <>
          <section className="page-heading"><div><h1>Unified inbox</h1><p>Messages synchronized from the email accounts you've connected.</p></div><button className="secondary-btn" onClick={() => { loadMessages(inboxSearch); loadAccounts(); }}><RefreshCw size={16}/> Refresh</button></section>
          <div className="inbox-toolbar"><div className="search-box"><Search size={17}/><input value={inboxSearch} onChange={e => setInboxSearch(e.target.value)} placeholder="Search synchronized messages"/><button onClick={() => loadMessages(inboxSearch)}><ArrowRight size={15}/></button></div><span>{filteredMessages.length} messages cached</span></div>
          <div className="inbox-layout"><div className="message-list">{filteredMessages.length ? filteredMessages.map(message => <button className={`message-item ${selectedMessage?.id === message.id ? 'selected' : ''}`} key={message.id} onClick={() => setSelectedMessage(message)}><div className="message-item-top"><span className={`provider-tag ${message.provider}`}>{message.provider}</span><time>{message.received_at ? new Date(message.received_at).toLocaleDateString() : ''}</time></div><strong>{message.subject || '(no subject)'}</strong><span>{message.from_name || message.from_email || 'Unknown sender'}</span><p>{message.snippet || ''}</p></button>) : <div className="empty-state"><Inbox size={27}/><strong>No synchronized emails</strong><p>Connect Gmail or Outlook, then synchronize your inbox.</p><button className="text-link" onClick={() => setPage('connections')}>Connect an account <ArrowRight size={14}/></button></div>}</div>
            <div className="message-detail">{selectedMessage ? <><div className="detail-top"><span className={`provider-tag ${selectedMessage.provider}`}>{selectedMessage.provider}</span><time>{selectedMessage.received_at ? new Date(selectedMessage.received_at).toLocaleString() : ''}</time></div><h2>{selectedMessage.subject || '(no subject)'}</h2><div className="sender-line"><strong>{selectedMessage.from_name || selectedMessage.from_email}</strong><span>{selectedMessage.from_email}</span></div><div className="detail-body">{selectedMessage.body_text || selectedMessage.snippet || 'No readable body was returned by the provider.'}</div>{selectedMessage.web_url && <a className="text-link" href={selectedMessage.web_url} target="_blank" rel="noreferrer">Open in original mailbox <ExternalLink size={14}/></a>}</> : <div className="empty-detail"><Mail size={28}/><strong>Select a message</strong><span>Choose an email to read its synchronized content.</span></div>}</div></div>
        </>}

        {page === 'lms' && <LmsPage
          status={lmsStatus}
          items={lmsItems}
          busy={lmsBusy}
          onConnect={connectLms}
          onSync={syncLms}
          onDisconnect={disconnectLms}
        />}

        {page === 'assistant' && <>
          <section className="page-heading"><div><h1>Campus AI</h1><p>Your assistant can search your courses, course materials, calendar and synchronized inboxes using context-aware tools.</p></div><button className="secondary-btn" onClick={createChatSession}><Plus size={16}/> New chat</button></section>
          <div className="assistant-layout"><aside className="chat-history"><div className="history-title">Recent chats</div>{sessions.map(session => <button key={session.id} className={activeSession?.id === session.id ? 'active' : ''} onClick={() => openChatSession(session.id)}>{session.title || 'Conversation'}</button>)}</aside><section className={`chat-panel ${dragging ? 'drag-over' : ''}`} onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); attachFiles(e.dataTransfer.files); }}><div className="chat-messages">{chatMessages.length ? chatMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.created_at || index}-${index}`}><div className="chat-avatar">{message.role === 'assistant' ? <Bot size={16}/> : <UserRound size={16}/>}</div><div><strong>{message.role === 'assistant' ? 'Campus AI' : 'You'}</strong><p>{message.content || (chatBusy && index === chatMessages.length - 1 ? 'Thinking…' : '')}</p></div></div>) : <div className="chat-welcome"><div className="ai-symbol"><MessageSquare size={20}/></div><h2>How can I help today?</h2><p>Ask about your iLearn courses, study materials, calendar and synchronized inboxes, or attach a PDF, Word or PowerPoint file with the paperclip. Campus AI selects the relevant tools for each question.</p><div className="prompt-chips"><button onClick={() => setChatInput('Help me plan my study week.')}>Plan my study week</button><button onClick={() => setChatInput('Explain how to prepare for semester exams.')}>Prepare for exams</button><button onClick={() => setChatInput('Help me prioritize my assignments.')}>Prioritize assignments</button></div></div>}<div ref={chatEndRef}/></div>{attachments.length > 0 && <div className="attachment-list">{attachments.map(item => <div className={`attachment-chip ${item.status}`} key={item.id} title={item.name}><FileText size={14}/><span>{item.name}</span>{item.status === 'uploading' ? <LoaderCircle className="spin" size={13}/> : <button type="button" onClick={() => removeAttachment(item.id)} aria-label={`Remove ${item.name}`}><X size={13}/></button>}</div>)}</div>}<form className="chat-composer" onSubmit={sendChat}><button type="button" className="attach-btn" onClick={() => attachInputRef.current?.click()} disabled={chatBusy || !activeSession} title="Attach PDF, Word, PowerPoint or text files" aria-label="Attach documents"><Paperclip size={17}/></button><input ref={attachInputRef} type="file" multiple hidden accept=".pdf,.docx,.pptx,.txt,.md,.csv" onChange={e => { attachFiles(e.target.files); e.target.value = ''; }}/><input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Message Campus AI…"/><button disabled={chatBusy || !chatInput.trim()}>{chatBusy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}</button></form><div className="chat-runtime">{toolActivity.length > 0 && <div className="tool-activity"><strong>AI activity</strong>{toolActivity.map((item, index) => <div key={`${item.name}-${index}`}><span className={item.status === 'running' ? 'tool-pulse' : item.status === 'error' ? 'tool-error' : 'tool-check'}>{item.status === 'running' ? <LoaderCircle className="spin" size={13}/> : item.status === 'error' ? <X size={13}/> : <Check size={13}/>}</span>{item.label}{item.status === 'running' ? '…' : item.count != null ? ` · ${item.count} results` : ''}</div>)}</div>}{chatSources.length > 0 && <div className="chat-sources"><strong>Sources used</strong><div>{chatSources.map((source, index) => source.url ? <a key={`${source.type}-${source.id || index}`} href={source.url} target="_blank" rel="noreferrer">{source.label} <ExternalLink size={11}/></a> : <span key={`${source.type}-${source.id || index}`}>{source.label}</span>)}</div></div>}</div><div className="chat-disclaimer">Campus AI may make mistakes. It only uses data synchronized to your CampusOS account and documents attached to this chat; email attachments are not indexed.</div></section></div>
        </>}

        {page === 'profile' && <>
          <section className="page-heading"><div><h1>Student profile</h1><p>Manage your CampusOS identity and session.</p></div></section>
          <div className="profile-card"><div className="profile-avatar">{user.full_name?.slice(0, 1)?.toUpperCase() || 'S'}</div><h2>{user.full_name}</h2><p>{user.email}</p><div className="profile-details"><div><span>Mobile number</span><strong>{user.phone_number || 'Not added'}</strong></div><div><span>Student ID</span><strong>{user.student_id || 'Not added'}</strong></div><div><span>Department</span><strong>{user.department || 'Not added'}</strong></div><div><span>Academic year</span><strong>{user.academic_year || 'Not added'}</strong></div></div><button className="danger-btn" onClick={logout}><LogOut size={16}/> Sign out</button></div>
        </>}
      </div>
    </main>
  </div>;
}

export default App;