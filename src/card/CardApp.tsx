import React, { useEffect, useState } from 'react';
import { TaskItem } from '../overlay/types';
import iconImg from '../../assets/icon.png';
import characterImg from '../../assets/placeholder-character.png';

export const CardApp: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);

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
      setErrorMsg(String(err?.message || err));
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setErrorMsg(null);
    try {
      if (!window.tasksApi?.toggle) {
        throw new Error('Task API unavailable');
      }
      await window.tasksApi.toggle(id);
      const list = await window.tasksApi.list();
      if (Array.isArray(list)) setTasks(list);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[Card] Failed to toggle task:', msg);
      setErrorMsg(`Could not update task: ${msg}`);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    try {
      if (!window.tasksApi?.remove) return;
      await window.tasksApi.remove(id);
      const list = await window.tasksApi.list();
      if (Array.isArray(list)) setTasks(list);
    } catch (err: any) {
      console.error('[Card] Failed to delete task:', err);
    }
  };

  const handleClose = () => {
    window.electronAPI?.notifyAction('done');
    window.electronAPI?.send('dismiss-spider');
  };

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.done).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const counterText = `${completedCount} of ${totalCount} done`;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(165deg, #0d121f 0%, #080c14 60%, #150a14 100%)',
        border: '1px solid rgba(225, 29, 72, 0.45)',
        borderRadius: 14,
        padding: '16px 18px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 0 20px rgba(225, 29, 72, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: '#f8fafc',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 1. HEADER: Spider-Man Brand & Counter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #be123c 0%, #090d16 80%)',
              border: '2px solid #e11d48',
              boxShadow: '0 0 12px rgba(225, 29, 72, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img
              src={iconImg}
              alt="Spider"
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 15,
                color: '#ffffff',
                letterSpacing: '-0.2px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>SpiderTasks</span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 8,
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#38bdf8',
                }}
              >
                LIVE
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              Today's Mission List
            </div>
          </div>
        </div>

        {/* Counter Badge */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: completedCount === totalCount && totalCount > 0 ? '#4ade80' : '#f43f5e',
            backgroundColor: completedCount === totalCount && totalCount > 0 ? 'rgba(74, 222, 128, 0.12)' : 'rgba(225, 29, 72, 0.12)',
            border: completedCount === totalCount && totalCount > 0 ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid rgba(225, 29, 72, 0.3)',
            borderRadius: 20,
            padding: '4px 10px',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
          }}
        >
          {counterText}
        </div>
      </div>

      {/* Mini Progress Bar */}
      {totalCount > 0 && (
        <div
          style={{
            width: '100%',
            height: 3,
            backgroundColor: '#1e293b',
            borderRadius: 2,
            overflow: 'hidden',
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              background: 'linear-gradient(90deg, #e11d48 0%, #f43f5e 50%, #38bdf8 100%)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}

      {/* 2. ERROR BANNER (if any failure occurs) */}
      {errorMsg && (
        <div
          style={{
            color: '#fca5a5',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            fontSize: 11,
            padding: '5px 8px',
            marginBottom: 8,
            flexShrink: 0,
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* 3. TASK LIST */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          paddingRight: 3,
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, padding: '28px 0' }}>
            🕸️ Loading missions...
          </div>
        ) : tasks.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 10px',
              textAlign: 'center',
            }}
          >
            <img
              src={characterImg}
              alt="Spider-Man"
              style={{
                width: 52,
                height: 52,
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 10px rgba(225, 29, 72, 0.4))',
                marginBottom: 8,
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 2 }}>
              Your web is clear!
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Add a new task below to stay productive.
            </div>
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
                cursor: 'pointer',
                backgroundColor: task.done ? 'rgba(15, 23, 42, 0.35)' : 'rgba(20, 28, 48, 0.65)',
                border: task.done ? '1px solid rgba(30, 41, 59, 0.4)' : '1px solid rgba(56, 189, 248, 0.2)',
                boxShadow: task.done ? 'none' : '0 2px 5px rgba(0, 0, 0, 0.25)',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = task.done
                  ? 'rgba(30, 41, 59, 0.5)'
                  : 'rgba(30, 41, 65, 0.85)';
                e.currentTarget.style.borderColor = task.done
                  ? 'rgba(51, 65, 85, 0.6)'
                  : 'rgba(225, 29, 72, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = task.done
                  ? 'rgba(15, 23, 42, 0.35)'
                  : 'rgba(20, 28, 48, 0.65)';
                e.currentTarget.style.borderColor = task.done
                  ? 'rgba(30, 41, 59, 0.4)'
                  : 'rgba(56, 189, 248, 0.2)';
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  border: task.done ? '1px solid #e11d48' : '1px solid #475569',
                  backgroundColor: task.done ? '#e11d48' : '#0a0f1d',
                  boxShadow: task.done ? '0 0 8px rgba(225, 29, 72, 0.6)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: 800,
                  transition: 'all 0.15s ease',
                }}
              >
                {task.done && '✓'}
              </div>

              {/* Task Title */}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: task.done ? 400 : 500,
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

              {/* Delete Button */}
              <button
                type="button"
                onClick={(e) => handleDelete(task.id, e)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  borderRadius: 4,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.backgroundColor = '#ef4444';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = '#64748b';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="Delete task"
              >
                ✕
              </button>
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
          gap: 7,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          placeholder="🕸️ Add a mission..."
          maxLength={200}
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          disabled={isAdding}
          style={{
            flex: 1,
            backgroundColor: '#0a0f1d',
            border: '1px solid #334155',
            borderRadius: 8,
            color: '#f8fafc',
            padding: '8px 12px',
            fontSize: 12,
            outline: 'none',
            userSelect: 'text',
            cursor: 'text',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#e11d48';
            e.currentTarget.style.boxShadow = '0 0 10px rgba(225, 29, 72, 0.35)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#334155';
            e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0, 0, 0, 0.4)';
          }}
        />
        <button
          type="submit"
          disabled={!newTaskTitle.trim() || isAdding}
          style={{
            background: newTaskTitle.trim()
              ? 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)'
              : '#1e293b',
            color: newTaskTitle.trim() ? '#ffffff' : '#64748b',
            border: newTaskTitle.trim() ? '1px solid #f43f5e' : '1px solid #334155',
            borderRadius: 8,
            padding: '8px 15px',
            fontSize: 12,
            fontWeight: 700,
            cursor: newTaskTitle.trim() ? 'pointer' : 'default',
            boxShadow: newTaskTitle.trim() ? '0 2px 10px rgba(225, 29, 72, 0.45)' : 'none',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={handleClose}
          style={{
            backgroundColor: '#0f172a',
            color: '#94a3b8',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '8px 13px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#1e293b';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#0f172a';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          Close
        </button>
      </form>
    </div>
  );
};
