import React from 'react';
import { ArrowRight, Bell, GraduationCap, Link2, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import StatCard from '../../components/ui/StatCard.jsx';

export default function DashboardPage({ user, messages, unread, accounts, lmsStatus, gmail, outlook, busyProvider, onConnectEmail, onRefresh, onNavigate }) {
  return <>
    <section className="page-heading"><div><h1>Welcome back, {user.full_name?.split(' ')[0] || 'student'}</h1><p>A summary of your connected email and iLearn accounts.</p></div><button className="secondary-btn" onClick={onRefresh}><RefreshCw size={16}/> Refresh overview</button></section>
    <section className="stats-grid">
      <StatCard icon={Mail} iconClassName="stat-icon blue" label="Synced emails" value={messages.length} hint="Across connected inboxes"/>
      <StatCard icon={Bell} iconClassName="stat-icon amber" label="Unread emails" value={unread} hint="In the local inbox cache"/>
      <StatCard icon={Link2} iconClassName="stat-icon green" label="Connected email accounts" value={`${accounts.length}/2`} hint="Gmail and Outlook"/>
      <StatCard icon={GraduationCap} iconClassName="stat-icon blue" label="iLearn course pages" value={lmsStatus?.account?.course_count || 0} hint={lmsStatus?.connected ? 'Connected LMS account' : 'iLearn not connected'}/>
    </section>
    <section className="dashboard-grid">
      <div className="panel-card"><div className="panel-head"><div><h2>Connect your email</h2><p>Bring your college and personal email into one inbox.</p></div><Mail size={20}/></div>
        <div className="provider-row"><div className="provider-logo gmail-logo">G</div><div className="provider-copy"><strong>Gmail</strong><span>{gmail?.email_address || 'Not connected'}</span></div>{gmail ? <span className="status-chip ok">Connected</span> : <button className="small-primary" onClick={() => onConnectEmail('gmail')} disabled={!!busyProvider}>{busyProvider === 'gmail' ? 'Opening…' : 'Connect'}</button>}</div>
        <div className="provider-row"><div className="provider-logo outlook-logo">O</div><div className="provider-copy"><strong>Outlook</strong><span>{outlook?.email_address || 'Not connected'}</span></div>{outlook ? <span className="status-chip ok">Connected</span> : <button className="small-primary" onClick={() => onConnectEmail('outlook')} disabled={!!busyProvider}>{busyProvider === 'outlook' ? 'Opening…' : 'Connect'}</button>}</div>
        <button className="text-link" onClick={() => onNavigate('connections')}>Manage connected accounts <ArrowRight size={14}/></button>
      </div>
      <div className="panel-card ai-card"><div className="ai-symbol"><MessageSquare size={20}/></div><h2>Meet Campus AI</h2><p>Ask about your courses, course materials, calendar and synchronized inboxes in one conversation.</p><button className="primary-btn" onClick={() => onNavigate('assistant')}>Open Campus AI <ArrowRight size={16}/></button></div>
    </section>
    <section className="panel-card next-panel"><div><h2>Connect BennettTech iLearn</h2><p>Bring your enrolled courses and iLearn calendar events into CampusOS.</p></div><button className="primary-btn" onClick={() => onNavigate('lms')}>Open iLearn integration <ArrowRight size={16}/></button></section>
  </>;
}
