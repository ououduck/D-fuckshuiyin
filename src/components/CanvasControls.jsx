import React from 'react';
import { Eye, EyeOff, History, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

export default function CanvasControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  showMarks,
  onToggleMarks,
  comparing,
  onCompareStart,
  onCompareEnd,
  canRestore,
  onRestore,
  info,
}) {
  return (
    <div className="controls">
      {info?.width ? (
        <div className="hud hud--info">
          <span>
            {info.width}×{info.height}
          </span>
          {info.elapsed != null && <span className="hud__dim">· 修复 {info.elapsed} ms</span>}
        </div>
      ) : null}

      <div className="hud hud--group">
        <button
          type="button"
          className={`hud__btn${showMarks ? ' is-active' : ''}`}
          onClick={onToggleMarks}
          aria-pressed={showMarks}
          aria-label="显示或隐藏标记"
          title="显示或隐藏标记 (H)"
        >
          {showMarks ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          <span>标记</span>
        </button>
        <button
          type="button"
          className="hud__btn"
          onClick={onRestore}
          disabled={!canRestore}
          aria-label="还原为原图"
          title="还原为原图"
        >
          <RotateCcw size={16} aria-hidden="true" />
          <span>原图</span>
        </button>
      </div>

      <div className="hud hud--zoom" role="group" aria-label="缩放">
        <button type="button" className="hud__btn hud__btn--icon" onClick={onZoomOut} disabled={zoom <= 0.45} aria-label="缩小">
          <Minus size={16} aria-hidden="true" />
        </button>
        <span className="hud__pct">{Math.round(zoom * 100)}%</span>
        <button type="button" className="hud__btn hud__btn--icon" onClick={onZoomIn} disabled={zoom >= 7.9} aria-label="放大">
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="hud__btn hud__btn--icon" onClick={onZoomFit} aria-label="适应窗口">
          <Maximize2 size={16} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className={`hud__compare${comparing ? ' is-active' : ''}`}
        aria-label="按住对比原图"
        onPointerDown={(event) => {
          event.preventDefault();
          onCompareStart();
        }}
        onPointerUp={onCompareEnd}
        onPointerCancel={onCompareEnd}
        onPointerLeave={onCompareEnd}
        title="按住对比原图 (\)"
      >
        <History size={16} aria-hidden="true" />
        <span>按住对比</span>
      </button>
    </div>
  );
}
