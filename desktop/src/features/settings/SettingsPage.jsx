import React, { useState, useEffect } from 'react';
import { LoaderCircle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';

export default function SettingsPage({ onNavigate }) {
  const [serverUrl, setServerUrl] = useState('http://localhost:5000');
  const [accessToken, setAccessToken] = useState('');
  const [hotkey, setHotkey] = useState('F12');
  const [isListening, setIsListening] = useState(false);
  const [hotkeyCombo, setHotkeyCombo] = useState('F12');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const storedServer = window.electron.store.get('serverUrl');
    const storedToken = window.electron.store.get('accessToken');
    const storedHotkey = window.electron.store.get('hotkey');

    if (storedServer) setServerUrl(storedServer);
    if (storedToken) setAccessToken(storedToken);
    if (storedHotkey) setHotkey(storedHotkey);
  }, []);

  const handleHotkeyKeydown = (e) => {
    const combo = [];
    if (e.ctrlKey) combo.push('ctrl');
    if (e.shiftKey) combo.push('shift');
    if (e.altKey) combo.push('alt');
    combo.push(e.key.toLowerCase());
    const keyCombo = combo.join('+');
    setHotkeyCombo(keyCombo);
    setIsListening(true);

    const handleKeyUp = (upE) => {
      setIsListening(false);
      setHotkey(keyCombo);
      setHotkeyCombo(keyCombo);
      window.removeEventListener('keyup', handleKeyUp);
    };
    window.addEventListener('keyup', handleKeyUp);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      window.electron.store.set('serverUrl', serverUrl);
      window.electron.store.set('accessToken', accessToken);
      window.electron.store.set('hotkey', hotkeyCombo);
      setHotkey(hotkeyCombo);
      setSaving(false);
    } catch (err) {
      console.error('Save error:', err);
      setSaving(false);
    }
  };

  return (
    <div>
      <section>
        <h1 style="fontSize: 20; fontWeight: 600; marginBottom: 16; color: #14181f">Settings</h1>

        <div style="background: #fff; borderRadius: 8; padding: 20px; border: 1px solid #e3e6ec; marginBottom: 24">
          <div style="marginBottom: 16">
            <label style="display: block; marginBottom: 6; fontSize: 13; color: #4a5260">Server URL</label>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              style="width: 100%; padding: 8px 12px; border: 1px solid #e3e6ec; borderRadius: 4; fontSize: 13; background: #fff"
            />
          </div>

          <div style="marginBottom: 16">
            <label style="display: block; marginBottom: 6; fontSize: 13; color: #4a5260">Access Token</label>
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              style="width: 100%; padding: 8px 12px; border: 1px solid #e3e6ec; borderRadius: 4; fontSize: 13; background: #fff"
            />
          </div>

          <div style="marginBottom: 16">
            <label style="display: block; marginBottom: 6; fontSize: 13; color: #4a5260">Hotkey</label>
            <div style="display: flex; alignItems: center; gap: 8; border: 1px solid #e3e6ec; borderRadius: 4; padding: 8px 12px; background: #fff; height: 40">
              <span onClick={() => setIsListening(true)} style="flexGrow: 1; fontSize: 13; color: #14181f; cursor: pointer">
                {hotkeyCombo || 'Click to set'}
              </span>
              <CheckCircle style="width: 16; height: 16; color: #1b7a4b" />
            </div>
            <p style="fontSize: 11; color: #6b7482; marginTop: 4">
              Press your desired key combination (e.g., Ctrl+Shift+H)
            </p>
          </div>

          {isListening && (
            <p style="marginTop: 12; color: #b3261e; fontSize: 13">Press any key to set as hotkey...</p>
          )}
        </div>

        <div style="background: #fff; borderRadius: 8; padding: 20px; border: 1px solid #e3e6ec; marginBottom: 24">
          <h2 style="fontSize: 14; fontWeight: 600; color: #14181f; marginBottom: 12">About</h2>
          <p style="fontSize: 13; color: #4a5260">
            CampusOS Desktop Voice Assistant<br/>
            Version 1.0.0
          </p>
        </div>

        <button
          onClick={onNavigate}
          style="width: 100%; padding: 8px 12px; background: #3b51d3; color: #fff; border: none; borderRadius: 4; cursor: pointer; fontSize: 13; fontWeight: 500; marginTop: 16"
        >
          Back to Dashboard
        </button>

        <button
          onClick={saveSettings}
          style="width: 100%; padding: 8px 12px; background: #fff; color: #14181f; border: 1px solid #e3e6ec; borderRadius: 4; cursor: pointer; fontSize: 13; fontWeight: 500; marginTop: 8; marginBottom: 16"
        >
          Save Settings
        </button>

        <button
          onClick={saveSettings}
          style="width: 100%; padding: 8px 12px; background: transparent; color: #6b7482; border: none; borderRadius: 4; cursor: pointer; fontSize: 13; marginTop: 8"
        >
          Cancel
        </button>
      </section>
    </div>
  );
}