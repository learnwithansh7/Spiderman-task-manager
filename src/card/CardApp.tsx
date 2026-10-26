import React, { useEffect, useState } from 'react';
import { TaskItem } from '../overlay/types';

export const CardApp: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || isAdding) return;
    setIsAdding(true);
    setErrorMsg(null);
    try {
      if (window.tasksApi?.add) {
        await window.tasksApi.add(title);
        setNewTaskTitle('');
        const list = await window.tasksApi.list();
        if (Array.isArray(list)) setTasks(list);
      }
    } catch (err: any) {
      setErrorMsg(String(err));
    } finally {
      setIsAdding(false);
    }
  };

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
        width: '100%',
        height: '100%',
        backgroundColor: '#111827',
        border: '1px solid #1e293b',
        borderRadius: 12,
        padding: '16px 18px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 1. HEADER: Title and Counter matching old card's header style */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: '#f8fafc',
            letterSpacing: '-0.2px',
          }}
        >
          Today's tasks
        </span>
        <span
          style={{
            fontSize: 12,
            color: '#94a3b8',
          }}
        >
          {counterText}
        </span>
      </div>

      {/* 2. ERROR BANNER (if any failure occurs) */}
      {errorMsg && (
        <div
          style={{
            color: '#ef4444',
            fontSize: 11,
            padding: '3px 0',
            marginBottom: 6,
            flexShrink: 0,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 3. TASK LIST: Simple rows with checkbox and title */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingRight: 2,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '24px 0' }}>
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '32px 0' }}>
            No tasks yet
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              onClick={(e) => handleToggle(task.id, e)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '6px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                backgroundColor: task.done ? 'rgba(17, 24, 39, 0.4)' : '#090d16',
                border: '1px solid #1e293b',
                transition: 'background-color 0.12s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = task.done ? 'rgba(30, 41, 59, 0.4)' : '#1e293b';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = task.done ? 'rgba(17, 24, 39, 0.4)' : '#090d16';
              }}
            >
              {/* Checkbox styled with old input colors */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  border: task.done ? '1px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: task.done ? '#0284c7' : '#090d16',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 700,
                  transition: 'all 0.12s ease',
                }}
              >
                {task.done && '✓'}
              </div>

              {/* Task title (Hindi / Unicode supported, wraps/truncates cleanly) */}
              <span
                style={{
                  fontSize: 13,
                  color: task.done ? '#64748b' : '#f8fafc',
                  textDecoration: task.done ? 'line-through' : 'none',
                  lineHeight: '1.35',
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

      {/* 4. FOOTER: Add task input and Close button */}
      <form
        onSubmit={handleAddTask}
        style={{
          marginTop: 10,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="Add task..."
          maxLength={200}
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          disabled={isAdding}
          style={{
            flex: 1,
            backgroundColor: '#090d16',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#f8fafc',
            padding: '6px 10px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim() || isAdding}
          style={{
            backgroundColor: '#0284c7',
            backgroundImage: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: newTaskTitle.trim() ? 'pointer' : 'default',
            opacity: newTaskTitle.trim() ? 1 : 0.6,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </form>
    </div>
  );
};
