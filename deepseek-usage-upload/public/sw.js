/* Minimal service worker: cache the app shell for instant launch; API stays network-only. */
const SHELL = ["./", "./index.html", "./style.css", "./app.js", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png"];
const CACHE = "deepseek-usage-v1";

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return; // never touch api.deepseek.com
	if (url.pathname.startsWith("/api/")) return; // network-only for data
	event.respondWith(
		caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
			const copy = res.clone();
			caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
			return res;
		}))
	);
});
