// OpenCV.js 引擎加载器。
// 关键点：
// 1. 引擎体积约 10MB，需向 UI 汇报下载进度，否则移动端用户会误认为页面卡死。
// 2. 多源按优先级回退，且每个源都有总超时与「无数据」停滞判定，
//    避免单个站点慢到几十 KB/s 时把整条加载链卡死。
// 3. 用轮询而非覆盖 Module.onRuntimeInitialized 判定就绪，避免破坏构建内部的初始化回调。

const BUILD = '4.9.0-release.2';
export const ENGINE_VERSION = '4.9.0';

// 国内网络下 jsDelivr 常只有几十 KB/s，npmmirror 可跑满带宽，因此放在首位。
const SOURCES = [
  { label: 'npmmirror', url: `https://registry.npmmirror.com/@techstark/opencv-js/${BUILD}/files/dist/opencv.js` },
  { label: 'jsDelivr', url: `https://cdn.jsdelivr.net/npm/@techstark/opencv-js@${BUILD}/dist/opencv.js` },
  { label: 'unpkg', url: `https://unpkg.com/@techstark/opencv-js@${BUILD}/dist/opencv.js` },
  { label: 'OpenCV 官方', url: 'https://docs.opencv.org/4.9.0/opencv.js' },
];

const DOWNLOAD_TIMEOUT = 60000;
const STALL_TIMEOUT = 12000;
const INIT_TIMEOUT = 60000;

function hasApi(cv) {
  return !!(
    cv &&
    cv.Mat &&
    cv.INPAINT_TELEA !== undefined &&
    typeof cv.imread === 'function' &&
    typeof cv.imshow === 'function' &&
    typeof cv.inpaint === 'function'
  );
}

// Emscripten 在 Module 上挂了 then 以便 `await cv`。一旦把 cv 作为 Promise 的解决值返回，
// Promise 机制会反复调用这个 then 并自我解析，主线程被永久占住（表现为页面卡死后渲染进程崩溃）。
// 本项目通过轮询判定就绪，因此直接摘掉 then。
function readyCv() {
  const cv = window.cv;
  if (cv && typeof cv.then !== 'undefined') cv.then = undefined;
  return cv;
}

function waitRuntime(onProgress) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      clearInterval(poll);
      clearTimeout(timer);
      resolve(readyCv());
    };
    const poll = setInterval(() => {
      if (hasApi(window.cv)) return finish();
      onProgress({ phase: 'init', percent: 100 });
    }, 120);
    const timer = setTimeout(() => {
      clearInterval(poll);
      reject(new Error('算法引擎初始化超时'));
    }, INIT_TIMEOUT);
    if (hasApi(window.cv)) finish();
  });
}

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => {
      el.onerror = null;
      resolve();
    };
    el.onerror = () => {
      el.remove();
      reject(new Error('脚本加载失败'));
    };
    document.head.appendChild(el);
  });
}

function readWithStallGuard(reader, onStall) {
  let timer;
  const pending = reader.read();
  // 卡死的连接不会再有进展，超时后主动断开，让上层切换到下一个源。
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onStall();
      reject(new Error(`${STALL_TIMEOUT / 1000}s 内无数据`));
    }, STALL_TIMEOUT);
  });
  pending.catch(() => {});
  return Promise.race([pending, guard]).finally(() => clearTimeout(timer));
}

async function loadByFetch(source, onProgress) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT);
  try {
    const res = await fetch(source.url, { signal: ctrl.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    let bytes = 0;
    let blob;
    if (res.body && typeof res.body.getReader === 'function') {
      const reader = res.body.getReader();
      const chunks = [];
      for (;;) {
        const { done, value } = await readWithStallGuard(reader, () => ctrl.abort());
        if (done) break;
        chunks.push(value);
        bytes += value.length;
        onProgress({
          phase: 'download',
          source: source.label,
          percent: total ? Math.min(99, (bytes / total) * 100) : 0,
          received: bytes,
          total,
        });
      }
      blob = new Blob(chunks, { type: 'text/javascript' });
    } else {
      blob = await res.blob();
    }
    onProgress({ phase: 'download', source: source.label, percent: 100, received: bytes, total });
    const url = URL.createObjectURL(blob);
    try {
      await injectScript(url);
    } finally {
      // 脚本已执行，引擎自行持有必要内存，可释放该引用。
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return await waitRuntime(onProgress);
  } finally {
    clearTimeout(timer);
  }
}

async function loadByTag(source, onProgress) {
  // <script> 注入拿不到进度事件，慢源可能长时间挂起，因此单独加一层总超时。
  let timer;
  const loading = injectScript(source.url);
  loading.catch(() => {});
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`加载超过 ${DOWNLOAD_TIMEOUT / 1000}s`)), DOWNLOAD_TIMEOUT);
  });
  try {
    await Promise.race([loading, timeout]);
    return await waitRuntime(onProgress);
  } finally {
    clearTimeout(timer);
  }
}

let pending = null;

export function loadOpenCV({ onProgress = () => {} } = {}) {
  if (hasApi(window.cv)) return Promise.resolve(readyCv());
  if (pending) return pending;
  pending = (async () => {
    const failures = [];
    for (const source of SOURCES) {
      // 先按字节流下载（可汇报进度、可停滞判定），失败再退回浏览器原生 <script> 加载。
      for (const load of [loadByFetch, loadByTag]) {
        try {
          onProgress({ phase: 'download', source: source.label, percent: 0 });
          const cv = await load(source, onProgress);
          if (!hasApi(cv)) throw new Error('该构建缺少所需的算法接口');
          return cv;
        } catch (err) {
          failures.push(`${source.label}: ${err.message}`);
        }
      }
    }
    throw new Error(`算法引擎加载失败（${failures.length} 次尝试），请检查网络后重试`);
  })().catch((err) => {
    // 失败后允许用户点击状态徽标重新走一遍完整的回退链。
    pending = null;
    throw err;
  });
  return pending;
}
