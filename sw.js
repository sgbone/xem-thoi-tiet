/* Service worker cho "Trời hôm nay".
   Mục tiêu: mở được khi mất mạng, nhưng LUÔN lấy bản mới nhất khi có mạng.
   - Trang (index.html): ưu tiên mạng, quá 4 giây hoặc mất mạng thì dùng bản đã lưu.
   - Icon, manifest: trả bản đã lưu ngay, đồng thời tải bản mới ngầm cho lần sau.
   - Font Google: giống trên, để lần sau mở không phải chờ tải font.
   - API thời tiết: KHÔNG can thiệp. Trang đã tự lưu dữ liệu lần cuối trong localStorage.
   Đổi VERSION khi muốn xóa sạch bộ nhớ đệm cũ (ví dụ thêm file mới vào PRECACHE). */
const VERSION = "v1";
const SHELL = "troi-shell-" + VERSION;
const RUNTIME = "troi-runtime-" + VERSION;
const BASE = self.registration.scope;                       // hoạt động cả khi triển khai ở thư mục con (GitHub Pages)
const abs = (p) => new URL(p, BASE).href;
const INDEX = abs("./index.html");                          // mọi lượt điều hướng đều là cùng một trang này
const PRECACHE = ["./", "./index.html", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png"].map(abs);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))) // thiếu một file không làm hỏng cả lần cài
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(e) {
  const cache = await caches.open(SHELL);
  const net = fetch(e.request).then((res) => {
    if (res && res.ok) e.waitUntil(cache.put(INDEX, res.clone()));
    return res;
  });
  const slow = new Promise((_, rej) => setTimeout(rej, 4000));
  try { return await Promise.race([net, slow]); }
  catch (err) { const hit = await cache.match(INDEX); return hit || net; }
}

async function swr(e, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(e.request);
  const net = fetch(e.request).then((res) => {
    if (res && (res.ok || res.type === "opaque")) e.waitUntil(cache.put(e.request, res.clone())); // opaque: CSS font tải kiểu no-cors
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") return e.respondWith(networkFirst(e));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return e.respondWith(swr(e, RUNTIME));
  if (url.origin === self.location.origin) return e.respondWith(swr(e, SHELL));
  // Còn lại (Open-Meteo, BigDataCloud): để trình duyệt tự xử lý
});
