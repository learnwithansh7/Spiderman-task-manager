import React, { useEffect, useState, useRef, useCallback } from 'react';
import { TaskItem } from '../overlay/types';
import { AppSettings } from '../types/settings';
import iconImg from '../../assets/icon.png';
import characterImg from '../../assets/character.png';

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
  const progressPct = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const counterText = totalCount === 0 ? '0 tasks' : `${completedCount} of ${totalCount} done`;

  if (loadingTasks) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#f8fafc',
          backgroundColor: '#070a12',
          backgroundImage: 'radial-gradient(ellipse at 50% 20%, rgba(225, 29, 72, 0.15) 0%, transparent 70%)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <img
            src={iconImg}
            alt="Spider Icon"
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              border: '2px solid #e11d48',
              boxShadow: '0 0 20px rgba(225, 29, 72, 0.6)',
              marginBottom: 12,
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', letterSpacing: '0.5px' }}>
            SPIDER-REMINDER
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Loading your mission board...</div>
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
        backgroundColor: '#070a12',
        backgroundImage: 'radial-gradient(circle at 80% 10%, rgba(225, 29, 72, 0.08) 0%, transparent 40%), radial-gradient(circle at 20% 90%, rgba(56, 189, 248, 0.06) 0%, transparent 40%)',
        color: '#f8fafc',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Top Hero Gradient Glow Strip */}
      <div
        style={{
          height: 3,
          width: '100%',
          background: 'linear-gradient(90deg, #e11d48 0%, #38bdf8 50%, #e11d48 100%)',
          boxShadow: '0 0 12px rgba(225, 29, 72, 0.8)',
          flexShrink: 0,
        }}
      />

      {/* 1. TOP HEADER & TABS BAR */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(225, 29, 72, 0.2)',
          flexShrink: 0,
        }}
      >
        {/* Main Title Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px 10px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#0f172a',
                border: '2px solid #e11d48',
                boxShadow: '0 0 14px rgba(225, 29, 72, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={iconImg}
                alt="Emblem"
                style={{
                  width: '90%',
                  height: '90%',
                  objectFit: 'contain',
                }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    margin: 0,
                    letterSpacing: '0.4px',
                    background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  SpiderReminder
                </h1>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: '#e11d48',
                    backgroundColor: 'rgba(225, 29, 72, 0.12)',
                    padding: '1px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(225, 29, 72, 0.3)',
                    letterSpacing: '0.5px',
                  }}
                >
                  Hero HQ
                </span>
              </div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0 0' }}>
                Desktop Missions & Offline Voice Assistant
              </p>
            </div>
          </div>

          {/* Right Status Badge */}
          {activeTab === 'tasks' ? (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: completedCount === totalCount && totalCount > 0 ? '#4ade80' : '#38bdf8',
                backgroundColor: completedCount === totalCount && totalCount > 0 ? 'rgba(74, 222, 128, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                padding: '5px 14px',
                borderRadius: 20,
                border: completedCount === totalCount && totalCount > 0 ? '1px solid rgba(74, 222, 128, 0.35)' : '1px solid rgba(56, 189, 248, 0.35)',
                boxShadow: completedCount === totalCount && totalCount > 0 ? '0 0 10px rgba(74, 222, 128, 0.2)' : '0 0 10px rgba(56, 189, 248, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: completedCount === totalCount && totalCount > 0 ? '#4ade80' : '#38bdf8',
                  boxShadow: completedCount === totalCount && totalCount > 0 ? '0 0 6px #4ade80' : '0 0 6px #38bdf8',
                  display: 'inline-block',
                }}
              />
              <span>{counterText}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saveStatus && (
                <span
                  style={{
                    fontSize: 11,
                    color: '#4ade80',
                    fontWeight: 700,
                    textShadow: '0 0 6px rgba(74, 222, 128, 0.4)',
                  }}
                >
                  {saveStatus}
                </span>
              )}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: settings?.voiceActivationEnabled ? '#4ade80' : '#94a3b8',
                  backgroundColor: settings?.voiceActivationEnabled ? 'rgba(74, 222, 128, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                  padding: '5px 12px',
                  borderRadius: 16,
                  border: settings?.voiceActivationEnabled ? '1px solid rgba(74, 222, 128, 0.35)' : '1px solid #334155',
                  boxShadow: settings?.voiceActivationEnabled ? '0 0 10px rgba(74, 222, 128, 0.2)' : 'none',
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
                    backgroundColor: settings?.voiceActivationEnabled ? '#4ade80' : '#64748b',
                    boxShadow: settings?.voiceActivationEnabled ? '0 0 6px #4ade80' : 'none',
                  }}
                />
                {settings?.voiceActivationEnabled ? 'Voice Listening' : 'Voice Off'}
              </div>
            </div>
          )}
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <button
            onClick={() => setActiveTab('tasks')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: activeTab === 'tasks' ? 800 : 500,
              color: activeTab === 'tasks' ? '#ffffff' : '#94a3b8',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'tasks' ? '3px solid #e11d48' : '3px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              textShadow: activeTab === 'tasks' ? '0 0 10px rgba(225, 29, 72, 0.6)' : 'none',
            }}
          >
            <span>🕷️ SpiderTasks</span>
            {totalCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  backgroundColor: activeTab === 'tasks' ? '#e11d48' : '#1e293b',
                  color: '#ffffff',
                  padding: '2px 7px',
                  borderRadius: 10,
                  transition: 'all 0.15s ease',
                }}
              >
                {totalCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: activeTab === 'voice' ? 800 : 500,
              color: activeTab === 'voice' ? '#ffffff' : '#94a3b8',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'voice' ? '3px solid #38bdf8' : '3px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              textShadow: activeTab === 'voice' ? '0 0 10px rgba(56, 189, 248, 0.6)' : 'none',
            }}
          >
            <span>🎙️ Microphone & Voice</span>
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
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Hero Overview Card */}
          <div
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.12) 0%, rgba(56, 189, 248, 0.08) 100%)',
              border: '1px solid rgba(225, 29, 72, 0.25)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img
                src={characterImg}
                alt="Spider-Man"
                style={{
                  width: 44,
                  height: 52,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6))',
                  flexShrink: 0,
                }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#ffffff', letterSpacing: '0.2px' }}>
                  Mission Progress
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  {totalCount === 0
                    ? 'No active missions on your web.'
                    : completedCount === totalCount
                    ? 'All web missions completed! Outstanding work, Hero.'
                    : `${totalCount - completedCount} pending missions remaining.`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 120 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#e11d48' }}>
                {progressPct}% Done
              </span>
              <div
                style={{
                  width: 120,
                  height: 6,
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  borderRadius: 3,
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: 'linear-gradient(90deg, #e11d48 0%, #38bdf8 100%)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                    boxShadow: '0 0 8px rgba(225, 29, 72, 0.6)',
                  }}
                />
              </div>
            </div>
          </div>

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
                placeholder="Assign a new mission to Spider-Man..."
                maxLength={200}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: addError ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 8,
                  color: '#f8fafc',
                  padding: '11px 16px',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)',
                  userSelect: 'text',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = addError ? '#ef4444' : '#e11d48';
                  e.target.style.boxShadow = '0 0 12px rgba(225, 29, 72, 0.3)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = addError ? '#ef4444' : 'rgba(255, 255, 255, 0.12)';
                  e.target.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.4)';
                }}
              />
              <button
                type="submit"
                disabled={!newTaskTitle.trim() || isSubmitting}
                style={{
                  backgroundColor: newTaskTitle.trim() ? '#e11d48' : '#1e293b',
                  backgroundImage: newTaskTitle.trim() ? 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)' : 'none',
                  color: newTaskTitle.trim() ? '#ffffff' : '#64748b',
                  border: newTaskTitle.trim() ? '1px solid rgba(225, 29, 72, 0.8)' : '1px solid #334155',
                  borderRadius: 8,
                  padding: '11px 22px',
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: newTaskTitle.trim() && !isSubmitting ? 'pointer' : 'default',
                  boxShadow: newTaskTitle.trim() ? '0 4px 14px rgba(225, 29, 72, 0.45)' : 'none',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  letterSpacing: '0.3px',
                }}
              >
                + Add Task
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
                  padding: '36px 16px',
                  color: '#94a3b8',
                  textAlign: 'center',
                  borderRadius: 12,
                  border: '1px dashed rgba(225, 29, 72, 0.3)',
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                }}
              >
                <img
                  src={characterImg}
                  alt="Spider-Man Hanging"
                  style={{
                    height: 100,
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 6px 12px rgba(0, 0, 0, 0.6))',
                    marginBottom: 12,
                    animation: 'float 3s ease-in-out infinite',
                  }}
                />
                <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', marginBottom: 4 }}>
                  No Missions on Your Web!
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', maxWidth: 360, lineHeight: '1.5' }}>
                  Spider-Man is standing by. Type in the box above to add a mission, or say <strong style={{ color: '#38bdf8' }}>"Hey Spider"</strong> anytime to open this card!
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
                    padding: '12px 16px',
                    borderRadius: 10,
                    backgroundColor: task.done ? 'rgba(15, 23, 42, 0.4)' : 'rgba(22, 30, 46, 0.75)',
                    border: task.done ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(255, 255, 255, 0.12)',
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                    gap: 12,
                    boxShadow: task.done ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.25)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = task.done ? 'rgba(22, 30, 46, 0.6)' : 'rgba(30, 41, 64, 0.85)';
                    e.currentTarget.style.borderColor = 'rgba(225, 29, 72, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = task.done ? 'rgba(15, 23, 42, 0.4)' : 'rgba(22, 30, 46, 0.75)';
                    e.currentTarget.style.borderColor = task.done ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.12)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: task.done ? '1px solid #e11d48' : '1px solid #475569',
                        backgroundColor: task.done ? '#e11d48' : 'rgba(15, 23, 42, 0.6)',
                        boxShadow: task.done ? '0 0 8px rgba(225, 29, 72, 0.5)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: '#ffffff',
                        fontSize: 12,
                        fontWeight: 800,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {task.done && '✓'}
                    </div>

                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: task.done ? 400 : 500,
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
                    title="Delete mission"
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
            padding: '18px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* 1. MASTER VOICE TOGGLE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 12,
              border: '1px solid rgba(225, 29, 72, 0.25)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc' }}>
                  Voice Activation
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    padding: '1px 6px',
                    borderRadius: 4,
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                  }}
                >
                  Offline AI
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                Listen for voice wake words and dismissal completely offline via Vosk
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
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
                  backgroundColor: settings?.voiceActivationEnabled ? '#e11d48' : '#334155',
                  boxShadow: settings?.voiceActivationEnabled ? '0 0 12px rgba(225, 29, 72, 0.5)' : 'none',
                  borderRadius: 26,
                  transition: '0.2s ease',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    height: 20,
                    width: 20,
                    left: settings?.voiceActivationEnabled ? 25 : 3,
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
              padding: '16px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
                  Microphone Input Hardware
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
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
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#38bdf8';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#334155';
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
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#f8fafc',
                borderRadius: 8,
                padding: '10px 14px',
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
              padding: '16px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 12,
              border: isTestingMic ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: isTestingMic ? '0 0 20px rgba(56, 189, 248, 0.25)' : '0 4px 16px rgba(0, 0, 0, 0.25)',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
                  Test Microphone Input
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Check real-time input audio levels to verify your mic is picking up your voice
                </div>
              </div>
              <button
                type="button"
                onClick={toggleMicTest}
                style={{
                  backgroundColor: isTestingMic ? '#ef4444' : '#e11d48',
                  backgroundImage: isTestingMic ? 'none' : 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: isTestingMic ? '0 0 12px rgba(239, 68, 68, 0.5)' : '0 4px 12px rgba(225, 29, 72, 0.4)',
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
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${micLevel}%`,
                    background: micLevel > 75
                      ? 'linear-gradient(90deg, #10b981 0%, #38bdf8 50%, #e11d48 100%)'
                      : micLevel > 35
                      ? 'linear-gradient(90deg, #10b981 0%, #38bdf8 100%)'
                      : '#10b981',
                    borderRadius: 7,
                    transition: 'width 0.08s ease-out',
                    boxShadow: micLevel > 20 ? '0 0 8px rgba(56, 189, 248, 0.5)' : 'none',
                  }}
                />
              </div>

              {/* Meter details */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: isTestingMic ? (micLevel > 15 ? '#4ade80' : '#38bdf8') : '#64748b' }}>
                  {isTestingMic
                    ? micLevel > 15
                      ? '🔊 Sound detected! Speaking clearly.'
                      : '🎤 Listening... speak into your microphone'
                    : 'Click "Test Mic" to check your sound level'}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                  {isTestingMic ? `${micLevel}%` : 'Off'}
                </span>
              </div>
            </div>
          </div>

          {/* 4. VOICE COMMANDS CHEATSHEET & SPIDER TRIGGER */}
          <div
            style={{
              padding: '16px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 12,
              border: '1px solid rgba(225, 29, 72, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
                Voice Trigger Keywords
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
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
                  padding: '12px 16px',
                  backgroundColor: 'rgba(11, 17, 32, 0.8)',
                  borderRadius: 10,
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>"Hey Spider"</span>
                  <span style={{ fontSize: 12, color: '#cbd5e1', marginLeft: 10 }}>
                    Summons Spider-Man downwards to display your active tasks
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: '#4ade80',
                    fontWeight: 800,
                    backgroundColor: 'rgba(74, 222, 128, 0.12)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                  }}
                >
                  Always On
                </span>
              </div>

              {/* Single Word "Spider" Checkbox */}
              <div
                onClick={() => updateSettingsField({ voiceAlsoSpider: !settings?.voiceAlsoSpider })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(11, 17, 32, 0.8)',
                  borderRadius: 10,
                  border: settings?.voiceAlsoSpider ? '1px solid rgba(225, 29, 72, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>"Spider"</span>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#e11d48',
                        backgroundColor: 'rgba(225, 29, 72, 0.12)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 700,
                      }}
                    >
                      Single Word (Optional)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                    Also summon on single word "Spider" (Disabled by default to avoid ambient room noise false triggers)
                  </div>
                </div>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    border: settings?.voiceAlsoSpider ? '1px solid #e11d48' : '1px solid #64748b',
                    backgroundColor: settings?.voiceAlsoSpider ? '#e11d48' : 'transparent',
                    boxShadow: settings?.voiceAlsoSpider ? '0 0 8px rgba(225, 29, 72, 0.5)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: 12,
                    fontWeight: 800,
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
                  padding: '12px 16px',
                  backgroundColor: 'rgba(11, 17, 32, 0.8)',
                  borderRadius: 10,
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>
                    "Ok Spider" / "Okay Spider"
                  </span>
                  <span style={{ fontSize: 12, color: '#cbd5e1', marginLeft: 10 }}>
                    Dismisses Spider-Man back up to the web ceiling
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    color: '#4ade80',
                    fontWeight: 800,
                    backgroundColor: 'rgba(74, 222, 128, 0.12)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                  }}
                >
                  Active
                </span>
              </div>
            </div>

            {/* Live Detection Feedback Display */}
            {lastDetection && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(74, 222, 128, 0.1)',
                  border: '1px solid rgba(74, 222, 128, 0.4)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 0 12px rgba(74, 222, 128, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 800 }}>
                    Heard Command: "{lastDetection.phrase}"
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
              padding: '16px 20px',
              backgroundColor: 'rgba(15, 23, 42, 0.75)',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc' }}>
                  Voice Sensitivity Threshold
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  Controls how strictly the wake-words and dismissal are verified
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#e11d48' }}>
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
                accentColor: '#e11d48',
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
