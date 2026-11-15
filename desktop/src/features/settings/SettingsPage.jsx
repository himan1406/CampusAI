import React, { useState, useEffect } from 'react';
import { CheckCircle } from 'lucide-react';

const cardStyle = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  padding: 16,
  marginBottom: 16
};

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  color: 'var(--text-2)'
};

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  fontFamily: 'var(--font)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  outline: 'none'
};

export default function SettingsPage({ onNavigate }) {
  const [serverUrl, setServerUrl] = useState('http://localhost:5000');
  const [accessToken, setAccessToken] = useState('');
  const [hotkey, setHotkey] = useState('F12');
  const [isListening, setIsListening] = useState(false);
  const [hotkeyCombo, setHotkeyCombo] = useState('F12');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // electron-store reads are async IPC calls, so they must be awaited.
    const load = async () => {
      const storedServer = await window.electron.store.get('serverUrl');
      const storedToken = await window.electron.store.get('accessToken');
      const storedHotkey = await window.electron.store.get('hotkey');

      if (storedServer) setServerUrl(storedServer);
      if (storedToken) setAccessToken(storedToken);
      if (storedHotkey) {
        setHotkey(storedHotkey);
        setHotkeyCombo(storedHotkey);
      }
    };
    load();
  }, []);

  const startListening = () => {
    setIsListening(true);
    setSaved(false);

    const handleKeydown = (event) => {
      event.preventDefault();
      const combo = [];
      if (event.ctrlKey) combo.push('ctrl');
      if (event.shiftKey) combo.push('shift');
      if (event.altKey) combo.push('alt');
      if (event.metaKey) combo.push('meta');
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        combo.push(event.key.toLowerCase());
      }
      if (combo.length) setHotkeyCombo(combo.join('+'));

      const stop = () => {
        setIsListening(false);
        window.removeEventListener('keyup', stop);
      };
      window.addEventListener('keyup', stop);
    };

    window.addEventListener('keydown', handleKeydown, { once: true });
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await window.electron.store.set('serverUrl', serverUrl.trim());
      await window.electron.store.set('accessToken', accessToken.trim());
      await window.electron.store.set('hotkey', hotkeyCombo);
      setHotkey(hotkeyCombo);
      setSaved(true);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)',
      padding: 20
    }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>Settings</h1>

      <div style={cardStyle}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Server URL</label>
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Access Token</label>
          <input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Hotkey</label>
          <div
            onClick={startListening}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              border: `1px solid ${isListening ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '0.5rem 0.75rem',
              background: 'var(--surface-2)',
              cursor: 'pointer'
            }}
          >
            <span style={{ flexGrow: 1, fontSize: 13, color: 'var(--text)' }}>
              {isListening ? 'Press a key combination…' : hotkeyCombo || 'Click to set'}
            </span>
            <CheckCircle style={{ width: 16, height: 16, color: 'var(--ok)' }} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            Click the field, then press your desired combination (e.g. Ctrl+Shift+H).
          </p>
        </div>

        {isListening && (
          <p style={{ marginTop: 12, color: 'var(--accent-text)', fontSize: 12 }}>
            Listening for keys…
          </p>
        )}
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>About</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          CampusOS Desktop Voice Assistant<br />
          Version 1.0.0
        </p>
      </div>

      <button
        onClick={saveSettings}
        disabled={saving}
        style={{
          width: '100%',
          padding: '0.625rem 0.75rem',
          background: saving ? 'var(--surface-3)' : 'var(--accent)',
          color: saving ? 'var(--text-3)' : '#fff',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: saving ? 'default' : 'pointer',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font)'
        }}
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>

      {saved && (
        <p style={{
          marginTop: 8,
          padding: '0.5rem 0.75rem',
          background: 'var(--ok-bg)',
          color: 'var(--ok)',
          border: '1px solid var(--ok)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12
        }}>
          Settings saved.
        </p>
      )}

      <button
        onClick={onNavigate}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: 'var(--surface-2)',
          color: 'var(--text-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: 'var(--font)',
          marginTop: 8,
          marginBottom: 16
        }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}
