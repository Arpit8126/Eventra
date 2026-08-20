import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, LogOut, Info } from 'lucide-react';

export type DialogVariant = 'danger' | 'warning' | 'info';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const iconMap = {
    danger: <Trash2 size={22} />,
    warning: <LogOut size={22} />,
    info: <Info size={22} />,
  };

  const colorMap = {
    danger: 'var(--color-danger, #ef4444)',
    warning: '#f59e0b',
    info: 'var(--color-primary)',
  };

  const iconColor = colorMap[variant];
  const icon = iconMap[variant];

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      style={{ zIndex: 2000, backdropFilter: 'blur(8px)', background: 'rgba(0, 0, 0, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxWidth: '380px', 
          padding: '2rem 1.75rem', 
          borderRadius: 'var(--radius-lg, 16px)', 
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)', 
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1rem'
        }}
      >
        {/* Centered Glowing Icon Badge */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: `${iconColor}14`,
            border: `1.5px solid ${iconColor}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor,
            flexShrink: 0,
            marginBottom: '0.25rem',
            boxShadow: `0 6px 18px ${iconColor}12`
          }}
        >
          {icon}
        </div>

        {/* Title */}
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>
          {title}
        </h3>

        {/* Message */}
        <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)', fontSize: '0.93rem', lineHeight: 1.55 }}>
          {message}
        </p>

        {/* Actions Button Row (Full-width side-by-side) */}
        <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={onCancel}
            style={{ 
              flex: 1, 
              padding: '0.7rem 1rem', 
              background: 'transparent', 
              color: 'var(--text-main)', 
              border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-md, 10px)', 
              fontWeight: 600, 
              cursor: 'pointer', 
              transition: 'all 0.2s ease' 
            }}
          >
            {cancelLabel}
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '0.7rem 1rem',
              background: iconColor,
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md, 10px)',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: variant === 'danger' ? '0 8px 20px rgba(239, 68, 68, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------
// Toast notification for error/success messages (replaces alert())
// -----------------------------------------------------------------------

export type ToastVariant = 'error' | 'success' | 'info';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, variant = 'error', onClose }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const bgMap: Record<ToastVariant, string> = {
    error: 'var(--color-danger, #ef4444)',
    success: '#22c55e',
    info: 'var(--color-primary)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 3000,
        background: bgMap[variant],
        color: '#fff',
        padding: '0.85rem 1.25rem',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        fontSize: '0.9rem',
        fontWeight: 500,
        maxWidth: '340px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        animation: 'slideUp 0.25s ease',
      }}
    >
      <AlertTriangle size={17} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.8, fontSize: '1rem', padding: '0 0.25rem' }}
      >
        ✕
      </button>
    </div>
  );
};
