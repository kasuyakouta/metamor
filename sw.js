// ================================================================
//  Service Worker — メタモル PWA
//  HTML本体は常に最新を優先（ネットワーク優先）、
//  その他の静的アセットはキャッシュ優先でオフライン起動を高速化する
// ================================================================

const CACHE_NAME = 'metamor-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// インストール: 静的アセットをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  );
  self.skipWaiting();
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ処理
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // GAS APIはキャッシュしない（常にネットワーク）
  if (url.hostname.includes('script.google.com')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ status: 'error', message: 'オフラインです' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // HTML本体（画面遷移 / index.html）はネットワーク優先：
  // 常に最新版を取得し、オフライン時のみキャッシュにフォールバックする
  const isHtmlRequest = request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/');
  if (isHtmlRequest) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // それ以外の静的アセット: キャッシュ優先、バックグラウンドで更新
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
