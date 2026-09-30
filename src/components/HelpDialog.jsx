import React, { useEffect, useRef } from 'react';
import { HelpCircle, ShieldCheck, X } from 'lucide-react';

const STEPS = [
  '上传图片后选择「涂抹」，用画笔完整盖住水印本体及其边缘；红色只是标记，不会写入结果。',
  '涂错可用「橡皮」修正，或直接右键拖拽临时使用橡皮。',
  '点击「开始修复」执行图像修复，可反复涂抹与修复，直到满意后保存。',
  '放大后涂抹可提升边缘精度：双指缩放（移动端）或滚轮（桌面端）。',
];

const SHORTCUTS = [
  ['B / E / V', '涂抹 / 橡皮 / 移动'],
  ['[ / ]', '减小 / 增大画笔'],
  ['Enter', '开始修复'],
  ['Ctrl+Z / Ctrl+Shift+Z', '撤销 / 重做'],
  ['Ctrl+S', '保存结果'],
  ['H', '显示 / 隐藏标记'],
  ['0 / 1', '适应窗口 / 实际大小'],
  ['按住 \\', '对比原图'],
  ['空格（按住）', '临时拖动画面'],
  ['Ctrl+V', '粘贴剪贴板图片'],
];

export default function HelpDialog({ open, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog__head">
          <h2 id="help-title" className="dialog__title">
            <HelpCircle size={18} aria-hidden="true" />
            使用说明
          </h2>
          <button ref={closeRef} type="button" className="dialog__close" onClick={onClose} aria-label="关闭使用说明">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="dialog__body">
          <section>
            <h3 className="dialog__sub">操作流程</h3>
            <ol className="dialog__steps">
              {STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="dialog__sub">键盘快捷键</h3>
            <dl className="dialog__keys">
              {SHORTCUTS.map(([key, desc]) => (
                <div key={key} className="dialog__key-row">
                  <dt className="kbd">{key}</dt>
                  <dd>{desc}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="dialog__sub">能力边界</h3>
            <ul className="dialog__notes">
              <li>本工具不会自动识别水印，需要手动涂抹；小面积、与背景对比明显的水印效果最好。</li>
              <li>修复以蒙版以外的像素为依据，未涂到的水印边缘会在结果中残留并向内渗色。</li>
              <li>大面积或结构复杂的水印区域会出现涂抹痕迹，这是修复算法的固有限制。</li>
              <li>图片长边超过 1600px 会自动缩放后再处理，以兼顾移动端内存与速度。</li>
              <li>算法引擎约 10MB，首次加载视网络情况需要几秒到几十秒。</li>
              <li>请仅处理您拥有合法权利的图片。</li>
            </ul>
          </section>

          <section className="dialog__privacy">
            <ShieldCheck size={16} aria-hidden="true" />
            <p>
              图片的读取、涂抹与修复全部在浏览器本地完成，不会上传到任何服务器。仅 OpenCV.js
              算法引擎脚本需要从公共 CDN 下载一次，浏览器会缓存该文件。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
