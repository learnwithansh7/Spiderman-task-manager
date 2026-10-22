import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TaskItem } from '../overlay/types';
import { AppSettings } from '../types/settings';

interface AudioDeviceItem {
  id: number;
  name: string;
  channels: number;
  default: boolean;
}

export const SettingsApp: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'tasks' | 'voice'>('tasks');

  // Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [loadingTasks, setLoadingTasks] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice & Mic state
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [devices, setDevices] = useState<AudioDeviceItem[]>([]);
  const [isTestingMic, setIsTestingMic] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [lastDetection, setLastDetection] = useState<{ phrase: string; conf: number; time: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load Tasks on mount and subscribe to changes
  useEffect(() => {
    async function loadTasks() {
      try {
        if (window.tasksApi?.list) {
          const list = await window.tasksApi.list();
          if (Array.isArray(list)) {
            setTasks(list);
          }
        }
      } catch (err: any) {
        console.error('[UI] Error loading tasks:', err?.message || err);
      } finally {
        setLoadingTasks(false);
      }
    }
    loadTasks();

    if (window.tasksApi?.onChanged) {
      const unsub = window.tasksApi.onChanged((updated) => {
        if (Array.isArray(updated)) {
          setTasks(updated);
        } else {
          window.tasksApi?.list().then((res) => {
            if (Array.isArray(res)) setTasks(res);
          });
        }
      });
      return () => unsub();
    }
  }, []);

  // Load Settings and Audio Devices
  useEffect(() => {
    async function loadVoiceSettings() {
      try {
        if (window.electronAPI?.getSettings) {
          const s = await window.electronAPI.getSettings();
          if (s) setSettings(s);
        }
        if (window.electronAPI?.getVoiceDevices) {
          const devs = await window.electronAPI.getVoiceDevices();
          if (Array.isArray(devs)) setDevices(devs);
        }
      } catch (err) {
        console.error('[UI] Error loading voice settings/devices:', err);
      }
    }
    loadVoiceSettings();

    // Listen for settings updates
    let unsubSettings: (() => void) | undefined;
    if (window.electronAPI?.onSettingsUpdated) {
      unsubSettings = window.electronAPI.onSettingsUpdated((updated) => {
        if (updated) setSettings(updated);
      });
    }

    // Listen for device list updates
    let unsubDevs: (() => void) | undefined;
    if (window.electronAPI?.onVoiceDevicesUpdated) {
      unsubDevs = window.electronAPI.onVoiceDevicesUpdated((devs) => {
        if (Array.isArray(devs)) setDevices(devs);
      });
    }

    // Listen for live voice test detection
    let unsubDetect: (() => void) | undefined;
    if (window.electronAPI?.onVoiceDetected) {
      unsubDetect = window.electronAPI.onVoiceDetected((data) => {
        setLastDetection({ phrase: data.phrase, conf: data.conf, time: Date.now() });
      });
    }

    return () => {
      unsubSettings?.();
      unsubDevs?.();
      unsubDetect?.();
    };
  }, []);

  // Cleanup mic test stream on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  // Helper to show transient save confirmation
  const showSavedBadge = () => {
    setSaveStatus('Saved ✓');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // Save Settings helper
  const updateSettingsField = async (partial: Partial<AppSettings>) => {
    if (!settings || !window.electronAPI?.saveSettings) return;
    const updated = { ...settings, ...partial };
    setSettings(updated);
    try {
      await window.electronAPI.saveSettings(updated);
      showSavedBadge();
    } catch (err) {
      console.error('[UI] Failed to save settings:', err);
    }
  };

  // Mic test logic
  const startMicTest = async () => {
    try {
      stopMicTest();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      setIsTestingMic(true);

      const updateMeter = () => {
        if (!mediaStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Map 0-128 range to 0-100%
        const normalized = Math.min(100, Math.round((avg / 96) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err: any) {
      console.error('[UI] Could not access microphone for test:', err);
      alert(`Could not start mic test: ${err?.message || err}. Please ensure microphone permission is granted.`);
      setIsTestingMic(false);
    }
  };

  const stopMicTest = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsTestingMic(false);
    setMicLevel(0);
  }, []);

  const toggleMicTest = () => {
    if (isTestingMic) {
      stopMicTest();
    } else {
      startMicTest();
    }
  };

  // Task actions
  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || isSubmitting) return;

    setAddError(null);
    setIsSubmitting(true);
    try {
      if (!window.tasksApi?.add) {
        throw new Error('Task API not available — preload may not be loaded');
      }
      await window.tasksApi.add(title);
      setNewTaskTitle('');
      inputRef.current?.focus();
      const list = await window.tasksApi.list();
      if (Array.isArray(list)) {
        setTasks(list);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setAddError(`Could not save the task: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!window.tasksApi?.remove) return;
      await window.tasksApi.remove(id);
    } catch (err: any) {
      console.error('[UI] Failed to remove task:', err?.message || err);
    }
  };

  const handleToggleTask = async (id: string) => {
    try {
      if (!window.tasksApi?.toggle) return;
      await window.tasksApi.toggle(id);
    } catch (err: any) {
      console.error('[UI] Failed to toggle task:', err?.message || err);
    }
  };

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.done).length;
  const counterText = totalCount === 0 ? '0 tasks' : `${completedCount} of ${totalCount} done`;

  if (loadingTasks) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', backgroundColor: '#090d16' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🕷️</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Loading SpiderReminder...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#090d16',
        color: '#f8fafc',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 1. TOP HEADER & TABS BAR */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          flexShrink: 0,
        }}
      >
        {/* Main Title Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px 10px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              🕷️
            </div>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                SpiderReminder
              </h1>
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0 0' }}>
                Desktop Reminder & Voice Assistant
              </p>
            </div>
          </div>

          {/* Right Status Badge */}
          {activeTab === 'tasks' ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#38bdf8',
                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                padding: '5px 14px',
                borderRadius: 20,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: completedCount === totalCount && totalCount > 0 ? '#4ade80' : '#38bdf8',
                  display: 'inline-block',
                }}
              />
              <span>{counterText}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saveStatus && (
                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>{saveStatus}</span>
              )}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: settings?.voiceActivationEnabled ? '#4ade80' : '#94a3b8',
                  backgroundColor: settings?.voiceActivationEnabled ? 'rgba(74, 222, 128, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                  padding: '4px 10px',
                  borderRadius: 16,
                  border: settings?.voiceActivationEnabled ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid #334155',
                }}
              >
                {settings?.voiceActivationEnabled ? '🎙️ Voice Active' : '🔇 Voice Off'}
              </div>
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '0 16px',
            borderTop: '1px solid rgba(30, 41, 59, 0.6)',
          }}
        >
          <button
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: activeTab === 'tasks' ? 700 : 500,
              color: activeTab === 'tasks' ? '#38bdf8' : '#94a3b8',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tasks' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            📋 SpiderTasks
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: activeTab === 'voice' ? 700 : 500,
              color: activeTab === 'voice' ? '#38bdf8' : '#94a3b8',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'voice' ? '2px solid #38bdf8' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
          >
            🎙️ Microphone & Voice
          </button>
        </div>
      </header>

      {/* 2. BODY CONTENT (TASKS OR VOICE) */}
      {activeTab === 'tasks' ? (
        /* ======================== TAB: TASKS ======================== */
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Add task bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <form
              onSubmit={handleAddTask}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="Add a task..."
                maxLength={200}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  backgroundColor: '#111827',
                  border: addError ? '1px solid #ef4444' : '1px solid #334155',
                  borderRadius: 8,
                  color: '#f8fafc',
                  padding: '10px 14px',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.3)',
                  userSelect: 'text',
                }}
                onFocus={(e) => { e.target.style.borderColor = addError ? '#ef4444' : '#38bdf8'; }}
                onBlur={(e) => { e.target.style.borderColor = addError ? '#ef4444' : '#334155'; }}
              />
              <button
                type="submit"
                disabled={!newTaskTitle.trim() || isSubmitting}
                style={{
                  backgroundColor: newTaskTitle.trim() ? '#0284c7' : '#1e293b',
                  backgroundImage: newTaskTitle.trim() ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'none',
                  color: newTaskTitle.trim() ? '#ffffff' : '#64748b',
                  border: newTaskTitle.trim() ? '1px solid #38bdf8' : '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: newTaskTitle.trim() && !isSubmitting ? 'pointer' : 'default',
                  boxShadow: newTaskTitle.trim() ? '0 3px 10px rgba(2, 132, 199, 0.4)' : 'none',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                Add
              </button>
            </form>
            {addError && (
              <div style={{ color: '#ef4444', fontSize: 12, padding: '4px 2px', lineHeight: '1.4' }}>
                {addError}
              </div>
            )}
          </div>

          {/* Task list */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {tasks.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '48px 16px',
                  color: '#64748b',
                  textAlign: 'center',
                  borderRadius: 12,
                  border: '1px dashed #1e293b',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 10 }}>🕸️</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                  No tasks yet
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  Type in the box above and press Add to create your first task.
                </div>
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleToggleTask(task.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 10,
                    backgroundColor: task.done ? 'rgba(17, 24, 39, 0.6)' : '#111827',
                    border: task.done ? '1px solid #1e293b' : '1px solid #334155',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    gap: 12,
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = task.done ? 'rgba(30, 41, 59, 0.6)' : '#1e293b';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = task.done ? 'rgba(17, 24, 39, 0.6)' : '#111827';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: task.done ? '1px solid #4ade80' : '1px solid #64748b',
                        backgroundColor: task.done ? '#166534' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 700,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {task.done && '✓'}
                    </div>

                    <span
                      style={{
                        fontSize: 14,
                        color: task.done ? '#64748b' : '#f8fafc',
                        textDecoration: task.done ? 'line-through' : 'none',
                        lineHeight: '1.4',
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        userSelect: 'text',
                      }}
                    >
                      {task.title}
                    </span>
                  </div>

                  <button
                    type="button"
                    title="Delete task"
                    onClick={(e) => handleDeleteTask(task.id, e)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#64748b',
                      fontSize: 18,
                      fontWeight: 700,
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                      padding: 0,
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.color = '#64748b';
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </main>
      ) : (
        /* ======================== TAB: MICROPHONE & VOICE ======================== */
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* 1. MASTER VOICE TOGGLE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              backgroundColor: '#111827',
              borderRadius: 10,
              border: '1px solid #1e293b',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                Voice Activation
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Listen for voice commands completely offline via Vosk
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings?.voiceActivationEnabled ?? true}
                onChange={(e) => updateSettingsField({ voiceActivationEnabled: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: settings?.voiceActivationEnabled ? '#0284c7' : '#334155',
                  borderRadius: 24,
                  transition: '0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 18,
                    width: 18,
                    left: settings?.voiceActivationEnabled ? 23 : 3,
                    bottom: 3,
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    transition: '0.2s ease',
                  }}
                />
              </span>
            </label>
          </div>

          {/* 2. CHOOSE MICROPHONE CARD */}
          <div
            style={{
              padding: '16px 18px',
              backgroundColor: '#111827',
              borderRadius: 10,
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Microphone Input
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Select which audio hardware captures your voice
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (window.electronAPI?.getVoiceDevices) {
                    const fresh = await window.electronAPI.getVoiceDevices();
                    if (Array.isArray(fresh)) setDevices(fresh);
                  }
                }}
                title="Refresh audio devices"
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                🔄 Refresh
              </button>
            </div>

            <select
              value={settings?.voiceDeviceId === null || settings?.voiceDeviceId === undefined ? 'default' : String(settings.voiceDeviceId)}
              onChange={(e) => {
                const val = e.target.value === 'default' ? null : parseInt(e.target.value, 10);
                updateSettingsField({ voiceDeviceId: val });
              }}
              style={{
                width: '100%',
                backgroundColor: '#090d16',
                border: '1px solid #334155',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 13,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="default">Default Microphone (System Default)</option>
              {devices.map((dev) => (
                <option key={dev.id} value={String(dev.id)}>
                  [{dev.id}] {dev.name} {dev.default ? '★ (System Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 3. TEST MICROPHONE LIVE VU METER CARD */}
          <div
            style={{
              padding: '16px 18px',
              backgroundColor: '#111827',
              borderRadius: 10,
              border: isTestingMic ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #1e293b',
              boxShadow: isTestingMic ? '0 0 15px rgba(2, 132, 199, 0.15)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Test Microphone
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Check real-time input audio levels to verify your mic is working
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMicTest}
                style={{
                  backgroundColor: isTestingMic ? '#ef4444' : '#0284c7',
                  backgroundImage: isTestingMic ? 'none' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: isTestingMic ? '0 0 10px rgba(239, 68, 68, 0.4)' : '0 2px 8px rgba(2, 132, 199, 0.3)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isTestingMic ? '⏹️ Stop Test' : '🎙️ Test Mic'}
              </button>
            </div>

            {/* VU Meter Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  width: '100%',
                  height: 14,
                  backgroundColor: '#090d16',
                  borderRadius: 7,
                  overflow: 'hidden',
                  border: '1px solid #1e293b',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${micLevel}%`,
                    background: micLevel > 75
                      ? 'linear-gradient(90deg, #10b981 0%, #f59e0b 60%, #ef4444 100%)'
                      : micLevel > 35
                      ? 'linear-gradient(90deg, #10b981 0%, #38bdf8 100%)'
                      : '#10b981',
                    borderRadius: 7,
                    transition: 'width 0.08s ease-out',
                  }}
                />
              </div>

              {/* Meter details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: isTestingMic ? (micLevel > 15 ? '#4ade80' : '#38bdf8') : '#64748b' }}>
                  {isTestingMic
                    ? micLevel > 15
                      ? '🔊 Voice detected!'
                      : '🎤 Listening... speak into your microphone'
                    : 'Click "Test Mic" to check your sound level'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                  {isTestingMic ? `${micLevel}%` : 'Off'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. VOICE COMMANDS & SPIDER TRIGGER CARD */}
          <div
            style={{
              padding: '16px 18px',
              backgroundColor: '#111827',
              borderRadius: 10,
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                Voice Trigger Keywords
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Configured offline trigger phrases for Spider-Man
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* "Hey Spider" */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#0b1120',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>"Hey Spider"</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>Summons Spider-Man to show your tasks</span>
                </div>
                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Always On</span>
              </div>

              {/* Single Word "Spider" Checkbox */}
              <div
                onClick={() => updateSettingsField({ voiceAlsoSpider: !settings?.voiceAlsoSpider })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#0b1120',
                  borderRadius: 8,
                  border: settings?.voiceAlsoSpider ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #1e293b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>"Spider"</span>
                    <span style={{ fontSize: 11, color: '#38bdf8', backgroundColor: 'rgba(2, 132, 199, 0.2)', padding: '2px 6px', borderRadius: 4 }}>
                      Single Word (Optional)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Also summon on single word "Spider" (Disabled by default to avoid ambient noise false triggers)
                  </div>
                </div>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: settings?.voiceAlsoSpider ? '1px solid #4ade80' : '1px solid #64748b',
                    backgroundColor: settings?.voiceAlsoSpider ? '#166534' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {settings?.voiceAlsoSpider && '✓'}
                </div>
              </div>

              {/* "Ok Spider" / "Okay Spider" */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#0b1120',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>"Ok Spider" / "Okay Spider"</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>Dismisses Spider-Man (climbs back up)</span>
                </div>
                <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>Active</span>
              </div>
            </div>

            {/* Live Detection Feedback Display */}
            {lastDetection && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎉</span>
                  <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 700 }}>
                    Heard: "{lastDetection.phrase}"
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Confidence: {Math.round(lastDetection.conf * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* 5. SENSITIVITY THRESHOLD */}
          <div
            style={{
              padding: '16px 18px',
              backgroundColor: '#111827',
              borderRadius: 10,
              border: '1px solid #1e293b',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                  Sensitivity Threshold
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Controls how strictly the wake-word is verified
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>
                {Math.round((settings?.voiceSensitivity ?? 0.70) * 100)}%
              </span>
            </div>

            <input
              type="range"
              min="0.50"
              max="0.85"
              step="0.05"
              value={settings?.voiceSensitivity ?? 0.70}
              onChange={(e) => updateSettingsField({ voiceSensitivity: parseFloat(e.target.value) })}
              style={{
                width: '100%',
                cursor: 'pointer',
                accentColor: '#0284c7',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
              <span>Easier (50%)</span>
              <span>Recommended (70%)</span>
              <span>Strict (85%)</span>
            </div>
          </div>
        </main>
      )}
    </div>
  );
};
