import React from 'react';
import { GraduationCap, Link2, Mail, Search, Calendar } from 'lucide-react';

export default function LmsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)'
    }}>
      <section style={{ padding: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
          iLearn LMS
        </h1>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <GraduationCap style={{ width: 20, height: 20, marginRight: 8, color: 'var(--text-3)' }} />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Moodle Integration</strong>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Bring your enrolled courses and iLearn calendar events into CampusOS.</p>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Connection Status</h3>
              <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
                iLearn not connected. Use the button below to set up the OAuth flow.
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
                Connect iLearn
              </button>
            </div>
            
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Sync Status</h3>
              <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
                No courses synced yet. Connection will fetch enrolled course pages.
              </p>
            </div>
          </div>
        </div>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <Mail style={{ width: 20, height: 20, marginRight: 8, color: 'var(--text-3)' }} />
            <div>
              <strong style={{ fontSize: 14, color: 'var(--text)' }}>Email Integration</strong>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Your email messages are available alongside your LMS data.</p>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Connected accounts:</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>0/2</p>
            </div>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Unread emails:</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>0</p>
            </div>
          </div>
        </div>
        
        <div style={{
          background: 'var(--surface)',
          borderRadius: 8,
          padding: 16,
          border: '1px solid var(--border)',
          marginTop: 24
        }}>
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
            The iLearn integration uses Moodle's mobile web-service token flow. Your password is sent to BennettTech to request a personal API token, then discarded. Only the encrypted token is retained for future read-only syncs.
          </p>
        </div>
      </section>
    </div>
  );
}