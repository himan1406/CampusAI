import React from 'react';
import { Link2, Shield, Lock, CheckCircle, XCircle, Globe, ExternalLink } from 'lucide-react';

export default function ConnectionsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)'
    }}>
      <section style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
          Accounts and Connections
        </h1>
        
        <p style={{ color: 'var(--text-3)', marginBottom: 20, fontSize: 13 }}>
          Authorize CampusOS to read selected email data. You can disconnect at any time.
        </p>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <Globe style={{ width: 20, height: 20, marginRight: 8, color: 'var(--text-3)' }} />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Permission and privacy</strong>
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            CampusOS requests read-only email access. OAuth tokens and synchronized message content are encrypted at rest. Disconnecting deletes the locally synchronized messages and stored token. Provider-side permissions may need to be revoked separately in Google or Microsoft account settings.
          </p>
        </div>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Connected Email Accounts</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Gmail Card */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              minHeight: 140
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'var(--ok-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                fontWeight: 600,
                color: 'var(--accent-text)'
              }}>
                G
              </div>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Gmail</strong>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Read inbox messages through the Gmail API</p>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>Not Connected</span>
              <button style={{
                width: '100%',
                padding: '6px 12px',
                background: 'var(--surface-2)',
                color: 'var(--accent-text)',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--font)',
                marginTop: 4
              }}>
                Connect
              </button>
            </div>
            
            {/* Outlook Card */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 8,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              minHeight: 140
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                fontWeight: 600,
                color: 'var(--accent-text)'
              }}>
                O
              </div>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Outlook</strong>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Read inbox messages through Microsoft Graph</p>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'var(--text-3)' }}>Not Connected</span>
              <button style={{
                width: '100%',
                padding: '6px 12px',
                background: 'var(--surface-2)',
                color: 'var(--accent-text)',
                border: '1px solid var(--accent)',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: 'var(--font)',
                marginTop: 4
              }}>
                Connect
              </button>
            </div>
          </div>
          
          <div style={{
            marginTop: 12,
            padding: 8,
            background: 'var(--danger-bg)',
            borderRadius: 4,
            border: '1px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 11, color: 'var(--warn)' }}>Note: Provider-side permissions may need to be revoked separately.</span>
            <ExternalLink style={{ width: 12, height: 12, color: 'var(--warn)' }} />
          </div>
        </div>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginTop: 24
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>OAuth Flow</h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
            Click "Connect" next to your provider. You'll be redirected to Google/Microsoft to authorize access. After authorization, you'll be returned to CampusOS and the account will show as connected.
          </p>
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
            Add Account
          </button>
        </div>
      </section>
    </div>
  );
}