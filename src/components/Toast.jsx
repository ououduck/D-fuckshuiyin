import React from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

const ICONS = {
  error: AlertTriangle,
  success: Check,
  info: Info,
};

export default function Toast({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((item) => {
        const Icon = ICONS[item.type] || Info;
        return (
          <div key={item.id} className={`toast toast--${item.type}`}>
            <Icon size={16} className="toast__icon" aria-hidden="true" />
            <span className="toast__text">{item.text}</span>
            <button type="button" className="toast__close" onClick={() => onDismiss(item.id)} aria-label="关闭提示">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
