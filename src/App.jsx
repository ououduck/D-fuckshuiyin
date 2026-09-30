import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, HelpCircle } from 'lucide-react';
import Toolbar from './components/Toolbar';
import CanvasControls from './components/CanvasControls';
import EmptyState from './components/EmptyState';
import Toast from './components/Toast';
import HelpDialog from './components/HelpDialog';
import { loadOpenCV, ENGINE_VERSION } from './lib/opencv';
import { inpaintCanvases } from './lib/inpaint';
import { BRUSH_MAX, BRUSH_MIN, MARK_ALPHA, paintDot, paintSegment, paintStroke, strokeBounds } from './lib/draw';
import './App.css';

const MAX_EDGE = 1600;
const MAX_STROKES = 600;
const HISTORY_BYTES = 28 * 1024 * 1024;
const MIN_BASES = 2;
const MAX_BASES = 8;

function fitSize(width, height, maxEdge = MAX_EDGE) {
  if (!width || !height) return [1, 1];
  if (width <= maxEdge && height <= maxEdge) return [width, height];
  const scale = maxEdge / Math.max(width, height);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

function intersect(rect, bounds) {
  const x = Math.max(rect.x, 0);
  const y = Math.max(rect.y, 0);
  const right = Math.min(rect.x + rect.w, bounds.w);
  const bottom = Math.min(rect.y + rect.h, bounds.h);
  return { x, y, w: right - x, h: bottom - y };
}

function baseCapFor(width, height) {
  const bytesPerBase = Math.max(1, width * height * 4);
  return Math.max(MIN_BASES, Math.min(MAX_BASES, Math.floor(HISTORY_BYTES / bytesPerBase)));
}

function nameWithoutExt(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export default function App() {
  const viewRef = useRef(null);
  const stageRef = useRef(null);
  const areaRef = useRef(null);
  const markRef = useRef(null);
  const cursorRef = useRef(null);
  const fileInputRef = useRef(null);

  const hist = useRef({ bases: new Map(), entries: [{ baseId: -1, strokes: [] }], index: 0, nextId: 0, originalId: -1 });
  const strokesRef = useRef([]);
  const liveStrokeRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const viewRef2 = useRef({ scale: 1, x: 0, y: 0 });
  const showMarksRef = useRef(true);
  const compareRef = useRef(false);
  const baseIdRef = useRef(-1);
  const sourceRef = useRef({ name: 'image', type: 'image/png', scaled: false });
  const spaceRef = useRef(false);
  const toolRef = useRef('paint');
  const brushRef = useRef(24);
  const toastSeq = useRef(0);
  const hasImageRef = useRef(false);

  const [engine, setEngine] = useState({ phase: 'idle', percent: 0, message: '' });
  const [hasImage, setHasImage] = useState(false);
  const [tool, setTool] = useState('paint');
  const [brushSize, setBrushSize] = useState(24);
  const [processing, setProcessing] = useState(false);
  const [showMarks, setShowMarks] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canProcess, setCanProcess] = useState(false);
  const [atOriginal, setAtOriginal] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [comparing, setComparing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [toasts, setToasts] = useState([]);

  toolRef.current = tool;
  brushRef.current = brushSize;
  showMarksRef.current = showMarks;
  compareRef.current = comparing;

  const pushToast = useCallback((text, type = 'info', ttl = 4200) => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list.slice(-2), { id, text, type }]);
    if (ttl) setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), ttl);
    else setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 12000);
  }, []);

  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  // ---------- 画布合成 ----------

  const composite = useCallback((rect) => {
    const view = viewRef.current;
    if (!view || !view.width) return;
    const bounds = { w: view.width, h: view.height };
    const region = rect ? intersect(rect, bounds) : { x: 0, y: 0, ...bounds };
    if (region.w <= 0 || region.h <= 0) return;

    const ctx = view.getContext('2d');
    const original = hist.current.bases.get(hist.current.originalId);
    const current = hist.current.bases.get(baseIdRef.current);
    const source = compareRef.current ? original || current : current;

    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.w, region.h);
    ctx.clip();
    if (source) ctx.drawImage(source, region.x, region.y, region.w, region.h, region.x, region.y, region.w, region.h);
    else ctx.clearRect(region.x, region.y, region.w, region.h);
    const mark = markRef.current;
    if (showMarksRef.current && !compareRef.current && mark && mark.width === view.width) {
      ctx.globalAlpha = MARK_ALPHA;
      ctx.drawImage(mark, region.x, region.y, region.w, region.h, region.x, region.y, region.w, region.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, []);

  const replayMark = useCallback(() => {
    const mark = markRef.current;
    if (!mark) return;
    const ctx = mark.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, mark.width, mark.height);
    strokesRef.current.forEach((stroke) => paintStroke(ctx, stroke));
  }, []);

  const syncFlags = useCallback(() => {
    const h = hist.current;
    setCanUndo(h.index > 0);
    setCanRedo(h.index < h.entries.length - 1);
    setAtOriginal(h.entries[h.index]?.baseId === h.originalId);
    setCanProcess(strokesRef.current.some((stroke) => stroke.mode === 'paint'));
  }, []);

  // ---------- 历史 ----------

  const trimHistory = useCallback(() => {
    const h = hist.current;
    const view = viewRef.current;
    const cap = baseCapFor(view?.width || 1, view?.height || 1);

    // 释放已无条目引用的底图快照。必须在丢弃条目的同一步骤里回收，
    // 否则快照数量不会随循环下降，历史会被一直丢弃到只剩当前项。
    const prune = () => {
      const keep = new Set([h.originalId, h.entries[h.index]?.baseId]);
      h.entries.forEach((entry) => keep.add(entry.baseId));
      Array.from(h.bases.keys()).forEach((id) => {
        if (keep.has(id)) return;
        const canvas = h.bases.get(id);
        canvas.width = 0;
        canvas.height = 0;
        h.bases.delete(id);
      });
    };

    while (h.entries.length > 60 && h.index > 1) {
      h.entries.shift();
      h.index -= 1;
    }
    let guard = 0;
    while (h.bases.size > cap && h.index > 0 && guard++ < 200) {
      h.entries.shift();
      h.index -= 1;
      prune();
    }
    prune();
  }, []);

  const pushEntry = useCallback((baseId) => {
    const h = hist.current;
    h.entries = h.entries.slice(0, h.index + 1);
    h.entries.push({ baseId, strokes: strokesRef.current.slice() });
    h.index = h.entries.length - 1;
    trimHistory();
    syncFlags();
  }, [trimHistory, syncFlags]);

  const applyEntry = useCallback((index) => {
    const h = hist.current;
    const entry = h.entries[index];
    if (!entry) return;
    h.index = index;
    baseIdRef.current = entry.baseId;
    strokesRef.current = entry.strokes.slice();
    replayMark();
    composite();
    syncFlags();
  }, [replayMark, composite, syncFlags]);

  const undo = useCallback(() => {
    if (hist.current.index <= 0) return;
    applyEntry(hist.current.index - 1);
  }, [applyEntry]);

  const redo = useCallback(() => {
    const h = hist.current;
    if (h.index >= h.entries.length - 1) return;
    applyEntry(h.index + 1);
  }, [applyEntry]);

  const restoreOriginal = useCallback(() => {
    const h = hist.current;
    const index = h.entries.findIndex((entry, i) => i <= h.index && entry.baseId === h.originalId);
    if (index >= 0) {
      applyEntry(index);
    } else {
      // 原始版本已被历史淘汰：原始快照常驻内存，据此新建一条记录，保证「还原」始终有效。
      strokesRef.current = [];
      baseIdRef.current = h.originalId;
      replayMark();
      pushEntry(h.originalId);
      composite();
    }
    pushToast('已还原为原图', 'info', 2200);
  }, [applyEntry, pushEntry, replayMark, composite, pushToast]);

  // ---------- 视图缩放与平移 ----------

  const layoutMetrics = useCallback(() => {
    const stage = stageRef.current;
    const view = viewRef.current;
    if (!stage || !view) return null;
    const rect = view.getBoundingClientRect();
    const layoutWidth = stage.clientWidth || 1;
    const layoutHeight = stage.clientHeight || 1;
    const scale = rect.width / layoutWidth || 1;
    const container = stage.parentElement.getBoundingClientRect();
    return {
      scale,
      layoutWidth,
      layoutHeight,
      originX: container.left + stage.offsetLeft,
      originY: container.top + stage.offsetTop,
    };
  }, []);

  const applyView = useCallback((next) => {
    const stage = stageRef.current;
    viewRef2.current = next;
    setZoom(next.scale);
    if (!stage) return;
    stage.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  }, []);

  const clampView = useCallback(
    (next) => {
      const metrics = layoutMetrics();
      const view = viewRef.current;
      if (!metrics || !view) return next;
      const scaledW = metrics.layoutWidth * next.scale;
      const scaledH = metrics.layoutHeight * next.scale;
      const container = stageRef.current?.parentElement?.getBoundingClientRect();
      const cw = (container?.width || 0) - 8;
      const ch = (container?.height || 0) - 8;
      const limit = (size, viewSize) => {
        if (size <= viewSize) return { min: (viewSize - size) / 2, max: (viewSize - size) / 2 };
        return { min: viewSize - size - 40, max: 40 };
      };
      const lx = limit(scaledW, cw > 0 ? cw : scaledW);
      const ly = limit(scaledH, ch > 0 ? ch : scaledH);
      return { ...next, x: Math.min(lx.max, Math.max(lx.min, next.x)), y: Math.min(ly.max, Math.max(ly.min, next.y)) };
    },
    [layoutMetrics]
  );

  const resetView = useCallback(() => {
    applyView({ scale: 1, x: 0, y: 0 });
  }, [applyView]);

  // 按 contain 规则显式设定 stage 尺寸，保证任意视口比例下图片完整可见且不变形。
  const fitStage = useCallback(() => {
    const stage = stageRef.current;
    const area = areaRef.current;
    const view = viewRef.current;
    if (!stage || !area || !view || !view.width) return;
    const style = getComputedStyle(area);
    const availW = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (availW < 1 || availH < 1) return;
    const fit = Math.min(availW / view.width, availH / view.height);
    stage.style.width = `${(view.width * fit).toFixed(2)}px`;
    stage.style.height = `${(view.height * fit).toFixed(2)}px`;
  }, []);

  const zoomAt = useCallback(
    (nextScale, clientX, clientY) => {
      const metrics = layoutMetrics();
      if (!metrics) return;
      const current = viewRef2.current;
      const scale = Math.max(0.4, Math.min(8, nextScale));
      if (scale === current.scale) return;
      const cx = clientX == null ? metrics.originX + (metrics.layoutWidth * current.scale) / 2 : clientX;
      const cy = clientY == null ? metrics.originY + (metrics.layoutHeight * current.scale) / 2 : clientY;
      const u = ((cx - (metrics.originX + current.x)) / (metrics.layoutWidth * current.scale)) * metrics.layoutWidth;
      const v = ((cy - (metrics.originY + current.y)) / (metrics.layoutHeight * current.scale)) * metrics.layoutHeight;
      applyView(clampView({ scale, x: cx - metrics.originX - u * scale, y: cy - metrics.originY - v * scale }));
    },
    [layoutMetrics, applyView, clampView]
  );

  const zoomBy = useCallback(
    (factor) => {
      const metrics = layoutMetrics();
      if (!metrics) return;
      zoomAt(viewRef2.current.scale * factor, null, null);
    },
    [layoutMetrics, zoomAt]
  );

  // ---------- 图片导入 ----------

  const prepare = useCallback(
    (img, meta) => {
      const view = viewRef.current;
      const mark = markRef.current;
      if (!view || !mark) return;

      const [width, height] = fitSize(img.width || img.naturalWidth, img.height || img.naturalHeight);
      const scaled = width !== (img.width || width) || height !== (img.height || height);

      view.width = width;
      view.height = height;
      mark.width = width;
      mark.height = height;
      const markCtx = mark.getContext('2d');
      markCtx.setTransform(1, 0, 0, 1, 0, 0);
      markCtx.clearRect(0, 0, width, height);

      const base = document.createElement('canvas');
      base.width = width;
      base.height = height;
      const bctx = base.getContext('2d');
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(img, 0, 0, width, height);

      hist.current.bases.forEach((canvas) => {
        canvas.width = 0;
        canvas.height = 0;
      });
      hist.current.bases = new Map([[0, base]]);
      hist.current.nextId = 1;
      hist.current.originalId = 0;
      hist.current.entries = [{ baseId: 0, strokes: [] }];
      hist.current.index = 0;
      baseIdRef.current = 0;
      strokesRef.current = [];
      sourceRef.current = { ...meta, scaled };

      setHasImage(true);
      setInfo({ width, height, elapsed: null });
      resetView();
      fitStage();
      composite();
      syncFlags();
      if (scaled) pushToast(`原图较大，已缩放至 ${width}×${height} 处理`, 'info');
    },
    [composite, syncFlags, pushToast, resetView, fitStage]
  );

  const importFile = useCallback(
    (file) => {
      if (!file) return;
      if (!/^image\//.test(file.type)) {
        pushToast('请选择图片文件', 'error');
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        prepare(img, { name: nameWithoutExt(file.name || 'image'), type: file.type || 'image/png' });
        pushToast('图片已载入，涂抹时请完整盖住水印及其边缘', 'success', 3200);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        pushToast('无法读取该图片，可能是不受支持的格式（如 HEIC）', 'error');
      };
      img.src = url;
    },
    [prepare, pushToast]
  );

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  // ---------- 涂抹 ----------

  const canvasPoint = useCallback((clientX, clientY) => {
    const view = viewRef.current;
    if (!view || !view.width) return null;
    const rect = view.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (clientX - rect.left) * (view.width / rect.width),
      y: (clientY - rect.top) * (view.height / rect.height),
    };
  }, []);

  const toCanvasSize = useCallback((cssSize) => {
    const view = viewRef.current;
    if (!view) return cssSize;
    const rect = view.getBoundingClientRect();
    if (!rect.width) return cssSize;
    return cssSize * (view.width / rect.width);
  }, []);

  const markCtx = () => markRef.current?.getContext('2d') || null;

  const beginStroke = (event) => {
    const view = viewRef.current;
    if (!view || !view.width || processing) return;
    const point = canvasPoint(event.clientX, event.clientY);
    const ctx = markCtx();
    if (!point || !ctx) return;

    const mode = event.button === 2 || toolRef.current === 'erase' ? 'erase' : 'paint';
    const stroke = { mode, size: toCanvasSize(brushRef.current), points: [[point.x, point.y]] };
    liveStrokeRef.current = stroke;
    paintDot(ctx, stroke, point);
    composite(strokeBounds(point, point, stroke.size));
  };

  const moveStroke = (event) => {
    const stroke = liveStrokeRef.current;
    const ctx = markCtx();
    if (!stroke || !ctx) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const from = stroke.points[stroke.points.length - 1];
    const dx = point.x - from[0];
    const dy = point.y - from[1];
    // 过滤亚像素抖动，避免记录海量无效点拖慢合成与回放。
    if (dx * dx + dy * dy < 1.5) return;

    paintSegment(ctx, stroke, from, [point.x, point.y]);
    stroke.points.push([point.x, point.y]);
    composite(strokeBounds({ x: from[0], y: from[1] }, point, stroke.size));
  };

  const endStroke = () => {
    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (!stroke) return;
    if (strokesRef.current.length >= MAX_STROKES) {
      pushToast('标记笔迹过多，请先执行修复', 'error');
      replayMark();
      composite();
      return;
    }
    strokesRef.current.push(stroke);
    pushEntry(baseIdRef.current);
  };

  // ---------- 画笔光标 ----------

  const moveCursor = (event) => {
    const cursor = cursorRef.current;
    const area = areaRef.current;
    if (!cursor || !area) return;
    if (!event || toolRef.current === 'hand' || !hasImage || event.pointerType === 'touch') {
      cursor.style.opacity = '0';
      return;
    }
    const rect = area.getBoundingClientRect();
    const viewRect = viewRef.current?.getBoundingClientRect();
    const display = viewRect && viewRef.current ? viewRect.width / viewRef.current.width : 1;
    const size = Math.max(6, brushRef.current * display);
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    cursor.style.transform = `translate3d(${event.clientX - rect.left - size / 2}px, ${event.clientY - rect.top - size / 2}px, 0)`;
    cursor.style.opacity = toolRef.current === 'erase' ? '0.9' : '0.8';
  };

  // ---------- 指针事件 ----------

  const onPointerDown = (event) => {
    if (!hasImage) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (_) {
      /* 某些浏览器对已释放的 pointer 会抛错 */
    }

    if (pointersRef.current.size === 2 && event.pointerType === 'touch') {
      // 第二个手指落下视为缩放手势，结束正在进行的涂抹。
      endStroke();
      const points = Array.from(pointersRef.current.values());
      const [a, b] = points;
      gestureRef.current = {
        id: event.pointerId,
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef2.current.scale,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...viewRef2.current },
      };
      return;
    }

    if (pointersRef.current.size > 2) return;

    if (event.button === 1 || toolRef.current === 'hand' || spaceRef.current) {
      gestureRef.current = { pan: true, id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...viewRef2.current } };
      return;
    }
    beginStroke(event);
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) {
      if (hasImage && toolRef.current !== 'hand') moveCursor(event);
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;

    if (gesture && gesture.distance != null && pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values());
      const [a, b] = points;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = gesture.distance ? next / gesture.distance : 1;
      const metrics = layoutMetrics();
      if (!metrics) return;
      const scale = Math.max(0.4, Math.min(8, gesture.scale * ratio));
      const u =
        ((gesture.mid.x - (metrics.originX + gesture.view.x)) / (metrics.layoutWidth * gesture.view.scale)) * metrics.layoutWidth;
      const v =
        ((gesture.mid.y - (metrics.originY + gesture.view.y)) / (metrics.layoutHeight * gesture.view.scale)) * metrics.layoutHeight;
      applyView(
        clampView({
          scale,
          x: mid.x - metrics.originX - u * scale + (mid.x - gesture.mid.x),
          y: mid.y - metrics.originY - v * scale + (mid.y - gesture.mid.y),
        })
      );
      return;
    }

    if (gesture?.pan && gesture.id === event.pointerId) {
      applyView(
        clampView({
          ...gesture.view,
          x: gesture.view.x + (event.clientX - gesture.x),
          y: gesture.view.y + (event.clientY - gesture.y),
        })
      );
      return;
    }

    if (liveStrokeRef.current) moveStroke(event);
    else if (hasImage) moveCursor(event);
  };

  const endPointer = (event) => {
    if (!pointersRef.current.has(event.pointerId)) {
      if (liveStrokeRef.current) endStroke();
      return;
    }
    pointersRef.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_) {
      /* ignore */
    }
    if (pointersRef.current.size < 2 && gestureRef.current?.distance != null) gestureRef.current = null;
    if (gestureRef.current?.pan && gestureRef.current.id === event.pointerId) gestureRef.current = null;
    if (liveStrokeRef.current && pointersRef.current.size === 0) endStroke();
    moveCursor(null);
  };

  const onDoubleClick = (event) => {
    if (!hasImage) return;
    const at100 = viewRef2.current.scale > 1.6;
    zoomAt(at100 ? 1 : 2.5, event.clientX, event.clientY);
  };

  // ---------- 修复 ----------

  const process = useCallback(async () => {
    if (processing) return;
    if (!hasImage) {
      pushToast('请先导入图片', 'info', 2600);
      return;
    }
    if (!strokesRef.current.some((stroke) => stroke.mode === 'paint')) {
      pushToast('请先涂抹标记需要修复的区域', 'info', 2600);
      return;
    }
    let cv = null;
    try {
      setEngine((state) => (state.phase === 'ready' ? state : { ...state, phase: 'loading', percent: state.percent }));
      cv = await loadOpenCV({
        onProgress: (progress) =>
          setEngine((state) => (state.phase === 'ready' ? state : { ...state, phase: 'loading', percent: progress.percent ?? state.percent })),
      });
    } catch (error) {
      setEngine({ phase: 'error', percent: 0, message: error.message });
      pushToast(`${error.message}`, 'error', 7000);
      return;
    }

    setProcessing(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const view = viewRef.current;
    const base = hist.current.bases.get(baseIdRef.current);
    const out = document.createElement('canvas');
    out.width = view.width;
    out.height = view.height;
    const radius = Math.max(3, Math.min(12, Math.round(toCanvasSize(brushRef.current) / 3)));

    try {
      const result = inpaintCanvases(cv, {
        baseCanvas: base,
        maskCanvas: markRef.current,
        outCanvas: out,
        radius,
        growMask: 1,
      });
      if (result.skipped) {
        out.width = 0;
        out.height = 0;
        pushToast('标记区域为空，未做修改', 'info');
        return;
      }
      const id = hist.current.nextId++;
      hist.current.bases.set(id, out);
      strokesRef.current = [];
      replayMark();
      baseIdRef.current = id;
      pushEntry(id);
      composite();
      setInfo((state) => ({ ...(state || {}), width: view.width, height: view.height, elapsed: Math.round(result.elapsedMs) }));
      pushToast(`修复完成，用时 ${Math.round(result.elapsedMs)} ms`, 'success', 3000);
    } catch (error) {
      out.width = 0;
      out.height = 0;
      console.error(error);
      pushToast(`修复失败：${error.message || '图像数据异常'}`, 'error', 7000);
    } finally {
      setProcessing(false);
    }
  }, [hasImage, processing, composite, pushEntry, replayMark, pushToast, toCanvasSize]);

  const save = useCallback(() => {
    const base = hist.current.bases.get(baseIdRef.current);
    if (!base) {
      pushToast('还没有可保存的图片', 'info');
      return;
    }
    const jpeg = /jpe?g/i.test(sourceRef.current.type);
    const href = base.toDataURL(jpeg ? 'image/jpeg' : 'image/png', jpeg ? 0.92 : undefined);
    const link = document.createElement('a');
    const filename = `${sourceRef.current.name || 'image'}-repaired.${jpeg ? 'jpg' : 'png'}`;
    link.download = filename;
    link.href = href;
    document.body.appendChild(link);
    link.click();
    link.remove();
    pushToast(`已导出 ${filename}`, 'success', 3000);
  }, [pushToast]);

  // ---------- 引擎加载 ----------

  useEffect(() => {
    let cancelled = false;
    let idleHandle = null;
    let timer = null;
    const start = () => {
      if (cancelled) return;
      loadOpenCV({
        onProgress: (progress) =>
          setEngine((state) =>
            state.phase === 'ready' ? state : { phase: 'loading', percent: progress.percent ?? state.percent, message: '' }
          ),
      })
        .then(() => {
          if (!cancelled) setEngine({ phase: 'ready', percent: 100, message: '' });
        })
        .catch((error) => {
          if (!cancelled) setEngine({ phase: 'error', percent: 0, message: error.message });
        });
    };
    // 首屏绘制后再下载约 10MB 的引擎，避免抢占移动端的首屏时间。
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(() => {
        timer = setTimeout(start, 120);
      });
    } else {
      timer = setTimeout(start, 400);
    }
    return () => {
      cancelled = true;
      if (idleHandle != null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const retryEngine = useCallback(() => {
    setEngine({ phase: 'idle', percent: 0, message: '' });
    loadOpenCV({
      onProgress: (progress) => setEngine({ phase: 'loading', percent: progress.percent ?? 0, message: '' }),
    })
      .then(() => setEngine({ phase: 'ready', percent: 100, message: '' }))
      .catch((error) => setEngine({ phase: 'error', percent: 0, message: error.message }));
  }, []);

  // ---------- 导入：文件、拖拽、粘贴 ----------

  const onFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    importFile(file);
  };

  useEffect(() => {
    const onPaste = (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            importFile(file);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [importFile]);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const onWheel = (event) => {
      if (!hasImageRef.current) return;
      event.preventDefault();
      const step = event.deltaY > 0 ? 0.9 : 1.1;
      zoomAt(viewRef2.current.scale * step, event.clientX, event.clientY);
    };
    area.addEventListener('wheel', onWheel, { passive: false });
    return () => area.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    hasImageRef.current = hasImage;
  }, [hasImage]);

  // 载入后浮层才挂载，画布区高度可能随之变化，下一帧再校正一次尺寸。
  useEffect(() => {
    if (!hasImage) return undefined;
    const id = requestAnimationFrame(fitStage);
    return () => cancelAnimationFrame(id);
  }, [hasImage, fitStage]);

  useEffect(() => {
    const onResize = () => {
      fitStage();
      composite();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [composite, fitStage]);

  // ---------- 快捷键 ----------

  useEffect(() => {
    const isEditable = (node) => node && /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHelpOpen(false);
        return;
      }
      if (event.repeat && event.key === ' ') return;
      if (isEditable(event.target) || helpOpen) return;

      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (meta && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (meta && key === 's') {
        event.preventDefault();
        save();
        return;
      }
      if (meta && key === 'o') {
        event.preventDefault();
        openFilePicker();
        return;
      }
      if (meta) return;

      switch (key) {
        case 'b':
          setTool('paint');
          break;
        case 'e':
          setTool('erase');
          break;
        case 'v':
          setTool('hand');
          break;
        case 'h':
          setShowMarks((value) => !value);
          break;
        case 'enter':
          event.preventDefault();
          process();
          break;
        case '[':
          setBrushSize((size) => Math.max(BRUSH_MIN, size - 4));
          break;
        case ']':
          setBrushSize((size) => Math.min(BRUSH_MAX, size + 4));
          break;
        case '0':
          resetView();
          break;
        case '1':
          zoomAt(1, null, null);
          break;
        case '\\':
          setComparing(true);
          break;
        case ' ':
          event.preventDefault();
          spaceRef.current = true;
          break;
        case '?':
          setHelpOpen(true);
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event) => {
      if (event.key === '\\') setComparing(false);
      if (event.key === ' ') spaceRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    const onBlur = () => {
      spaceRef.current = false;
      setComparing(false);
    };
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [undo, redo, save, process, resetView, zoomAt, openFilePicker, helpOpen]);

  useEffect(() => {
    composite();
  }, [showMarks, comparing, composite]);

  const engineLabel = useMemo(() => {
    if (engine.phase === 'ready') return `引擎就绪 · OpenCV ${ENGINE_VERSION}`;
    if (engine.phase === 'loading') return `引擎加载中 ${Math.round(engine.percent)}%`;
    if (engine.phase === 'error') return '引擎加载失败';
    return '引擎准备中';
  }, [engine]);

  const statusTone = engine.phase === 'ready' ? 'is-ready' : engine.phase === 'error' ? 'is-error' : 'is-busy';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand__mark">
            <Eraser size={18} aria-hidden="true" />
          </span>
          <span className="brand__name">D-fuckshuiyin</span>
          <span className="brand__tag">本地处理 · 不上传</span>
        </div>
        <div className="header__actions">
          <button
            type="button"
            className={`status status--${statusTone}`}
            onClick={engine.phase === 'error' ? retryEngine : undefined}
            title={engine.phase === 'error' ? `${engine.message}（点击重试）` : engineLabel}
          >
            <span className="status__dot" aria-hidden="true" />
            <span className="status__text">{engineLabel}</span>
          </button>
          <button type="button" className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="使用说明">
            <HelpCircle size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="workspace">
        <div
          className={`canvas-area tool-${tool}${dragActive ? ' is-dragging' : ''}`}
          ref={areaRef}
          onDragOver={(event) => {
            event.preventDefault();
            if (!dragActive) setDragActive(true);
          }}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget)) setDragActive(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const file = event.dataTransfer?.files?.[0];
            if (file) importFile(file);
          }}
        >
          {!hasImage && <EmptyState onPick={openFilePicker} />}

          <div className="stage" ref={stageRef} style={{ visibility: hasImage ? 'visible' : 'hidden' }}>
            <canvas
              ref={viewRef}
              className="view"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onLostPointerCapture={endPointer}
              onDoubleClick={onDoubleClick}
              onContextMenu={(event) => event.preventDefault()}
            />
            <canvas ref={markRef} className="mark" aria-hidden="true" />
          </div>

          {hasImage && (
            <>
              <CanvasControls
                zoom={zoom}
                onZoomIn={() => zoomBy(1.25)}
                onZoomOut={() => zoomBy(0.8)}
                onZoomFit={resetView}
                showMarks={showMarks}
                onToggleMarks={() => setShowMarks((value) => !value)}
                comparing={comparing}
                onCompareStart={() => setComparing(true)}
                onCompareEnd={() => setComparing(false)}
                canRestore={!atOriginal}
                onRestore={restoreOriginal}
                info={info}
              />
              <div className="brush-cursor" ref={cursorRef} aria-hidden="true" />
            </>
          )}

          {processing && (
            <div className="processing">
              <div className="processing__card">
                <div className="spinner" aria-hidden="true" />
                <p className="processing__title">正在修复</p>
                <p className="processing__hint">算法在本地计算，请稍候</p>
              </div>
            </div>
          )}
        </div>

        <Toolbar
          hasImage={hasImage}
          tool={tool}
          onToolChange={setTool}
          brushSize={brushSize}
          onBrushSize={setBrushSize}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          canProcess={canProcess && !processing}
          processing={processing}
          engineReady={engine.phase === 'ready'}
          onProcess={process}
          onUpload={openFilePicker}
          onSave={save}
        />
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={onFileChange} tabIndex={-1} aria-hidden="true" />
      <Toast items={toasts} onDismiss={dismissToast} />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
