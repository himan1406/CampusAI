import React from 'react';
import { Mail, MessageSquare, Inbox, Link2, Clock } from 'lucide-react';

export default function InboxPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)'
    }}>
      <section style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#14181f' }}>
          Unified Inbox
        </h1>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <Mail style={{ width: 20, height: 20, marginRight: 8, color: '#6b7482' }} />
            <div>
              <strong style={{ fontSize: 14, color: '#14181f' }}>Messages (0)</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>Across connected inboxes</p>
            </div>
          </div>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginTop: 16
          }}>
            <div style={{
              background: '#f8f9fa',
              borderRadius: 6,
              padding: 12,
              border: '1px solid #e3e6eb'
            }}>
              <MessageSquare style={{ width: 16, height: 16, marginRight: 6, color: '#6b7482' }} />
              <strong>No new messages</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>Your inbox is up to date.</p>
            </div>
            
            <div style={{
              background: '#f8f9fa',
              borderRadius: 6,
              padding: 12,
              border: '1px solid #e3e6eb'
            }}>
              <Clock style={{ width: 16, height: 16, marginRight: 6, color: '#6b7482' }} />
              <strong>Last synced</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>Just now</p>
            </div>
          </div>
        </div>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <MessageSquare style={{ width: 20, height: 20, marginRight: 8, color: '#6b7482' }} />
            <div>
              <strong style={{ fontSize: 14, color: '#14181f' }}>Recent activity</strong>
              <p style={{ fontSize: 12, color: '#6b7482' }}>No recent activity.</p>
            </div>
          </div>
        </div>
        
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginTop: 24
        }}>
          <p style={{ color: '#6b7482', fontSize: 13 }}>
            No connected email accounts. <a href="#" style={{ color: '#2f54c8', textDecoration: 'underline' }}>Connect your email</a> to start receiving messages.
          </p>
        </div>
      </section>
    </div>
  );
}