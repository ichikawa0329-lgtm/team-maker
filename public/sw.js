// Service Worker: ネットワーク優先→キャッシュフォールバック
// 初回訪問後はオフラインでも動作する

const CACHE = "team-maker-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // 古いキャッシュを削除
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // chrome-extension等は無視
  if (!e.request.url.startsWith("http")) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // 成功したレスポンスをキャッシュに保存
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        // オフライン時はキャッシュから返す
        caches.match(e.request).then((cached) => cached ?? new Response("offline", { status: 503 }))
      )
  );
});
