// Service worker del panel. Solo cachea la "cáscara" (HTML/CSS/JS/iconos) para
// que la app abra aunque haya mala señal. NUNCA cachea respuestas de la API:
// los datos de jugadores tienen que ser siempre frescos, y además van con la
// admin key adentro.
//
// Subí el número de CACHE cada vez que cambien los archivos del panel: eso hace
// que los celulares que ya lo tienen instalado se actualicen solos.
const CACHE = 'anticheat-panel-v4';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.jpg',
  './icon-512.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un solo archivo falla; los agregamos de a uno
      // para que un 404 puntual no deje el panel sin cache.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Todo lo que no sea de este mismo origen (o sea: la API de Supabase) pasa
  // derecho a la red, sin tocar el cache.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Red primero, cache como red de emergencia: si hay internet ves la versión
  // nueva, y si no, al menos abre.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
