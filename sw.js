// ================================================================
//  Service Worker — メタモル PWA
//  オフライン時はキャッシュから提供し、起動を高速化する
// ================================================================

const CACHE_NAME = 'metamor-v1';
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

  // アプリシェル: キャッシュ優先、バックグラウンドで更新
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
