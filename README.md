# D-fuckshuiyin

![License](https://img.shields.io/github/license/ououduck/D-fuckshuiyin)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-4-646CFF?logo=vite&logoColor=white)
![OpenCV](https://img.shields.io/badge/OpenCV.js-4.9.0-5C3EE8)

D-fuckshuiyin 是一个纯浏览器端的图片修复工具，用于移除图片中的水印、文字、污渍等多余内容。用户手动涂抹目标区域，由 OpenCV.js 的图像修复算法（Inpainting）依据周围像素重建该区域。

图片的读取、绘制与计算全部在浏览器本地完成，不会上传到任何服务器。唯一的外部依赖是首次使用时从公共 CDN 下载的 OpenCV.js 引擎文件（约 10 MB，浏览器会缓存）。

本项目是纯静态站点，部署方式见下文[部署](#部署)。

## 功能

- **手动标记 + 算法修复**：涂抹生成蒙版，修复结果只依赖蒙版范围与底图，标记本身不会进入导出图片。
- **涂抹 / 橡皮 / 移动三种工具**：橡皮可修正误涂；桌面端支持右键拖拽临时擦除。
- **撤销与重做**：历史栈保存每次涂抹与每次修复的结果，可一键还原为原图、按住对比原图；大画布下只保留最近若干份底图快照，更早的记录被丢弃后仍可通过「原图」回到初始状态。
- **缩放与平移**：滚轮、双指捏合、双击以及缩放按钮，放大后涂抹可提升边缘精度；坐标换算基于画布实际渲染矩形，缩放状态下依旧精准。画布容器按 contain 规则随视口重新计算尺寸，横屏与窄高视口下图片完整可见且不变形。
- **多种导入方式**：按钮选择、拖拽到画布区域、桌面端 Ctrl+V 粘贴剪贴板图片。
- **导出保留来源格式**：JPEG 源导出 JPEG（质量 0.92），其余导出 PNG，文件名沿用原图名。
- **移动端适配**：工具栏在窄屏与横屏下移至底部，触控目标不小于 40 px，适配刘海屏安全区域，禁用页面回弹以免涂抹时误触发。
- **稳定性控制**：图片长边超过 1600 px 自动等比缩放；历史版本数量按画布像素与内存预算动态限制；OpenCV 矩阵对象在处理结束后统一释放。
- **加载与失败可见**：引擎加载显示百分比进度，多 CDN（npmmirror / jsDelivr / unpkg / OpenCV 官方）依次回退，单个源设有超时与停滞判定，慢源不会阻塞回退；失败可点击重试，处理结果与异常通过页面内提示反馈，不使用 `alert`。

## 技术栈

| 项目 | 选择 |
| --- | --- |
| 界面 | React 18 + Vite 4 |
| 图像算法 | OpenCV.js 4.9.0（WebAssembly，`cv.inpaint`，Telea 算法） |
| 图标 | lucide-react |
| 样式 | 原生 CSS 变量与 Grid/Flexbox，移动优先断点 |
| 交互 | Pointer Events，统一鼠标、触摸与触控笔 |

## 快速开始

```bash
git clone https://github.com/ououduck/D-fuckshuiyin.git
cd D-fuckshuiyin
npm install
npm run dev
```

默认监听 5173 端口，`server.host` 已开启，可在同一局域网内用手机访问开发地址进行适配调试。

```bash
npm run build      # 产物输出到 dist
npm run preview    # 本地预览构建产物
```

## 部署

构建产物为纯静态文件，`vite.config.js` 中的 `base` 为相对路径，可部署在根目录或任意子路径。

**腾讯云 EdgeOne Pages / Vercel / Netlify 等自动构建**

- 构建命令：`npm run build`
- 输出目录：`dist`

**GitHub Pages 等子路径托管**

将 `dist` 目录内容发布即可，无需修改 `base`。

**离线或内网使用**

将 OpenCV.js 文件放入 `public/opencv/opencv.js`，并在 `src/lib/opencv.js` 的 `SOURCES` 列表首位添加 `{ label: '本地', url: './opencv/opencv.js' }`，即可完全断开外部依赖。

## 实现说明

画布分为三层：

1. **底图（base）**：导入或修复后的干净图像，不参与显示合成之外的任何绘制。
2. **标记层（mark）**：不透明红色笔迹绘制在透明画布上。同一层既用于显示（合成时以 0.5 不透明度叠加），也用作算法蒙版（转灰度后笔迹值恒定，阈值化即可分离），避免维护两份笔迹数据。
3. **显示层（view）**：按脏矩形（笔迹包围盒）局部合成底图与标记层，涂抹过程只重绘受影响区域。

修复流程：

```
底图 -> imread -> RGBA 转 RGB
标记层 -> imread -> RGBA 转灰度 -> 二值化 -> 3x3 膨胀
cv.inpaint(src, mask, dst, radius, cv.INPAINT_TELEA) -> imshow -> 新历史版本
```

半径由画笔大小换算并限制在 3 至 12 之间；蒙版做一次 3x3 膨胀，以覆盖水印常见的半透明描边与阴影。

历史采用结构化共享：笔迹序列按引用复用，只有导入图片与每次修复才会新增一份底图快照，快照数量按画布尺寸与约 28 MB 的内存预算限制。

## 键盘快捷键

| 快捷键 | 功能 |
| --- | --- |
| `B` / `E` / `V` | 涂抹 / 橡皮 / 移动 |
| `[` / `]` | 减小 / 增大画笔 |
| `Enter` | 开始修复 |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 撤销 / 重做 |
| `Ctrl+O` / `Ctrl+S` | 导入 / 导出 |
| `H` | 显示或隐藏标记 |
| `0` / `1` | 适应窗口 / 实际大小 |
| 按住 `\` | 对比原图 |
| 按住 `空格` | 临时拖动画面 |
| `Ctrl+V` | 粘贴剪贴板图片 |
| `?` | 打开使用说明（也可点击右上角帮助按钮） |

## 已知限制

- 不会自动识别水印，需要手动涂抹；这是可预期效果的前提。
- 涂抹需完整盖住水印本体及其边缘。Inpainting 以蒙版以外的像素作为重建依据，若残留未涂抹的水印边条，其颜色会向蒙版内部扩散，出现成片暗斑。
- 大面积、结构复杂或跨越强边缘的水印，修复后会出现涂抹状痕迹，属于扩散式修复算法的固有局限，并非缺陷。
- 长边超过 1600 px 的图片会被缩放后再处理，导出尺寸与缩放后一致。
- 修复计算在主线程执行，大尺寸图片会出现短暂界面停顿。
- iOS 相册导出的 HEIC 在非 WebKit 浏览器中可能无法解码。
- 首次使用需下载约 10 MB 的引擎文件，弱网环境请耐心等待进度完成或点击重试。

## 浏览器要求

需要支持 WebAssembly、Canvas 2D 与 Pointer Events 的浏览器，建议使用 Chrome / Edge 90+、Firefox 90+、Safari 16.4+ 或对应移动版本。

## 项目结构

```
.
├── index.html
├── public/                 # favicon、webmanifest
├── src/
│   ├── App.jsx             # 状态编排、画布合成、指针与手势、历史记录
│   ├── App.css             # 布局与响应式样式
│   ├── components/         # 工具栏、画布浮层、空状态、提示、帮助
│   └── lib/
│       ├── opencv.js       # 引擎多源加载、进度与就绪检测
│       ├── inpaint.js      # 蒙版预处理与修复调用
│       └── draw.js         # 笔迹绘制与脏矩形计算
└── vite.config.js
```

## 贡献

1. Fork 仓库并创建特性分支：`git checkout -b feature/your-feature`
2. 提交改动：`git commit -m "说明改动动机"`
3. 推送分支并发起 Pull Request，描述问题背景与验证方式

## 使用合规

请仅处理你拥有权利或已获授权的图片。去除他人作品上的水印、版权标识或平台水印可能侵犯著作权或违反平台服务条款，由此产生的责任由使用者承担。本项目不提供任何自动化识别或批量处理能力。

## 许可

[MIT](./LICENSE)
