import React from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';

export default function EmptyState({ onPick }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">
        <ImageIcon size={26} />
      </span>
      <h2 className="empty__title">拖入图片，或选择本地图片</h2>
      <p className="empty__desc">支持 PNG / JPEG / WebP；桌面端还可 Ctrl+V 粘贴图片</p>
      <button type="button" className="btn btn--primary empty__btn" onClick={onPick}>
        <Upload size={18} aria-hidden="true" />
        <span>选择图片</span>
      </button>
      <p className="empty__hint">图片只在浏览器本地读取与修复，不会上传到任何服务器</p>
    </div>
  );
}
