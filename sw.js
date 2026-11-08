/* Service worker: permite instalar o app e abrir mesmo com internet fraca.
   Arquivos do app: rede primeiro (sempre a versão mais nova), cache como reserva.
   Dados (Supabase) nunca passam pelo cache. */
const VERSAO = "vmo-v26";
const ARQUIVOS = [
  "./", "index.html", "admin.html", "manifest.json", "manifest-admin.json",
  "css/style.css", "js/config.js", "js/comum.js", "js/vmo.js", "js/admin.js", "js/main.js",
  "vendor/supabase.min.js", "vendor/chart.umd.min.js", "vendor/xlsx.mini.min.js",
  "img/icon.svg", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-512.png",
  "img/logo-fundo.png", "img/icon-admin.svg", "img/icon-admin-192.png", "img/icon-admin-512.png", "img/icon-admin-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === "navigate" ? caches.match(url.pathname.endsWith("admin.html") ? "admin.html" : "index.html") : undefined)))
  );
});
