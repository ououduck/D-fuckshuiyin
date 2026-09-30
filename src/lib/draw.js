// 标记蒙版的绘制约定：
// 同一张画布既是显示用的红色半透明标记，也是算法用的蒙版，
// 因此描边必须使用不透明的 MARK_RGB（OpenCV 转灰度后恒为 116，远高于 MARK_GRAY_FLOOR 即可分离）。

export const MARK_RGB = '#ff3b30';
export const MARK_ALPHA = 0.5;
export const MARK_GRAY_FLOOR = 32;
export const BRUSH_MIN = 4;
export const BRUSH_MAX = 160;

function applyStrokeStyle(ctx, stroke) {
  const erase = stroke.mode === 'erase';
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = erase ? 'rgba(0,0,0,1)' : MARK_RGB;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function paintStroke(ctx, stroke) {
  const points = stroke.points;
  if (!points.length) return;
  ctx.save();
  applyStrokeStyle(ctx, stroke);
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }
  ctx.restore();
}

export function paintSegment(ctx, stroke, from, to) {
  ctx.save();
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
  ctx.restore();
}

export function paintDot(ctx, stroke, point) {
  ctx.save();
  applyStrokeStyle(ctx, stroke);
  ctx.beginPath();
  ctx.arc(point.x, point.y, stroke.size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function strokeBounds(from, to, size) {
  const pad = size / 2 + 1;
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}
