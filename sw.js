// Network-first: always try the live site (so Rika's topic updates show), fall back to cache offline.
const CACHE = "tk-v1";
const SHELL = ["./", "index.html", "style.css?v=1", "app.js?v=1", "topics.json", "manifest.webmanifest", "icons/mark.svg", "icons/icon-180.png",
  "fonts/Montserrat-ExtraBold.woff2", "fonts/Montserrat-Bold.woff2", "fonts/Inter-Regular.woff2", "fonts/Inter-SemiBold.woff2"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const key = u.pathname.endsWith("topics.json") ? new Request(u.origin + u.pathname) : e.request;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(ca => ca.put(key, c)); } return r; })
    .catch(() => caches.match(key).then(m => m || caches.match("index.html"))));
});
