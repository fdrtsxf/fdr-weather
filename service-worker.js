/* ===== fdr天气预报 Service Worker =====
 * 缓存策略：
 * - 天气API请求（api.open-meteo.com）：Network First，带8秒超时
 * - 地理编码请求（geocoding-api.open-meteo.com）：Network First
 * - 静态资源：Cache First
 * - 导航请求：Network First，离线回退到index.html
 */

const CACHE_NAME = 'fdr-weather-v1';
const PRECACHE_URLS = ['./', 'index.html', 'manifest.json'];
const API_HOSTS = ['api.open-meteo.com', 'geocoding-api.open-meteo.com'];

/* ===== 安装阶段：预缓存核心文件 ===== */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).catch(() => {
      // 预缓存为渐进增强，失败不影响安装
    })
  );
});

/* ===== 激活阶段：清理旧缓存 + 接管页面 ===== */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
    ])
  );
});

/* ===== 网络优先（带超时） ===== */
async function networkFirst(request, timeoutMs = 8000) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 网络失败或超时，回退到缓存
    const cached = await cache.match(request);
    if (cached) return cached;
    // 导航请求回退到index.html
    if (request.mode === 'navigate') {
      return cache.match('index.html');
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/* ===== 缓存优先 ===== */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/* ===== 请求拦截 ===== */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAPI = API_HOSTS.some((host) => url.hostname === host);
  const isNavigate = event.request.mode === 'navigate';

  if (isAPI || isNavigate) {
    event.respondWith(networkFirst(event.request));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});
