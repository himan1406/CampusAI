import React from 'react';
import { Mail, Bell, Link2, GraduationCap, MessageSquare } from 'lucide-react';

// Minimal StatCard component matching web app style
function StatCard({ icon, iconClassName, label, value, hint }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 8,
      padding: 12,
      textAlign: 'left',
      width: '100%',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      border: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <icon style={{ width: 20, height: 20, marginRight: 6, color: '#6b7482' }} />
        <span style={{ fontSize: 12, color: '#6b7482' }}>{iconClassName}</span>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, color: '#14181f', marginBottom: 2 }}>{value}</div>
        <div style={{ fontSize: 11, color: '#6b7482' }}>{hint}</div>
      </div>
    </div>
  );
}

// Provider row component
function ProviderRow({ logo, label, emailAddress, onConnect, busy, disabled }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      marginBottom: 8
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 6, background: '#e9eefb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, fontWeight: 600 }}>
        {logo}
      </div>
      <div style={{ flexGrow: 1 }}>
        <strong style={{ fontSize: 13, color: '#14181f' }}>{label}</strong>
        <span style={{ fontSize: 12, color: '#6b7482' }}>{emailAddress || 'Not connected'}</span>
      </div>
      {onConnect ? (
        <button
          style={{
            padding: '4px 8px',
            fontSize: 11,
            background: busy === 'gmail' ? '#e7f4ec' : '#f0f4f8',
            color: busy === 'gmail' ? '#2441a6' : '#3b51d3',
            border: '1px solid',
            borderRadius: 4,
            cursor: disabled ? 'not-allowed' : 'pointer',
            marginLeft: 4
          }}
          onClick={onConnect}
          disabled={disabled || busy}
        >
          {busy ? 'Opening…' : 'Connect'}
        </button>
      ) : null}
    </div>
  );
}

export default function DashboardPage({ user, messages, unread, accounts, lmsStatus, gmail, outlook, busyProvider, onConnectEmail, onRefresh, onNavigate }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font)' }}>
      <header style={{
        padding: 20,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
      </header>

      <section style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#14181f' }}>
          Welcome back, {user.full_name?.split(' ')[0] || 'student'}
        </h1>
        <p style={{ color: '#6b7482', marginBottom: 16, fontSize: 13 }}>
          A summary of your connected email and iLearn accounts.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <StatCard icon={Mail} iconClassName="stat-icon blue" label="Synced emails" value={messages.length} hint="Across connected inboxes" />
          <StatCard icon={Bell} iconClassName="stat-icon amber" label="Unread emails" value={unread} hint="In the local inbox cache" />
          <StatCard icon={Link2} iconClassName="stat-icon green" label="Connected email accounts" value={`${accounts.length}/2`} hint="Gmail and Outlook" />
          <StatCard icon={GraduationCap} iconClassName="stat-icon blue" label="iLearn course pages" value={lmsStatus?.account?.course_count || 0} hint={lmsStatus?.connected ? 'Connected LMS account' : 'iLearn not connected'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
          <div style={{
            background: '#fff',
            borderRadius: 8,
            padding: 16,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <Mail style={{ width: 20, height: 20, marginRight: 8, color: '#6b7482' }} />
              <div>
                <strong style={{ fontSize: 14, color: '#14181f' }}>Connect your email</strong>
                <p style={{ fontSize: 12, color: '#6b7482' }}>Bring your college and personal email into one inbox.</p>
              </div>
            </div>
            <ProviderRow logo="G" label="Gmail" emailAddress={gmail?.email_address || 'Not connected'} onConnect={() => onConnectEmail('gmail')} disabled={!!busyProvider} />
            <ProviderRow logo="O" label="Outlook" emailAddress={outlook?.email_address || 'Not connected'} onConnect={() => onConnectEmail('outlook')} disabled={!!busyProvider} />
            <button style={{
              width: '100%',
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 11,
              background: '#f0f4f8',
              color: '#3b51d3',
              border: '1px solid #3b51d3',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}>
              Manage connected accounts <ArrowRight size={14} />
            </button>
          </div>

          <div style={{
            background: '#fff',
            borderRadius: 8,
            padding: 16,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <MessageSquare style={{ width: 20, height: 20, marginRight: 8, color: '#6b7482' }} />
              <div>
                <strong style={{ fontSize: 14, color: '#14181f' }}>Meet Campus AI</strong>
                <p style={{ fontSize: 12, color: '#6b7482' }}>Ask about your courses, course materials, calendar and synchronized inboxes in one conversation.</p>
              </div>
            </div>
            <button style={{
              width: '100%',
              padding: '8px 12px',
              background: '#3b51d3',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font)',
              fontSize: 13,
              fontWeight: 500
            }}>
              Open Campus AI <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
          border: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#14181f', marginBottom: 8 }}>
            Connect BennettTech iLearn
          </h2>
          <button style={{
            width: '100%',
            padding: '8px 12px',
            background: '#3b51d3',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'var(--font)',
            fontSize: 13,
            fontWeight: 500
          }}>
            Open iLearn integration <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}