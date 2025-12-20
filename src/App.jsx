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
        setTimeout(() => initCanvas(img), 10);
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

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    
    // 限制最大渲染尺寸，提升性能
    const maxWidth = 1920; 
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

  // 4. 坐标计算
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

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
    if(e.type === 'touchmove') e.preventDefault(); 

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

  // 6. 执行去水印 (OpenCV)
  const processWatermark = () => {
    if (!image || !cvReady) return;
    setIsProcessing(true);

    setTimeout(() => {
      try {
        const cv = window.cv;
        const canvas = canvasRef.current;
        
        // 重新获取纯净底图 (因为当前 canvas 上有红线，不能直接用来做 src)
        const tempCtx = document.createElement('canvas').getContext('2d');
        tempCtx.canvas.width = canvas.width;
        tempCtx.canvas.height = canvas.height;
        tempCtx.drawImage(image, 0, 0, canvas.width, canvas.height); 

        let src = cv.imread(tempCtx.canvas);
        let mask = cv.imread(maskCanvasRef.current);
        let dst = new cv.Mat();

        cv.cvtColor(mask, mask, cv.COLOR_RGBA2GRAY, 0);
        cv.threshold(mask, mask, 100, 255, cv.THRESH_BINARY);

        // 核心修复算法
        cv.inpaint(src, mask, dst, 5, cv.INPAINT_TELEA);

        // 显示结果
        cv.imshow(canvasRef.current, dst);

        // 更新 state 中的 image，支持连续修复
        const newUrl = canvas.toDataURL();
        const newImg = new Image();
        newImg.onload = () => setImage(newImg);
        newImg.src = newUrl;

        // 重置蒙版
        const maskCtx = maskCanvasRef.current.getContext('2d');
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, canvas.width, canvas.height);

        src.delete(); mask.delete(); dst.delete();
      } catch (err) {
        console.error("OpenCV Error:", err);
        alert("处理失败，请刷新重试");
      } finally {
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
    link.download = 'removed-watermark.png';
    link.href = canvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <Eraser size={24} color="#3b82f6" />
          D-fuckshuiyin <span>Pro</span>
        </div>
        <div style={{fontSize: '0.8rem', color: '#888'}}>
          {cvReady ? "🟢 引擎就绪" : "🟠 引擎加载中..."}
        </div>
      </header>

      <div className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="tool-group">
            <div className="tool-label">文件操作</div>
            <div className="file-input-wrapper">
              <button className="btn btn-secondary">
                <Upload size={18} /> 上传图片
              </button>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleImageUpload} 
                className="hidden-input"
              />
            </div>
          </div>

          <div className="tool-group">
            <div className="tool-label">画笔设置 ({brushSize}px)</div>
            <input 
              type="range" 
              min="5" 
              max="100" 
              value={brushSize} 
              onChange={(e) => setBrushSize(parseInt(e.target.value))} 
            />
          </div>

          <div className="tool-group">
            <div className="tool-label">执行操作</div>
            <button 
              className="btn btn-primary" 
              onClick={processWatermark}
              disabled={!image || !cvReady || isProcessing}
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />}
              开始去水印
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={resetCanvas}
              disabled={!image}
            >
              <RefreshCw size={18} /> 重置画布
            </button>
          </div>

           <div className="tool-group" style={{marginTop: 'auto'}}>
            <button 
              className="btn btn-secondary" 
              style={{borderColor: '#3b82f6', color: '#3b82f6'}}
              onClick={downloadImage}
              disabled={!image}
            >
              <Download size={18} /> 下载结果
            </button>
          </div>
        </aside>

        {/* Canvas Area */}
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
            <canvas ref={maskCanvasRef} style={{ display: 'none' }} />

            {!image && (
              <div className="placeholder">
                <ImageIcon size={64} style={{opacity: 0.2, marginBottom: 20}} />
                <p>请上传图片开始去水印</p>
              </div>
            )}

            {isProcessing && (
              <div className="loading-overlay">
                <div className="spinner"></div>
                <span>正在智能计算修复...</span>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
