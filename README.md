# 🌊 D-fuckshuiyin | 智能图片去水印

![License](https://img.shields.io/github/license/ououduck/D-fuckshuiyin?color=blue)
![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react)
![Vite](https://img.shields.io/badge/Vite-4.0-646CFF.svg?logo=vite)
![OpenCV](https://img.shields.io/badge/OpenCV.js-4.8.0-5C3EE8.svg?logo=opencv)

**D-fuckshuiyin** 是一个基于浏览器的纯前端智能图片去水印工具。它利用 OpenCV.js 的图像修复算法（Inpainting），允许用户通过涂抹的方式快速移除图片中的水印、瑕疵或多余物体。

本项目完全运行在客户端（浏览器环境），无需上传图片到服务器，**100% 保护用户隐私**。



## ✨ 核心特性

- 🔒 **隐私安全**：所有图片处理均在本地浏览器通过 WebAssembly 完成，数据不经过任何后端服务器。
- ⚡ **智能修复**：集成 **OpenCV.js**，使用 Telea 算法进行像素级智能填充，效果自然。
- 📱 **多端适配**：
  - **PC 端**：专业的深色编辑器界面，快捷键支持。
  - **移动端**：专为手机优化的触摸交互（防误触、底部工具栏），随时随地修图。
- 🎨 **专业体验**：支持画笔大小无级调节，提供实时视觉反馈和处理进度提示。
- 🚀 **极速部署**：专为静态托管服务（如 Tencent Cloud EdgeOne Pages, Vercel）设计。

## 🛠️ 技术栈

- **核心框架**: React + Vite
- **算法引擎**: OpenCV.js (WebAssembly)
- **UI 组件**: Lucide React Icons
- **样式方案**: CSS3 Variables, Flexbox/Grid, Mobile-first Responsive

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone [https://github.com/ououduck/D-fuckshuiyin.git](https://github.com/ououduck/D-fuckshuiyin.git)
cd D-fuckshuiyin

```

### 2. 安装依赖

```bash
npm install

```

### 3. 本地运行

```bash
npm run dev

```

打开浏览器访问 `http://localhost:5173` 即可开始使用。

### 4. 构建生产版本

```bash
npm run build

```

构建产物将输出到 `dist` 目录。

## 🌐 部署指南 (EdgeOne Pages)

本项目主要针对 **腾讯云 EdgeOne Pages** 进行优化，部署流程极其简单：

1. 将代码推送到 GitHub。
2. 登录 [腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone/pages)。
3. 点击 **新建项目** -> **连接 Git 仓库**，选择 `D-fuckshuiyin`。
4. 配置构建参数（通常会自动识别）：
* **构建命令**: `npm run build`
* **输出目录**: `dist`


5. 点击部署，等待约 1 分钟即可获得全球加速的访问域名。

## 🧩 实现原理

1. **双层画布机制**：
* **Layer 1 (Visible)**: 展示用户上传的图片和红色的涂抹轨迹。
* **Layer 2 (Hidden Mask)**: 同步生成纯黑底白线的蒙版数据。


2. **OpenCV 处理流程**：
* 读取原图数据（RGBA 转 RGB）。
* 读取蒙版数据（RGBA 转 Grayscale 单通道）。
* 对蒙版进行二值化阈值处理，确保边缘清晰。
* 调用 `cv.inpaint(src, mask, dst, radius, cv.INPAINT_TELEA)` 进行修复计算。



## 🤝 贡献 (Contributing)

欢迎提交 Issue 或 Pull Request 来改进这个项目！

1. Fork 本仓库
2. 新建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 开源协议 (License)

本项目基于 [MIT 协议](https://www.google.com/search?q=LICENSE) 开源。


