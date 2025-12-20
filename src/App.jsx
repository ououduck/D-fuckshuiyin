// src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Eraser, 
  Upload, 
  Download, 
  RefreshCw, 
  Wand2, 
  Image as ImageIcon,
  Loader2
} from 'lucide-react';
import './App.css';

function App() {
  const canvasRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const [image, setImage] = useState(null);
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. 监听 OpenCV 加载状态
  useEffect(() => {
    const checkCv = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        setCvReady(true);
        clearInterval(checkCv);
      }
    }, 500);
    return () => clearInterval(checkCv);
  }, []);

  // 2. 图片上传
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // 稍微延时以确保容器渲染
        setTimeout(() => initCanvas(img), 50);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 3. 初始化 Canvas
  const initCanvas = (img) => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    
    // 限制最大尺寸防止手机崩溃 (1280px 足够清晰且处理快)
    const maxWidth = 1280; 
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      const scale = maxWidth / width;
      width = maxWidth;
      height = height * scale;
    }
    
    canvas.width = width;
    canvas.height = height;
    maskCanvas.width = width;
    maskCanvas.height = height;

    // 绘制原图
    ctx.drawImage(img, 0, 0, width, height);

    // 初始化蒙版全黑
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, width, height);
  };

  // 4. 坐标计算 (兼容移动端和PC)
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;

    // 触摸事件处理
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  // 5. 涂抹动作
  const startDrawing = (e) => {
    if(!image) return;
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current.getContext('2d');
    const maskCtx = maskCanvasRef.current.getContext('2d');
    ctx.beginPath();
    maskCtx.beginPath();
  };

  const draw = (e) => {
    if (!isDrawing || !image) return;
    
    // 关键：防止手机拖动页面
    if(e.cancelable) e.preventDefault(); 

    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    const maskCtx = maskCanvasRef.current.getContext('2d');

    // 绘制视觉反馈 (红色半透明)
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    // 绘制算法蒙版 (纯白)
    maskCtx.lineWidth = brushSize;
    maskCtx.lineCap = 'round';
    maskCtx.lineJoin = 'round';
    maskCtx.strokeStyle = 'white';
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
  };

  // 6. 执行去水印 (严格类型转换修复版)
  const processWatermark = () => {
    if (!image || !cvReady) return;
    setIsProcessing(true);

    // 使用 setTimeout 给 UI 渲染 loading 的机会
    setTimeout(() => {
      let src = null;
      let mask = null;
      let dst = null;
      let maskGray = null;

      try {
        const cv = window.cv;
        const canvas = canvasRef.current;
        
        // 1. 准备底图：重新从 image 绘制一份干净的（不含红线的）
        // 这里必须用临时 Canvas，否则会把刚才画的红线也算进图片里
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(image, 0, 0, canvas.width, canvas.height); 

        // 2. 读取图像
        src = cv.imread(tempCanvas);      // 此时 src 可能是 RGBA (4通道)
        mask = cv.imread(maskCanvasRef.current); // mask 也是 RGBA (4通道)
        dst = new cv.Mat();
        maskGray = new cv.Mat();

        // 3. 【关键修复】确保格式正确
        // 如果原图是 RGBA，转换为 RGB (3通道)，inpaint 更稳定
        if (src.channels() === 4) {
             cv.cvtColor(src, src, cv.COLOR_RGBA2RGB);
        }

        // 蒙版必须转换为单通道灰度图 (GRAY)
        cv.cvtColor(mask, maskGray, cv.COLOR_RGBA2GRAY, 0);

        // 再次二值化，确保只有纯黑和纯白，消除边缘模糊
        cv.threshold(maskGray, maskGray, 100, 255, cv.THRESH_BINARY);

        // 4. 执行修复
        // 半径设为 3 到 10 之间，取决于笔刷大小，5 是个平衡值
        cv.inpaint(src, maskGray, dst, 5, cv.INPAINT_TELEA);

        // 5. 显示结果
        cv.imshow(canvasRef.current, dst);

        // 6. 更新状态，支持连续涂抹
        const newUrl = canvasRef.current.toDataURL();
        const newImg = new Image();
        newImg.onload = () => setImage(newImg);
        newImg.src = newUrl;

        // 7. 重置蒙版
        const maskCtx = maskCanvasRef.current.getContext('2d');
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, canvas.width, canvas.height);

      } catch (err) {
        console.error("OpenCV Processing Error:", err);
        alert("处理失败，请重试或刷新页面。可能是图片格式不兼容。");
      } finally {
        // 8. 内存清理 (防止崩溃)
        if(src) src.delete();
        if(mask) mask.delete();
        if(dst) dst.delete();
        if(maskGray) maskGray.delete();
        setIsProcessing(false);
      }
    }, 100);
  };

  const resetCanvas = () => {
    if(image) initCanvas(image);
  };

  const downloadImage = () => {
    if(!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'clean-image.png';
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="app-container">
      {/* 头部 */}
      <header className="header">
        <div className="logo">
          <Eraser size={20} color="#3b82f6" />
          D-fuckshuiyin
        </div>
        <div className="status-badge">
          {cvReady ? "🟢 就绪" : "🟠 加载中..."}
        </div>
      </header>

      <div className="workspace">
        {/* 画布区域 */}
        <main className="canvas-area">
          <div className="canvas-wrapper">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
            />
            {/* 隐藏蒙版 */}
            <canvas ref={maskCanvasRef} style={{ display: 'none' }} />

            {!image && (
              <div className="placeholder">
                <ImageIcon size={48} style={{opacity: 0.3, marginBottom: 15}} />
                <p>点击下方“上传图片”开始</p>
              </div>
            )}

            {isProcessing && (
              <div className="loading-overlay">
                <div className="spinner"></div>
                <span>处理中...</span>
              </div>
            )}
          </div>
        </main>

        {/* 底部/侧边工具栏 */}
        <aside className="sidebar">
          
          <div className="tool-group file-ops">
            <div className="file-input-wrapper full-width">
              <button className="btn btn-secondary">
                <Upload size={18} /> 上传
              </button>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden-input"
              />
            </div>
            
            <button 
              className="btn btn-secondary icon-only" 
              onClick={downloadImage}
              disabled={!image}
              title="保存"
            >
              <Download size={18} />
            </button>
          </div>

          <div className="tool-group slider-group">
            <span style={{fontSize: '12px', color: '#888', whiteSpace: 'nowrap'}}>画笔: {brushSize}</span>
            <input 
              type="range" 
              min="5" 
              max="80" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))} 
            />
          </div>

          <div className="tool-group action-ops">
             <button 
              className="btn btn-secondary icon-only" 
              onClick={resetCanvas}
              disabled={!image}
              title="重置"
            >
              <RefreshCw size={18} />
            </button>

            <button 
              className="btn btn-primary" 
              onClick={processWatermark}
              disabled={!image || !cvReady || isProcessing}
            >
              {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              <span className="btn-text">开始去水印</span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
