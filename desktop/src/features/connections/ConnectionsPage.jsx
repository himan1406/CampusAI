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
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#14181f' }}>
          Accounts and Connections
        </h1>
        
        <p style={{ color: '#6b7482', marginBottom: 20, fontSize: 13 }}>
          Authorize CampusOS to read selected email data. You can disconnect at any time.
        </p>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <Globe style={{ width: 20, height: 20, marginRight: 8, color: '#6b7482' }} />
            <div>
              <strong style={{ fontSize: 14, color: '#14181f' }}>Permission and privacy</strong>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#4a5260', lineHeight: 1.5 }}>
            CampusOS requests read-only email access. OAuth tokens and synchronized message content are encrypted at rest. Disconnecting deletes the locally synchronized messages and stored token. Provider-side permissions may need to be revoked separately in Google or Microsoft account settings.
          </p>
        </div>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#14181f', marginBottom: 12 }}>Connected Email Accounts</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Gmail Card */}
            <div style={{
              background: '#fff',
              borderRadius: 8,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              minHeight: 140
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: '#e7f4ec',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                fontWeight: 600,
                color: '#2441a6'
              }}>
                G
              </div>
              <strong style={{ fontSize: 14, color: '#14181f' }}>Gmail</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>Read inbox messages through the Gmail API</p>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#6b7482' }}>Not Connected</span>
              <button style={{
                width: '100%',
                padding: '6px 12px',
                background: '#f0f4f8',
                color: '#3b51d3',
                border: '1px solid #3b51d3',
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
              background: '#fff',
              borderRadius: 8,
              border: '1px solid var(--border)',
              overflow: 'hidden',
              minHeight: 140
            }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: '#f0f4f8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                fontWeight: 600,
                color: '#3b51d3'
              }}>
                O
              </div>
              <strong style={{ fontSize: 14, color: '#14181f' }}>Outlook</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>Read inbox messages through Microsoft Graph</p>
              <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: '#6b7482' }}>Not Connected</span>
              <button style={{
                width: '100%',
                padding: '6px 12px',
                background: '#f0f4f8',
                color: '#3b51d3',
                border: '1px solid #3b51d3',
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
            background: '#fcebe9',
            borderRadius: 4,
            border: '1px solid #fbc2eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: 11, color: '#8a5b00' }}>Note: Provider-side permissions may need to be revoked separately.</span>
            <ExternalLink style={{ width: 12, height: 12, color: '#8a5b00' }} />
          </div>
        </div>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginTop: 24
        }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#14181f', marginBottom: 12 }}>OAuth Flow</h2>
          <p style={{ fontSize: 13, color: '#4a5260', marginBottom: 16 }}>
            Click "Connect" next to your provider. You'll be redirected to Google/Microsoft to authorize access. After authorization, you'll be returned to CampusOS and the account will show as connected.
          </p>
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
            Add Account
          </button>
        </div>
      </section>
    </div>
  );
}