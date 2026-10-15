import React from 'react';
import { MOTION_CONFIG } from './config';

interface NoteCardProps {
  message: string;
  springProgress: number; // 0 to 1
  opacity: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onDone: () => void;
  onSnooze: () => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  message,
  springProgress,
  opacity,
  isMuted,
  onToggleMute,
  onDone,
  onSnooze,
}) => {
  const handleMouseEnter = () => {
    window.electronAPI?.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    window.electronAPI?.setIgnoreMouseEvents(true, { forward: true });
  };

  if (opacity <= 0.01) return null;

  // Spring slide-in: starts 30px to the right and slides into place with natural spring overshoot
  const slideOffsetX = (1 - springProgress) * 30;
  const cardScale = 0.94 + 0.06 * springProgress;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        width: 300,
        backgroundColor: '#0f172a',
        backgroundImage: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: '16px',
        padding: '18px 20px',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.75), 0 0 25px rgba(2, 132, 199, 0.25)',
        color: '#f8fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        transform: `translateX(${slideOffsetX}px) scale(${cardScale})`,
        opacity: opacity,
        pointerEvents: opacity > 0.3 ? 'auto' : 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header: Label Badge + Mute Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#38bdf8',
              boxShadow: '0 0 8px #38bdf8',
              display: 'inline-block',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              color: '#38bdf8',
              textTransform: 'uppercase',
            }}
          >
            {MOTION_CONFIG.noteCard.label}
          </span>
        </div>

        {/* Audio Mute/Unmute Toggle */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
          style={{
            background: isMuted ? 'rgba(51, 65, 85, 0.5)' : 'rgba(2, 132, 199, 0.25)',
            border: isMuted ? '1px solid #475569' : '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '9999px',
            color: isMuted ? '#94a3b8' : '#38bdf8',
            cursor: 'pointer',
            padding: '3px 9px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s ease',
          }}
        >
          <span>{isMuted ? '🔇' : '🔊'}</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{isMuted ? 'Muted' : 'Voice'}</span>
        </button>
      </div>

      {/* Reminder Message Text */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          lineHeight: '1.45',
          color: '#ffffff',
          letterSpacing: '-0.2px',
        }}
      >
        {message}
      </div>

      {/* Action Buttons: Done and Snooze (5 minutes) */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
        <button
          onClick={onDone}
          style={{
            flex: 1,
            padding: '10px 14px',
            fontSize: '13px',
            fontWeight: 700,
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#16a34a',
            backgroundImage: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: '#ffffff',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(34, 197, 94, 0.45)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.35)';
          }}
        >
          <span>✓</span>
          <span>{MOTION_CONFIG.noteCard.doneButtonText}</span>
        </button>

        <button
          onClick={onSnooze}
          style={{
            flex: 1.1,
            padding: '10px 12px',
            fontSize: '13px',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            color: '#e2e8f0',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.14)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
          }}
        >
          <span>⏱️</span>
          <span>{MOTION_CONFIG.noteCard.snoozeButtonText}</span>
        </button>
      </div>
    </div>
  );
};
