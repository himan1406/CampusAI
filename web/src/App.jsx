import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, request } from './api/client.js';
import { ATTACH_EXTENSIONS, ATTACH_MAX_MB, ATTACH_MAX_FILES } from './lib/attachments.js';
import { Bot, GraduationCap, Home, Inbox, Link2, LoaderCircle, UserRound } from 'lucide-react';
import AuthScreen from './features/auth/AuthScreen.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Topbar from './components/layout/Topbar.jsx';
import Banner from './components/ui/Banner.jsx';
import DashboardPage from './features/dashboard/DashboardPage.jsx';
import InboxPage from './features/inbox/InboxPage.jsx';
import ConnectionsPage from './features/connections/ConnectionsPage.jsx';
import LmsPage from './features/lms/LmsPage.jsx';
import AssistantPage from './features/assistant/AssistantPage.jsx';
import ProfilePage from './features/profile/ProfilePage.jsx';
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
    <Sidebar nav={nav} page={page} onNavigate={setPageAndClose} mobileNav={mobileNav} onClose={() => setMobileNav(false)} user={user} onLogout={logout}/>
    {mobileNav && <button className="nav-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-panel">
      <Topbar title={nav.find(item => item.id === page)?.label || 'CampusOS'} onOpenNav={() => setMobileNav(true)} user={user}/>
      <div className="content-wrap">
        {error && <Banner onDismiss={() => setError('')}>{error}</Banner>}
        {toast && <Banner tone="toast" onDismiss={() => setToast('')}>{toast}</Banner>}

        {page === 'dashboard' && <DashboardPage
          user={user}
          messages={messages}
          unread={unread}
          accounts={accounts}
          lmsStatus={lmsStatus}
          gmail={gmail}
          outlook={outlook}
          busyProvider={busyProvider}
          onConnectEmail={connectEmail}
          onRefresh={() => { loadAccounts(); loadMessages(); loadLms(); }}
          onNavigate={setPage}
        />}

        {page === 'connections' && <ConnectionsPage
          accounts={accounts}
          syncing={syncing}
          busyProvider={busyProvider}
          onSyncEmail={syncEmail}
          onDisconnectEmail={disconnectEmail}
          onConnectEmail={connectEmail}
        />}

        {page === 'inbox' && <InboxPage
          messages={filteredMessages}
          selectedMessage={selectedMessage}
          onSelectMessage={setSelectedMessage}
          search={inboxSearch}
          onSearchChange={setInboxSearch}
          onRefresh={() => { loadMessages(inboxSearch); loadAccounts(); }}
          onSearch={() => loadMessages(inboxSearch)}
          onNavigate={setPage}
        />}

        {page === 'lms' && <LmsPage
          status={lmsStatus}
          items={lmsItems}
          busy={lmsBusy}
          onConnect={connectLms}
          onSync={syncLms}
          onDisconnect={disconnectLms}
        />}

        {page === 'assistant' && <AssistantPage
          sessions={sessions}
          activeSession={activeSession}
          onOpenSession={openChatSession}
          onNewChat={createChatSession}
          dragging={dragging}
          setDragging={setDragging}
          attachFiles={attachFiles}
          chatMessages={chatMessages}
          chatBusy={chatBusy}
          chatEndRef={chatEndRef}
          onPrompt={setChatInput}
          attachments={attachments}
          onRemoveAttachment={removeAttachment}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSubmit={sendChat}
          attachInputRef={attachInputRef}
          toolActivity={toolActivity}
          chatSources={chatSources}
        />}

        {page === 'profile' && <ProfilePage user={user} onLogout={logout}/>}
      </div>
    </main>
  </div>;
}

export default App;
