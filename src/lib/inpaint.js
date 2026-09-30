// 基于 OpenCV.js 的图像修复（inpaint）。
// 约定：baseCanvas 为不含标记痕迹的干净底图，maskCanvas 为透明底、不透明红色笔迹的涂抹蒙版。

import { MARK_GRAY_FLOOR } from './draw';

function countMaskPixels(cv, mask) {
  if (typeof cv.countNonZero !== 'function') return -1;
  try {
    return cv.countNonZero(mask);
  } catch (_) {
    return -1;
  }
}

export function inpaintCanvases(cv, options) {
  const {
    baseCanvas,
    maskCanvas,
    outCanvas,
    radius = 5,
    algorithm = 'telea',
    growMask = 1,
  } = options;

  const started = performance.now();
  let src = null;
  let mask = null;
  let gray = null;
  let grown = null;
  let kernel = null;
  let dst = null;

  try {
    src = cv.imread(baseCanvas);
    if (src.channels() === 4) cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
    else if (src.channels() === 1) cv.cvtColor(src, src, cv.COLOR_GRAY2RGB);

    mask = cv.imread(maskCanvas);
    gray = new cv.Mat();
    cv.cvtColor(mask, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.threshold(gray, gray, MARK_GRAY_FLOOR, 255, cv.THRESH_BINARY);

    if (growMask > 0 && typeof cv.dilate === 'function' && typeof cv.getStructuringElement === 'function') {
      // 水印普遍带半透明描边或阴影，只修复笔迹覆盖的像素会留一圈残影，因此略微扩张蒙版。
      const side = growMask * 2 + 1;
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(side, side));
      grown = new cv.Mat();
      cv.dilate(gray, grown, kernel, new cv.Point(-1, -1), 1);
      cv.threshold(grown, grown, 32, 255, cv.THRESH_BINARY);
    } else {
      grown = gray;
    }

    const marked = countMaskPixels(cv, grown);
    if (marked === 0) {
      outCanvas.getContext('2d').drawImage(baseCanvas, 0, 0);
      return { skipped: true, elapsedMs: performance.now() - started };
    }

    if (typeof cv.inpaint !== 'function') throw new Error('当前引擎构建不支持 inpaint');

    dst = new cv.Mat();
    const flag = algorithm === 'ns' && cv.INPAINT_NS !== undefined ? cv.INPAINT_NS : cv.INPAINT_TELEA;
    cv.inpaint(src, grown, dst, Math.max(1, radius), flag);
    cv.imshow(outCanvas, dst);

    return { skipped: false, elapsedMs: performance.now() - started, marked };
  } finally {
    [src, mask, gray, grown === gray ? null : grown, kernel, dst].forEach((mat) => {
      if (mat) {
        try {
          mat.delete();
        } catch (_) {
          /* 已被释放或不受控 */
        }
      }
    });
  }
}
