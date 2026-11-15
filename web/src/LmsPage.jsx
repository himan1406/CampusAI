import React, { useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  ExternalLink, GraduationCap, LockKeyhole, RefreshCw, ShieldCheck,
  Unplug, KeyRound, Clock3
} from 'lucide-react';

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function eventDate(event) {
  const stamp = Number(event.timestart || 0);
  return stamp > 0 ? new Date(stamp * 1000) : null;
}

function formatDate(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return 'Not specified';
  return new Date(value * 1000).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function formatTime(date) {
  return date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
}

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
        <div className="stat-card">
          <div className="stat-icon blue"><BookOpen size={18}/></div>
          <span>Enrolled courses</span>
          <strong>{account?.course_count ?? courses.length}</strong>
          <small>Returned by Moodle for your account</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber"><CalendarDays size={18}/></div>
          <span>Calendar events</span>
          <strong>{account?.calendar_count ?? events.length}</strong>
          <small>Past 30 days and next 365 days</small>
        </div>
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

        {tab === 'courses' && <>
          <div className="lms-library-top lms-course-toolbar">
            <div><h2>My courses</h2><p>{courses.length} courses synchronized from your enrolments.</p></div>
            <input className="lms-search" value={courseSearch} onChange={event => setCourseSearch(event.target.value)} placeholder="Search your courses…"/>
          </div>
          <div className="lms-course-grid">
            {courses.length ? courses.map(course => <article className="lms-course-card" key={course.id}>
              <div className="lms-course-card-icon"><BookOpen size={19}/></div>
              <div className="lms-course-card-body">
                <h3>{course.title}</h3>
                <span>{course.metadata?.shortname || course.metadata?.idnumber || 'BennettTech course'}</span>
                {course.content_text && <p>{course.content_text.slice(0, 240)}{course.content_text.length > 240 ? '…' : ''}</p>}
                <div className="lms-course-dates">
                  {Number(course.startdate) > 0 && <span>Starts {formatDate(course.startdate)}</span>}
                  {Number(course.enddate) > 0 && <span>Ends {formatDate(course.enddate)}</span>}
                </div>
                <a href={course.source_url} target="_blank" rel="noreferrer">Open course in iLearn <ExternalLink size={13}/></a>
              </div>
            </article>) : <div className="lms-empty"><BookOpen size={27}/><strong>No courses found</strong><p>Run Sync iLearn to retrieve your enrolled courses. If the list is empty, check whether the Moodle token can access the enrolment service.</p></div>}
          </div>
        </>}

        {tab === 'calendar' && <>
          <div className="lms-calendar-toolbar">
            <div><h2>iLearn calendar</h2><p>Events returned by the Moodle calendar service.</p></div>
            <div className="lms-calendar-nav">
              <button className="secondary-btn" onClick={() => changeMonth(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button>
              <strong>{monthLabel}</strong>
              <button className="secondary-btn" onClick={() => changeMonth(1)} aria-label="Next month"><ChevronRight size={16}/></button>
              <button className="text-link" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(dateKey(today)); }}>Today</button>
            </div>
          </div>
          <div className="lms-calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="lms-calendar-weekday" key={day}>{day}</div>)}
            {calendarDays.map(day => {
              const key = dateKey(day);
              const dayEvents = eventsByDay.get(key) || [];
              const inMonth = day.getMonth() === month.getMonth();
              return <button
                type="button"
                key={key}
                className={`lms-calendar-day ${inMonth ? '' : 'outside'} ${selectedDay === key ? 'selected' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
                onClick={() => setSelectedDay(key)}
              >
                <span className="lms-day-number">{day.getDate()}</span>
                {dayEvents.slice(0, 2).map(event => <span className="lms-day-event" key={event.id}>{event.title}</span>)}
                {dayEvents.length > 2 && <span className="lms-day-more">+{dayEvents.length - 2} more</span>}
              </button>;
            })}
          </div>
          <div className="lms-selected-events">
            <div className="lms-selected-events-head">
              <div><h3>{new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><p>{selectedEvents.length} events</p></div>
            </div>
            {selectedEvents.length ? selectedEvents.map(event => {
              const date = eventDate(event);
              return <article className="lms-event-row" key={event.id}>
                <div className="lms-event-time"><Clock3 size={14}/><span>{formatTime(date)}</span></div>
                <div className="lms-event-copy">
                  <strong>{event.title}</strong>
                  <span>{event.course_name || 'iLearn calendar'}</span>
                  {event.content_text && <p>{event.content_text.slice(0, 220)}</p>}
                  <a href={event.source_url} target="_blank" rel="noreferrer">Open in iLearn <ExternalLink size={12}/></a>
                </div>
              </article>;
            }) : <div className="lms-empty lms-empty-compact"><CalendarDays size={24}/><strong>No events on this date</strong><p>Choose another date or sync iLearn again.</p></div>}
          </div>
          {!events.length && <div className="lms-empty"><CalendarDays size={27}/><strong>No calendar events returned</strong><p>The Moodle calendar service may not have returned events for the selected range, or the account may not have visible events.</p></div>}
        </>}
      </section>
    </>}

    <div className="notice-card lms-notice">
      <ShieldCheck size={19}/>
      <div><strong>Read-only and account-scoped</strong><p>CampusOS calls Moodle's token, site-info, enrolled-courses and calendar read APIs. It does not submit assignments, modify calendar events, change grades, or access other students' accounts.</p></div>
    </div>
  </>;
}