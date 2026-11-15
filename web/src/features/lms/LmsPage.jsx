import React, { useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, GraduationCap, LockKeyhole, RefreshCw,
  ShieldCheck, Unplug, KeyRound
} from 'lucide-react';
import StatCard from '../../components/ui/StatCard.jsx';
import CourseList from './CourseList.jsx';
import CalendarView from './CalendarView.jsx';
import { dateKey, eventDate } from './lms-utils.js';

export default function LmsPage({ status, items = [], busy, onConnect, onSync, onDisconnect }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [tab, setTab] = useState('courses');
  const [courseSearch, setCourseSearch] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));

  const connected = Boolean(status?.connected);
  const account = status?.account;
  const courses = useMemo(() => items
    .filter(item => item.item_type === 'course')
    .filter(item => !courseSearch || `${item.title} ${item.content_text} ${item.metadata?.shortname || ''}`.toLowerCase().includes(courseSearch.toLowerCase()))
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))), [items, courseSearch]);
  const events = useMemo(() => items
    .filter(item => item.item_type === 'calendar' && Number(item.timestart) > 0)
    .sort((a, b) => Number(a.timestart) - Number(b.timestart)), [items]);

  const calendarDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
    for (const event of events) {
      const date = eventDate(event);
      if (!date) continue;
      const key = dateKey(date);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    }
    return grouped;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDay) || [];
  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  async function submitConnect(event) {
    event.preventDefault();
    setFormError('');
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setFormError('Enter your iLearn username and password.');
      return;
    }
    const oneTimePassword = password;
    setPassword('');
    try {
      await onConnect(cleanUsername, oneTimePassword);
      setUsername('');
    } catch (error) {
      setFormError(error.message || 'Could not connect to iLearn.');
    }
  }

  function changeMonth(amount) {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedDay(dateKey(next));
  }

  function selectToday() {
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDay(dateKey(today));
  }

  return <>
    <section className="page-heading">
      <div>
        <h1>iLearn workspace</h1>
        <p>Your enrolled courses and the calendar events available to your iLearn account.</p>
      </div>
      {connected && <div className="lms-header-actions">
        <button className="secondary-btn" onClick={onSync} disabled={busy === 'sync'}>
          <RefreshCw size={15} className={busy === 'sync' ? 'spin' : ''}/>
          {busy === 'sync' ? 'Syncing…' : 'Sync iLearn'}
        </button>
        <button className="danger-text" onClick={onDisconnect}><Unplug size={14}/> Disconnect</button>
      </div>}
    </section>

    {!connected && <section className="lms-connect-card">
      <div className="lms-connect-icon"><GraduationCap size={25}/></div>
      <h2>Connect BennettTech iLearn</h2>
      <p>CampusOS uses the Moodle mobile web-service token flow. Your password is sent to BennettTech to request a personal API token, then discarded. Only the encrypted token is retained for future read-only syncs.</p>
      <form className="lms-auth-form" onSubmit={submitConnect}>
        <label htmlFor="ilearn-username">iLearn username</label>
        <input
          id="ilearn-username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          placeholder="Your LMS username / student ID"
          autoComplete="username"
          autoCapitalize="none"
          required
          disabled={busy === 'connect'}
        />
        <label htmlFor="ilearn-password">iLearn password</label>
        <input
          id="ilearn-password"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="Your iLearn password"
          autoComplete="current-password"
          required
          disabled={busy === 'connect'}
        />
        {formError && <div className="lms-form-error">{formError}</div>}
        <button className="primary-btn" type="submit" disabled={busy === 'connect'}>
          {busy === 'connect' ? 'Connecting securely…' : <><KeyRound size={15}/> Connect iLearn</>}
        </button>
      </form>
      <div className="lms-security-note">
        <LockKeyhole size={16}/>
        <span>CampusOS does not save your password. It encrypts the Moodle API token with AES-256-GCM. Use CampusOS over HTTPS outside local development, and never share your token or encryption key.</span>
      </div>
    </section>}

    {connected && <>
      <section className="lms-summary-grid lms-two-stats">
        <StatCard size={18} icon={BookOpen} iconClassName="stat-icon blue" label="Enrolled courses" value={account?.course_count ?? courses.length} hint="Returned by Moodle for your account"/>
        <StatCard size={18} icon={CalendarDays} iconClassName="stat-icon amber" label="Calendar events" value={account?.calendar_count ?? events.length} hint="Past 30 days and next 365 days"/>
      </section>

      <div className="lms-account-bar">
        <div>
          <span className="status-chip ok">iLearn connected</span>
          <strong>{account?.username_hint || 'BennettTech student account'}</strong>
          <small>{account?.moodle_site_name || 'BennettTech iLearn'} · Last sync: {account?.last_synced_at ? new Date(account.last_synced_at).toLocaleString() : 'Not synchronized yet'}</small>
        </div>
        <ShieldCheck size={21}/>
      </div>

      <section className="lms-library">
        <div className="lms-library-top">
          <div><h2>Your academic workspace</h2><p>Read-only information returned by the iLearn web-service API.</p></div>
        </div>
        <div className="lms-filters">
          <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}><BookOpen size={14}/> Courses</button>
          <button className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}><CalendarDays size={14}/> Calendar</button>
        </div>

        {tab === 'courses' && <CourseList courses={courses} courseSearch={courseSearch} onCourseSearchChange={setCourseSearch}/>}

        {tab === 'calendar' && <CalendarView
          events={events}
          month={month}
          monthLabel={monthLabel}
          calendarDays={calendarDays}
          eventsByDay={eventsByDay}
          selectedDay={selectedDay}
          selectedEvents={selectedEvents}
          onChangeMonth={changeMonth}
          onSelectDay={setSelectedDay}
          onToday={selectToday}
        />}
      </section>
    </>}

    <div className="notice-card lms-notice">
      <ShieldCheck size={19}/>
      <div><strong>Read-only and account-scoped</strong><p>CampusOS calls Moodle's token, site-info, enrolled-courses and calendar read APIs. It does not submit assignments, modify calendar events, change grades, or access other students' accounts.</p></div>
    </div>
  </>;
}
