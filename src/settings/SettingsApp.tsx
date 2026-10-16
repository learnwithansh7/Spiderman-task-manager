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
  voiceActivationEnabled: false,
  voiceDeviceId: null,
  voiceSensitivity: 0.70,
  voiceAlsoSpider: false,
  voiceModelName: 'vosk-model-small-en-in-0.4',
};

// Sleek Toggle Switch Component
const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    style={{
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: checked ? '#0284c7' : '#334155',
      border: 'none',
      cursor: 'pointer',
      position: 'relative',
      padding: 0,
      transition: 'background-color 0.2s ease',
      outline: 'none',
      flexShrink: 0,
      boxShadow: checked ? '0 0 10px rgba(2, 132, 199, 0.4)' : 'none',
    }}
  >
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        transition: 'left 0.2s ease',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
      }}
    />
  </button>
);

export const SettingsApp: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_LOCAL_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Milestone V1: Voice helper devices and models
  const [voiceDevices, setVoiceDevices] = useState<Array<{ id: number; name: string; default: boolean }>>([]);
  const [installedModels, setInstalledModels] = useState<string[]>([]);

  // Load current settings & voice data from main process
  useEffect(() => {
    async function init() {
      try {
        if (window.electronAPI?.getSettings) {
          const loaded = await window.electronAPI.getSettings();
          if (loaded) {
            setSettings(loaded);
          }
        }
        if ((window.electronAPI as any)?.getVoiceDevices) {
          const devs = await (window.electronAPI as any).getVoiceDevices();
          if (devs && Array.isArray(devs)) {
            setVoiceDevices(devs);
          }
        }
        if ((window.electronAPI as any)?.getVoiceModels) {
          const models = await (window.electronAPI as any).getVoiceModels();
          if (models && Array.isArray(models)) {
            setInstalledModels(models);
          }
        }
      } catch (err) {
        console.error('[Settings] Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }
    init();

    if (window.electronAPI?.onSettingsUpdated) {
      const unsub = window.electronAPI.onSettingsUpdated((updated) => {
        setSettings(updated);
      });
      return () => unsub();
    }
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (window.electronAPI?.saveSettings) {
        await window.electronAPI.saveSettings(settings);
        setSaveStatus('Settings saved successfully!');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (err) {
      console.error('[Settings] Failed to save settings:', err);
      setSaveStatus('Failed to save settings.');
    } finally {
      setIsSaving(false);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🕷️</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Loading preferences...</div>
        </div>
      </div>
    );
  }

  const presets = [20, 30, 45, 60];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#090d16', color: '#f8fafc', overflow: 'hidden' }}>
      
      {/* 1. FIXED TOP HEADER */}
      <header
        style={{
          padding: '16px 22px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0c1322',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
            }}
          >
            🕷️
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.3px' }}>
              SpiderReminder
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
              Desktop Ergonomics & Health Assistant
            </p>
          </div>
        </div>

        {settings.nextTriggerTimestamp > 0 && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#38bdf8',
              backgroundColor: 'rgba(2, 132, 199, 0.15)',
              padding: '5px 12px',
              borderRadius: 20,
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#38bdf8', display: 'inline-block' }} />
            <span>Next: {new Date(settings.nextTriggerTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </header>

      {/* 2. SCROLLABLE CONTENT BODY */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* CARD 1: REMINDER INTERVAL */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={cardTitleStyle}>⏱️ Reminder Interval</div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Every {settings.intervalMinutes} mins</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {presets.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, intervalMinutes: min }))}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  border: settings.intervalMinutes === min ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: settings.intervalMinutes === min ? '#0284c7' : '#1e293b',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  boxShadow: settings.intervalMinutes === min ? '0 2px 8px rgba(2, 132, 199, 0.4)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {min}m
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Custom:</span>
            <input
              type="number"
              min={1}
              max={180}
              value={settings.intervalMinutes}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val > 0) {
                  setSettings((s) => ({ ...s, intervalMinutes: val }));
                }
              }}
              style={{ ...inputStyle, width: 80, textAlign: 'center' }}
            />
            <span style={{ fontSize: 12, color: '#64748b' }}>minutes</span>
          </div>
        </div>

        {/* CARD 2: ACTIVE WORK HOURS */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div>
              <div style={cardTitleStyle}>🌙 Active Hours</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Pause reminders outside work hours
              </div>
            </div>
            <ToggleSwitch
              checked={settings.activeHours.enabled}
              onChange={(checked) =>
                setSettings((s) => ({
                  ...s,
                  activeHours: { ...s.activeHours, enabled: checked },
                }))
              }
            />
          </div>

          {settings.activeHours.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <input
                type="time"
                value={settings.activeHours.start}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    activeHours: { ...s.activeHours, start: e.target.value },
                  }))
                }
                style={inputStyle}
              />
              <span style={{ color: '#64748b', fontSize: 12 }}>to</span>
              <input
                type="time"
                value={settings.activeHours.end}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    activeHours: { ...s.activeHours, end: e.target.value },
                  }))
                }
                style={inputStyle}
              />
            </div>
          )}
        </div>

        {/* CARD 3: SNOOZE & AUDIO MUTE */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={cardTitleStyle}>🔔 Snooze & Sound</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: '#cbd5e1' }}>Snooze Duration:</span>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>Mute Voice Notifications</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Silence the spoken voice reminder text</div>
            </div>
            <ToggleSwitch
              checked={settings.voiceMuted}
              onChange={(checked) => setSettings((s) => ({ ...s, voiceMuted: checked }))}
            />
          </div>
        </div>

        {/* CARD 4: REMINDER CUSTOMIZATION */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={cardTitleStyle}>💬 Reminder Messages</div>
            <span style={{ fontSize: 11, color: '#64748b' }}>Customizable per category</span>
          </div>

          {/* Water */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ToggleSwitch
                  checked={settings.reminderTypes.water.enabled}
                  onChange={(c) => updateReminder('water', 'enabled', c)}
                />
                <span style={{ fontWeight: 600, color: '#38bdf8', fontSize: 13 }}>💧 Water Reminder</span>
              </div>
              <button
                type="button"
                onClick={() => handleTriggerTest('water')}
                style={previewButtonStyle}
              >
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
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ToggleSwitch
                  checked={settings.reminderTypes.stretch.enabled}
                  onChange={(c) => updateReminder('stretch', 'enabled', c)}
                />
                <span style={{ fontWeight: 600, color: '#34d399', fontSize: 13 }}>🙆 Stretch Reminder</span>
              </div>
              <button
                type="button"
                onClick={() => handleTriggerTest('stretch')}
                style={previewButtonStyle}
              >
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ToggleSwitch
                  checked={settings.reminderTypes.eyes.enabled}
                  onChange={(c) => updateReminder('eyes', 'enabled', c)}
                />
                <span style={{ fontWeight: 600, color: '#fbbf24', fontSize: 13 }}>👀 Rest Eyes (20-20-20)</span>
              </div>
              <button
                type="button"
                onClick={() => handleTriggerTest('eyes')}
                style={previewButtonStyle}
              >
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

        {/* CARD 5: MILESTONE V1 VOICE ACTIVATION ("Hey Spider") */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>🎙️ Voice Activation ("Hey Spider")</span>
                <span style={{ fontSize: 10, backgroundColor: '#064e3b', color: '#34d399', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                  OFFLINE VOSK
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                Say <strong style={{ color: '#38bdf8' }}>"Hey Spider"</strong> to summon Spider-Man anytime.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.voiceActivationEnabled}
              onChange={(checked) => setSettings((s) => ({ ...s, voiceActivationEnabled: checked }))}
            />
          </div>

          {settings.voiceActivationEnabled && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: 14 }}>
              
              {/* Microphone Device */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Microphone Device:
                </label>
                <select
                  value={settings.voiceDeviceId === null ? 'default' : settings.voiceDeviceId}
                  onChange={(e) => {
                    const val = e.target.value === 'default' ? null : parseInt(e.target.value, 10);
                    setSettings((s) => ({ ...s, voiceDeviceId: val }));
                  }}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  <option value="default">✨ Default System Microphone</option>
                  {voiceDevices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.default ? '(System Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sensitivity (Confidence Threshold) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#cbd5e1' }}>
                    Sensitivity (Confidence Threshold):
                  </label>
                  <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700 }}>
                    {Math.round(settings.voiceSensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.40"
                  max="0.95"
                  step="0.05"
                  value={settings.voiceSensitivity}
                  onChange={(e) => setSettings((s) => ({ ...s, voiceSensitivity: parseFloat(e.target.value) }))}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  <span>More sensitive (lower threshold)</span>
                  <span>More strict (fewer false hits)</span>
                </div>
              </div>

              {/* Also respond to 'spider' */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
                    Also respond to just "spider"
                  </div>
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                    ⚠️ Note: May trigger more often during general conversation.
                  </div>
                </div>
                <ToggleSwitch
                  checked={settings.voiceAlsoSpider}
                  onChange={(checked) => setSettings((s) => ({ ...s, voiceAlsoSpider: checked }))}
                />
              </div>

              {/* Model Choice */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Vosk Acoustic Model:
                </label>
                <select
                  value={settings.voiceModelName}
                  onChange={(e) => setSettings((s) => ({ ...s, voiceModelName: e.target.value }))}
                  style={{ ...selectStyle, width: '100%' }}
                >
                  {installedModels.length > 0 ? (
                    installedModels.map((m) => (
                      <option key={m} value={m}>
                        {m === 'vosk-model-small-en-in-0.4' ? '🇮🇳 English (India) - vosk-model-small-en-in-0.4' : m === 'vosk-model-small-en-us-0.15' ? '🇺🇸 English (US) - vosk-model-small-en-us-0.15' : m}
                      </option>
                    ))
                  ) : (
                    <option value="vosk-model-small-en-in-0.4">vosk-model-small-en-in-0.4</option>
                  )}
                </select>
              </div>

            </div>
          )}
        </div>

        {/* CARD 6: SHORTCUTS & INSTANT SUMMON */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div>
              <div style={cardTitleStyle}>⌨️ Global Shortcuts & Manual Summon</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Summon Spider-Man anytime across desktop apps and games
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleTriggerTest('water')}
              style={{
                backgroundColor: '#dc2626',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)',
              }}
            >
              🕷️ Summon Now
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
            <div style={{ backgroundColor: '#090d16', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Summon Spider-Man</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginTop: 4, fontFamily: 'monospace' }}>Alt + Shift + R</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Or Ctrl + Alt + Shift + R</div>
            </div>

            <div style={{ backgroundColor: '#090d16', padding: '10px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Open Settings</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#a78bfa', marginTop: 4, fontFamily: 'monospace' }}>Ctrl + Alt + S</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Or Alt + Shift + S</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#64748b', marginTop: 10, lineHeight: 1.4 }}>
            💡 <strong style={{ color: '#94a3b8' }}>Tip:</strong> If <code style={{ color: '#f59e0b' }}>Ctrl + Alt + R</code> is claimed by AMD Radeon / GPU recording tools, use <strong style={{ color: '#38bdf8' }}>Alt + Shift + R</strong> or <strong style={{ color: '#38bdf8' }}>Ctrl + Alt + Shift + R</strong>.
          </div>
        </div>

        {/* CARD 7: WINDOWS STARTUP */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 13 }}>🚀 Start with Windows</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Automatically launch in system tray at login.
              </div>
            </div>
            <ToggleSwitch
              checked={settings.startWithWindows}
              onChange={(checked) => setSettings((s) => ({ ...s, startWithWindows: checked }))}
            />
          </div>
        </div>
      </main>

      {/* 3. FIXED BOTTOM FOOTER: ALWAYS VISIBLE SAVE BUTTON */}
      <footer
        style={{
          padding: '14px 22px',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#0c1322',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, marginRight: 12 }}>
          {saveStatus && (
            <span style={{ color: '#4ade80', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✓</span>
              <span>{saveStatus}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            backgroundColor: '#0284c7',
            backgroundImage: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 700,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 14px rgba(2, 132, 199, 0.45)',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onMouseOver={(e) => {
            if (!isSaving) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 18px rgba(2, 132, 199, 0.6)';
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(2, 132, 199, 0.45)';
          }}
        >
          <span>💾</span>
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </footer>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#111827',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: '16px 18px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const cardTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: '#f8fafc',
  letterSpacing: '-0.2px',
};

const inputStyle: React.CSSProperties = {
  backgroundColor: '#090d16',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#f8fafc',
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  backgroundColor: '#090d16',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#f8fafc',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

const previewButtonStyle: React.CSSProperties = {
  background: 'rgba(56, 189, 248, 0.1)',
  border: '1px solid rgba(56, 189, 248, 0.25)',
  borderRadius: 6,
  color: '#38bdf8',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '3px 10px',
  transition: 'all 0.15s ease',
};
