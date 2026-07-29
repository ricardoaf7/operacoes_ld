const CACHE_NAME = 'zeladoria-ld-v2';
const APP_SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const TIMEOUT_MS = 4000; // sinal fraco/instável não deve travar a tela esperando

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => (cacheName !== CACHE_NAME ? caches.delete(cacheName) : undefined))
      )
    ).then(() => self.clients.claim())
  );
});

function fetchComLimiteDeTempo(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    fetch(request).then(
      (response) => { clearTimeout(timer); resolve(response); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST/PATCH/DELETE não podem ser respondidos com uma cópia salva —
  // seguem para a rede normalmente (o envio de fotos offline já tem sua
  // própria fila no app, feita em IndexedDB)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const ehApi = url.pathname.startsWith('/api/');

  if (ehApi) {
    // Dados: tenta a rede com um limite curto de tempo. Em sinal fraco/
    // instável (não caiu de vez, só está lento), isso evita a tela travada
    // esperando — cai para a última cópia salva rapidamente.
    event.respondWith(
      fetchComLimiteDeTempo(request, TIMEOUT_MS)
        .then((response) => {
          const copia = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Promise.reject(new Error('sem rede e sem cópia salva'))))
    );
  } else {
    // App (HTML/JS/CSS/ícones): mostra a cópia salva na hora — funciona mesmo
    // sem nenhuma internet, desde que o app já tenha sido aberto uma vez neste
    // aparelho com sinal — e atualiza a cópia em segundo plano quando há conexão.
    event.respondWith(
      caches.match(request).then((cached) => {
        const atualizacaoEmSegundoPlano = fetch(request)
          .then((response) => {
            const copia = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copia));
            return response;
          })
          .catch(() => cached);
        return cached || atualizacaoEmSegundoPlano;
      })
    );
  }
});
