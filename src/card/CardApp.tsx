import React, { useEffect, useState } from 'react';
import { TaskItem } from '../overlay/types';

export const CardApp: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        console.error('[Card] Error loading tasks:', err?.message || err);
      } finally {
        setLoading(false);
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

  const handleToggle = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setErrorMsg(null);
    try {
      if (!window.tasksApi?.toggle) {
        throw new Error('Task API unavailable');
      }
      console.log(`[Card] Toggling task id=${id}`);
      await window.tasksApi.toggle(id);
      // Safety net refresh
      const list = await window.tasksApi.list();
      if (Array.isArray(list)) setTasks(list);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[Card] Failed to toggle task:', msg);
      setErrorMsg(`Could not update task: ${msg}`);
    }
  };

  const handleClose = () => {
    console.log('[Card] Close button clicked: dismissing character.');
    window.electronAPI?.notifyAction('done');
    window.electronAPI?.send('dismiss-spider');
  };

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.done).length;
  const counterText = `${completedCount} of ${totalCount} done`;

  return (
    <div
      style={{
        width: 320,
        height: 380,
        backgroundColor: '#090d16',
        border: '1.5px solid #0284c7',
        borderRadius: 12,
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.65), 0 0 20px rgba(2, 132, 199, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: '#f8fafc',
        overflow: 'hidden',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {/* 1. Header with Title & Counter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🕷️</span>
          <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.2px' }}>
            Today's tasks
          </h2>
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#38bdf8',
            backgroundColor: 'rgba(2, 132, 199, 0.2)',
            padding: '3px 10px',
            borderRadius: 12,
            border: '1px solid rgba(56, 189, 248, 0.3)',
          }}
        >
          {counterText}
        </div>
      </div>

      {/* 2. Error message banner if any failure occurs */}
      {errorMsg && (
        <div
          style={{
            color: '#ef4444',
            fontSize: 11,
            padding: '4px 12px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
            flexShrink: 0,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 3. Task List with Checkboxes */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: '24px 0' }}>
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div
            style={{
              padding: '36px 12px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 24 }}>🕸️</span>
            <span>No tasks yet</span>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              onClick={(e) => handleToggle(task.id, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                backgroundColor: task.done ? 'rgba(17, 24, 39, 0.5)' : '#111827',
                border: task.done ? '1px solid #1e293b' : '1px solid #334155',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = task.done ? 'rgba(30, 41, 59, 0.5)' : '#1e293b';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = task.done ? 'rgba(17, 24, 39, 0.5)' : '#111827';
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  border: task.done ? '1px solid #4ade80' : '1px solid #64748b',
                  backgroundColor: task.done ? '#166534' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
              >
                {task.done && '✓'}
              </div>

              {/* Title (crossed out when done) */}
              <span
                style={{
                  fontSize: 12,
                  color: task.done ? '#64748b' : '#f8fafc',
                  textDecoration: task.done ? 'line-through' : 'none',
                  lineHeight: '1.3',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {task.title}
              </span>
            </div>
          ))
        )}
      </div>

      {/* 4. Footer with Close Button */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          display: 'flex',
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          style={{
            backgroundColor: '#0284c7',
            backgroundImage: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            border: '1px solid #38bdf8',
            borderRadius: 6,
            padding: '6px 20px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.4)',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.filter = 'brightness(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.filter = 'none';
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};
