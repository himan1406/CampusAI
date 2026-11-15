import React from 'react';
import { Mail, Bell, Link2, GraduationCap, MessageSquare, ArrowRight } from 'lucide-react';

// Minimal StatCard component matching web app style
function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius)',
      padding: 12,
      textAlign: 'left',
      width: '100%',
      border: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <Icon style={{ width: 16, height: 16, marginRight: 6, color: 'var(--text-3)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.35 }}>{hint}</div>
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
      <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, fontWeight: 600 }}>
        {logo}
      </div>
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <strong style={{ fontSize: 13, color: 'var(--text)' }}>{label}</strong>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{emailAddress || 'Not connected'}</span>
      </div>
      {onConnect ? (
        <button
          style={{
            padding: '4px 10px',
            fontSize: 11,
            background: 'var(--surface-2)',
            color: 'var(--accent-text)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            marginLeft: 8
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
        padding: '0.5rem 0.75rem 0.5rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        WebkitAppRegion: 'drag',
        position: 'sticky',
        top: 0,
        zIndex: 1
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
          <strong style={{ fontSize: '0.875rem', color: 'var(--text)' }}>CampusOS</strong>
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

      <section style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
          Welcome back, {user.full_name?.split(' ')[0] || 'student'}
        </h1>
        <p style={{ color: 'var(--text-3)', marginBottom: 16, fontSize: 13 }}>
          A summary of your connected email and iLearn accounts.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <StatCard icon={Mail} label="Synced emails" value={messages.length} hint="Across connected inboxes" />
          <StatCard icon={Bell} label="Unread emails" value={unread} hint="In the local inbox cache" />
          <StatCard icon={Link2} label="Connected email accounts" value={`${accounts.length}/2`} hint="Gmail and Outlook" />
          <StatCard icon={GraduationCap} label="iLearn course pages" value={lmsStatus?.account?.course_count || 0} hint={lmsStatus?.connected ? 'Connected LMS account' : 'iLearn not connected'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 8,
            padding: 16,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <Mail style={{ width: 20, height: 20, marginRight: 8, color: 'var(--text-3)' }} />
              <div>
                <strong style={{ fontSize: 14, color: 'var(--text)' }}>Connect your email</strong>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Bring your college and personal email into one inbox.</p>
              </div>
            </div>
            <ProviderRow logo="G" label="Gmail" emailAddress={gmail?.email_address || 'Not connected'} onConnect={() => onConnectEmail('gmail')} disabled={!!busyProvider} />
            <ProviderRow logo="O" label="Outlook" emailAddress={outlook?.email_address || 'Not connected'} onConnect={() => onConnectEmail('outlook')} disabled={!!busyProvider} />
            <button style={{
              width: '100%',
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 11,
              background: 'var(--surface-2)',
              color: 'var(--accent-text)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font)'
            }}>
              Manage connected accounts <ArrowRight size={14} />
            </button>
          </div>

          <div style={{
            background: 'var(--surface)',
            borderRadius: 8,
            padding: 16,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <MessageSquare style={{ width: 20, height: 20, marginRight: 8, color: 'var(--text-3)' }} />
              <div>
                <strong style={{ fontSize: 14, color: 'var(--text)' }}>Meet Campus AI</strong>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Ask about your courses, course materials, calendar and synchronized inboxes in one conversation.</p>
              </div>
            </div>
            <button style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--accent)',
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
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 16,
          marginTop: 16,
          border: '1px solid var(--border)'
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
            Connect BennettTech iLearn
          </h2>
          <button style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--accent)',
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