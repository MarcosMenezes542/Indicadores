// Service worker mínimo: permite instalar como aplicativo.
// Não guarda dados em cache — tudo vem sempre da nuvem (chamados sempre atualizados).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
