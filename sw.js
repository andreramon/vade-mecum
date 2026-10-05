// Service worker: o app abre offline e as leis ficam guardadas no aparelho.
const VERSAO = 'vm-v4';
const BASE = ['./', './index.html', './manifest.json', './icone.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fontes = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (url.origin !== location.origin && !fontes) return;

  if (url.pathname.includes('/data/') || req.mode === 'navigate') {
    // Leis e página: tenta a rede primeiro (versão mais nova) e cai no cache se estiver offline
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Demais arquivos e fontes: cache primeiro
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(resp => {
    if (resp.ok || resp.type === 'opaque') { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
    return resp;
  })));
});
