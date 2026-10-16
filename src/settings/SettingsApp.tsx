import React, { useEffect, useState, useRef } from 'react';
import { TaskItem } from '../overlay/types';

export const SettingsApp: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch tasks on mount and subscribe to live changes
  useEffect(() => {
    async function loadTasks() {
      try {
        if (window.tasksApi?.list) {
          const list = await window.tasksApi.list();
          if (Array.isArray(list)) {
            setTasks(list);
          }
        } else {
          console.error('[UI] window.tasksApi.list not available on mount');
        }
      } catch (err: any) {
        console.error('[UI] Error loading tasks:', err?.message || err);
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
          // Re-fetch if payload wasn't passed directly
          window.tasksApi?.list().then((res) => {
            if (Array.isArray(res)) setTasks(res);
          });
        }
      });
      return () => unsub();
    }
  }, []);

  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTaskTitle.trim();
    console.log(`[UI] Add clicked: title length=${title.length}, isSubmitting=${isSubmitting}`);
    if (!title || isSubmitting) {
      console.log('[UI] Add skipped: empty title or already submitting');
      return;
    }

    setAddError(null);
    setIsSubmitting(true);
    try {
      console.log(`[UI] typeof window.tasksApi=${typeof window.tasksApi}, typeof window.tasksApi?.add=${typeof window.tasksApi?.add}`);
      if (!window.tasksApi?.add) {
        throw new Error('Task API not available — preload may not be loaded');
      }
      console.log('[Tasks] Calling tasks:add...');
      const result = await window.tasksApi.add(title);
      console.log(`[Tasks] tasks:add succeeded: id=${result?.id}, title_length=${result?.title?.length}`);
      setNewTaskTitle('');
      inputRef.current?.focus();
      // Safety net: re-fetch list in case onChanged is delayed or missed
      const list = await window.tasksApi.list();
      if (Array.isArray(list)) {
        setTasks(list);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[UI] Failed to add task:', msg);
      setAddError(`Could not save the task: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (!window.tasksApi?.remove) {
        console.error('[UI] tasks:remove — tasksApi not available');
        return;
      }
      console.log(`[Tasks] Calling tasks:remove id=${id}`);
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

  // Compute counters
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.done).length;
  const counterText = totalCount === 0 ? '0 tasks' : `${completedCount} of ${totalCount} done`;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', backgroundColor: '#090d16' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🕷️</div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Loading tasks...</div>
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
      {/* 1. HEADER BAR */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 22px',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a',
          flexShrink: 0,
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
              SpiderTasks
            </h1>
            <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0 0' }}>
              Manage your daily tasks
            </p>
          </div>
        </div>

        {/* Counter Badge */}
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
      </header>

      {/* 2. TASK AREA */}
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
        {/* ADD TASK INPUT & BUTTON */}
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
          {/* Visible error message under the input */}
          {addError && (
            <div
              style={{
                color: '#ef4444',
                fontSize: 12,
                padding: '4px 2px',
                lineHeight: '1.4',
              }}
            >
              {addError}
            </div>
          )}
        </div>

        {/* TASK LIST */}
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
                {/* Checkbox and Title */}
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

                {/* Delete (x) Button */}
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
    </div>
  );
};
