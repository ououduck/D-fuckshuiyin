import React from 'react';
import { Brush, Download, Eraser, Hand, Loader2, Redo2, Undo2, Upload, Wand2 } from 'lucide-react';
import { BRUSH_MAX, BRUSH_MIN } from '../lib/draw';

const TOOLS = [
  { id: 'paint', label: '涂抹', icon: Brush, hint: '涂抹要修复的区域 (B)' },
  { id: 'erase', label: '橡皮', icon: Eraser, hint: '擦除标记 (E)，桌面端可右键拖拽' },
  { id: 'hand', label: '移动', icon: Hand, hint: '拖动画面，配合缩放做精细涂抹 (V)' },
];

function Action({ icon: Icon, label, onClick, disabled, hint }) {
  return (
    <button type="button" className="btn btn--ghost" onClick={onClick} disabled={disabled} title={hint || label} aria-label={label}>
      <Icon size={18} aria-hidden="true" />
      <span className="btn__text">{label}</span>
    </button>
  );
}

export default function Toolbar({
  hasImage,
  tool,
  onToolChange,
  brushSize,
  onBrushSize,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canProcess,
  processing,
  engineReady,
  onProcess,
  onUpload,
  onSave,
}) {
  return (
    <aside className="toolbar" aria-label="工具栏">
      <section className="tb tb--tools">
        <h2 className="tb__name">工具</h2>
        <div className="segmented" role="group" aria-label="编辑工具">
          {TOOLS.map((item) => {
            const Icon = item.icon;
            const active = tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`segmented__item${active ? ' is-active' : ''}`}
                onClick={() => onToolChange(item.id)}
                disabled={!hasImage}
                aria-pressed={active}
                title={item.hint}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="tb tb--brush">
        <h2 className="tb__name">画笔</h2>
        <label className="brush">
          <input
            type="range"
            min={BRUSH_MIN}
            max={BRUSH_MAX}
            step={2}
            value={brushSize}
            onInput={(event) => onBrushSize(Number(event.target.value))}
            onChange={(event) => onBrushSize(Number(event.target.value))}
            disabled={!hasImage}
            aria-label="画笔粗细"
          />
          <output className="brush__value">{brushSize}</output>
        </label>
      </section>

      <section className="tb tb--history">
        <h2 className="tb__name">历史</h2>
        <div className="tb__items">
          <Action icon={Undo2} label="撤销" onClick={onUndo} disabled={!canUndo} hint="撤销 (Ctrl+Z)" />
          <Action icon={Redo2} label="重做" onClick={onRedo} disabled={!canRedo} hint="重做 (Ctrl+Shift+Z)" />
        </div>
      </section>

      <section className="tb tb--file">
        <h2 className="tb__name">文件</h2>
        <div className="tb__items">
          <Action icon={Upload} label="上传" onClick={onUpload} hint="上传图片 (Ctrl+O)" />
          <Action icon={Download} label="保存" onClick={onSave} disabled={!hasImage} hint="保存结果 (Ctrl+S)" />
        </div>
      </section>

      <section className="tb tb--run">
        <button type="button" className="btn btn--primary" onClick={onProcess} disabled={processing}>
          {processing ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Wand2 size={18} aria-hidden="true" />}
          <span className="btn__text">{processing ? '修复中' : engineReady ? '开始修复' : '加载引擎并修复'}</span>
        </button>
        <p className="tb__hint">
          {!hasImage ? '请先导入图片' : processing ? '本地算法计算中' : canProcess ? '快捷键 Enter' : '先涂抹水印区域'}
        </p>
      </section>
    </aside>
  );
}
