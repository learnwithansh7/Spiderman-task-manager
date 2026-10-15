import React, { useEffect, useState } from 'react';
import { AppSettings, ReminderTypeKey } from '../types/settings';

const DEFAULT_LOCAL_SETTINGS: AppSettings = {
  intervalMinutes: 45,
  activeHours: {
    enabled: true,
    start: '09:00',
    end: '18:00',
  },
  snoozeDurationMinutes: 5,
  voiceMuted: false,
  startWithWindows: false,
  reminderTypes: {
    water: {
      enabled: true,
      message: 'Time to drink water! Stay hydrated.',
      voiceText: 'Time to drink water! Stay hydrated.',
    },
    stretch: {
      enabled: true,
      message: 'Time to stretch your back and shoulders!',
      voiceText: 'Time to stretch your back and shoulders!',
    },
    eyes: {
      enabled: true,
      message: 'Rest your eyes! Look at something 20 feet away.',
      voiceText: 'Rest your eyes! Look away from the screen.',
    },
  },
  lastTriggerTimestamp: 0,
  nextTriggerTimestamp: 0,
  lastReminderType: 'water',
};

export const SettingsApp: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_LOCAL_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Load current settings from main process
  useEffect(() => {
    async function init() {
      try {
        if (window.electronAPI?.getSettings) {
          const loaded = await window.electronAPI.getSettings();
          if (loaded) {
            setSettings(loaded);
          }
        }
      } catch (err) {
        console.error('[Settings] Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }
    init();

    // Listen for external updates (e.g. from tray or snooze)
    if (window.electronAPI?.onSettingsUpdated) {
      const unsub = window.electronAPI.onSettingsUpdated((updated) => {
        setSettings(updated);
      });
      return () => unsub();
    }
  }, []);

  const handleSave = async () => {
    try {
      if (window.electronAPI?.saveSettings) {
        await window.electronAPI.saveSettings(settings);
        setSaveStatus('Settings saved successfully!');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
      setSaveStatus('Failed to save settings.');
    }
  };

  const handleTestVoice = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleTriggerTest = (type: ReminderTypeKey) => {
    window.electronAPI?.testReminder?.(type);
  };

  const updateReminder = (type: ReminderTypeKey, field: 'enabled' | 'message', value: any) => {
    setSettings((prev) => ({
      ...prev,
      reminderTypes: {
        ...prev.reminderTypes,
        [type]: {
          ...prev.reminderTypes[type],
          [field]: value,
          ...(field === 'message' ? { voiceText: value } : {}),
        },
      },
    }));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}>
        Loading settings...
      </div>
    );
  }

  const presets = [20, 30, 45, 60];

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 20px', fontSize: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
          }}>
            🕷️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>SpiderReminder</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Desktop reminder preferences</p>
          </div>
        </div>
        {settings.nextTriggerTimestamp > 0 && (
          <div style={{
            fontSize: 11,
            color: '#38bdf8',
            backgroundColor: '#0c4a6e40',
            padding: '4px 10px',
            borderRadius: 12,
            border: '1px solid #0284c750',
          }}>
            Next: {new Date(settings.nextTriggerTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* Interval Section */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>⏱️ Reminder Interval</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {presets.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setSettings((s) => ({ ...s, intervalMinutes: min }))}
              style={{
                flex: 1,
                padding: '6px 0',
                borderRadius: 6,
                border: settings.intervalMinutes === min ? '1px solid #38bdf8' : '1px solid #334155',
                backgroundColor: settings.intervalMinutes === min ? '#0284c7' : '#1e293b',
                color: '#f8fafc',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                transition: 'all 0.15s ease',
              }}
            >
              {min}m
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ color: '#cbd5e1', fontSize: 13 }}>Custom interval (minutes):</label>
          <input
            type="number"
            min={1}
            max={240}
            value={settings.intervalMinutes}
            onChange={(e) => {
              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
              setSettings((s) => ({ ...s, intervalMinutes: val }));
            }}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Active Work Hours Section */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={cardTitleStyle}>🕒 Active Work Hours</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
            <input
              type="checkbox"
              checked={settings.activeHours.enabled}
              onChange={(e) => setSettings((s) => ({
                ...s,
                activeHours: { ...s.activeHours, enabled: e.target.checked },
              }))}
            />
            Enabled
          </label>
        </div>
        {settings.activeHours.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>Start Time</span>
              <input
                type="time"
                value={settings.activeHours.start}
                onChange={(e) => setSettings((s) => ({
                  ...s,
                  activeHours: { ...s.activeHours, start: e.target.value },
                }))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>End Time</span>
              <input
                type="time"
                value={settings.activeHours.end}
                onChange={(e) => setSettings((s) => ({
                  ...s,
                  activeHours: { ...s.activeHours, end: e.target.value },
                }))}
                style={{ ...inputStyle, width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Snooze & Voice */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>🔔 Snooze & Spoken Voice</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ color: '#cbd5e1' }}>Snooze Duration:</span>
          <select
            value={settings.snoozeDurationMinutes}
            onChange={(e) => setSettings((s) => ({ ...s, snoozeDurationMinutes: parseInt(e.target.value, 10) }))}
            style={selectStyle}
          >
            <option value={3}>3 minutes</option>
            <option value={5}>5 minutes</option>
            <option value={10}>10 minutes</option>
            <option value={15}>15 minutes</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #1e293b' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={!settings.voiceMuted}
              onChange={(e) => setSettings((s) => ({ ...s, voiceMuted: !e.target.checked }))}
            />
            <span>Spoken voice reminders</span>
          </label>
          <button
            type="button"
            onClick={() => handleTestVoice('SpiderReminder voice test. Stay hydrated and healthy!')}
            style={smallButtonStyle}
          >
            🔊 Test Voice
          </button>
        </div>
      </div>

      {/* Reminder Types & Custom Messages */}
      <div style={cardStyle}>
        <div style={{ ...cardTitleStyle, marginBottom: 12 }}>📋 Reminder Types & Messages</div>
        
        {/* Water */}
        <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#38bdf8', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.reminderTypes.water.enabled}
                onChange={(e) => updateReminder('water', 'enabled', e.target.checked)}
              />
              💧 Water Reminder
            </label>
            <button type="button" onClick={() => handleTriggerTest('water')} style={testLinkStyle}>
              Preview
            </button>
          </div>
          <input
            type="text"
            value={settings.reminderTypes.water.message}
            onChange={(e) => updateReminder('water', 'message', e.target.value)}
            style={{ ...inputStyle, width: '100%', marginTop: 4 }}
          />
        </div>

        {/* Stretch */}
        <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#34d399', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.reminderTypes.stretch.enabled}
                onChange={(e) => updateReminder('stretch', 'enabled', e.target.checked)}
              />
              🙆 Stretch Reminder
            </label>
            <button type="button" onClick={() => handleTriggerTest('stretch')} style={testLinkStyle}>
              Preview
            </button>
          </div>
          <input
            type="text"
            value={settings.reminderTypes.stretch.message}
            onChange={(e) => updateReminder('stretch', 'message', e.target.value)}
            style={{ ...inputStyle, width: '100%', marginTop: 4 }}
          />
        </div>

        {/* Eyes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#fbbf24', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.reminderTypes.eyes.enabled}
                onChange={(e) => updateReminder('eyes', 'enabled', e.target.checked)}
              />
              👀 Rest Eyes (20-20-20)
            </label>
            <button type="button" onClick={() => handleTriggerTest('eyes')} style={testLinkStyle}>
              Preview
            </button>
          </div>
          <input
            type="text"
            value={settings.reminderTypes.eyes.message}
            onChange={(e) => updateReminder('eyes', 'message', e.target.value)}
            style={{ ...inputStyle, width: '100%', marginTop: 4 }}
          />
        </div>
      </div>

      {/* Windows Startup */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>🚀 System & Windows Startup</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={settings.startWithWindows}
            onChange={(e) => setSettings((s) => ({ ...s, startWithWindows: e.target.checked }))}
          />
          <div>
            <div style={{ fontWeight: 600, color: '#f8fafc' }}>Start SpiderReminder with Windows</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Automatically launch in system tray when your PC starts up.</div>
          </div>
        </label>
      </div>

      {/* Bottom Save & Status Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
        <div>
          {saveStatus && (
            <span style={{ color: '#34d399', fontWeight: 600, fontSize: 13 }}>
              ✓ {saveStatus}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          style={{
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 22px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.4)',
            transition: 'background-color 0.15s ease',
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#131b2e',
  border: '1px solid #1e293b',
  borderRadius: 10,
  padding: '16px 14px',
  marginBottom: 14,
};

const cardTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: '#f8fafc',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#0b1120',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#f8fafc',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  backgroundColor: '#0b1120',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#f8fafc',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

const smallButtonStyle: React.CSSProperties = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#cbd5e1',
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
};

const testLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#38bdf8',
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
};
