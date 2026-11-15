import React from 'react';
import { Mail, Link2, Calendar, Shield, CheckCircle } from 'lucide-react';

export default function ProfilePage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)'
    }}>
      <section style={{ padding: 20 }}>
        <div style={{
          background: '#fff',
          borderRadius: 8,
          padding: 20,
          border: '1px solid var(--border)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 32,
              background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, color: '#6b7482', marginRight: 16, fontSize: 24
            }}>U</div>
            <div>
              <strong style={{ fontSize: 18, color: '#14181f' }}>UI Check Student</strong>
              <p style={{ fontSize: 13, color: '#6b7482' }}>ui_mwh1k3x@exa...</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ fontSize: 13, color: '#4a5260', marginBottom: 4 }}>Mobile number</p>
              <p style={{ fontSize: 14, color: '#14181f' }}>+919876543210</p>
            </div>
            <div>
              <p style={{ fontSize: 13, color: '#4a5260', marginBottom: 4 }}>Student ID</p>
              <p style={{ fontSize: 14, color: '#6b7482' }}>Not added</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <p style={{ fontSize: 13, color: '#4a5260', marginBottom: 4 }}>Department</p>
              <p style={{ fontSize: 14, color: '#6b7482' }}>Not added</p>
            </div>
            <div>
              <p style={{ fontSize: 13, color: '#4a5260', marginBottom: 4 }}>Academic year</p>
              <p style={{ fontSize: 14, color: '#14181f' }}>2</p>
            </div>
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
          fontWeight: 500,
          marginTop: 16
        }}>
          Sign out
        </button>
      </section>
    </div>
  );
}