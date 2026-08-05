const CACHE_VERSION = 'kehadiran-v2';
const ASSETS_CACHE = 'kehadiran-assets-v2';
const API_CACHE = 'kehadiran-api-v2';

// Assets yang akan di-precache (dimuat saat install)
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'app.js',
  'manifest.webmanifest',
  'icon.svg'
];

// URL API yang tidak boleh di-cache
const API_SKIP_CACHE = [
  '/api',
  'script.google.com'
];

// ========== INSTALL EVENT ==========
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  
  self.skipWaiting();
  
  event.waitUntil(
    (async () => {
      try {
        // Precache semua assets penting
        const cache = await caches.open(ASSETS_CACHE);
        console.log('[SW] Precaching assets:', PRECACHE_ASSETS);
        
        const cachedAssets = await cache.addAll(PRECACHE_ASSETS);
        console.log('[SW] Assets precached successfully');
        
        return cachedAssets;
      } catch (error) {
        console.error('[SW] Precaching failed:', error);
        // Jangan throw - biar install tetap success
      }
    })()
  );
});

// ========== ACTIVATE EVENT ==========
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    (async () => {
      try {
        // Hapus cache lama
        const cacheNames = await caches.keys();
        console.log('[SW] Found caches:', cacheNames);
        
        const cachesToDelete = cacheNames.filter(name => {
          const isOld = name !== CACHE_VERSION && 
                       name !== ASSETS_CACHE && 
                       name !== API_CACHE;
          if (isOld) {
            console.log('[SW] Deleting old cache:', name);
          }
          return isOld;
        });
        
        await Promise.all(cachesToDelete.map(name => caches.delete(name)));
        
        // Claim semua clients
        await self.clients.claim();
        console.log('[SW] Claimed all clients');
        
      } catch (error) {
        console.error('[SW] Activation failed:', error);
      }
    })()
  );
});

// ========== FETCH EVENT ==========
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Hanya handle GET requests
  if (event.request.method !== 'GET') {
    console.log('[SW] Skipping non-GET request:', event.request.method, url.pathname);
    return;
  }
  
  // Skip external APIs (Google Sheets, dll)
  if (url.origin !== location.origin) {
    console.log('[SW] Skipping external request:', url.origin);
    return;
  }
  
  // Route berdasarkan tipe content
  if (isAPIRequest(url)) {
    handleAPIRequest(event);
  } else {
    handleAssetRequest(event);
  }
});

// ========== REQUEST HANDLERS ==========

/**
 * Handle API requests dengan cache strategy
 * Strategy: Network-first, fallback ke cache
 */
function handleAPIRequest(event) {
  const url = new URL(event.request.url);
  console.log('[SW] API Request:', url.pathname);
  
  event.respondWith(
    (async () => {
      try {
        // Coba network dahulu (untuk data fresh)
        const networkRes = await fetch(event.request);
        
        const ct = networkRes.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          console.warn('[SW] Respons API bukan JSON, abaikan cache:', ct);
          return networkRes;
        }
        if (!networkRes.ok) {
          console.warn('[SW] API returned error:', networkRes.status);
          const cachedRes = await caches.match(event.request);
          return cachedRes || new Response(
            JSON.stringify({ ok: false, ralat: 'API Error: ' + networkRes.status }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // Cache response yang berhasil (JSON sahaja)
        const cache = await caches.open(API_CACHE);
        cache.put(event.request, networkRes.clone()).catch(err => {
          console.warn('[SW] Cache put failed:', err);
        });

        console.log('[SW] API response cached');
        return networkRes;
        
      } catch (error) {
        console.error('[SW] Network failed, checking cache:', error.message);
        
        // Fallback ke cache
        const cachedRes = await caches.match(event.request);
        if (cachedRes) {
          console.log('[SW] Returning cached API response');
          return cachedRes;
        }
        
        // Tidak ada cache, kembalikan JSON ralat (BUKAN halaman HTML)
        return new Response(
          JSON.stringify({ ok: false, ralat: 'Offline: tiada cache API tersedia' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    })()
  );
}

/**
 * Handle asset requests dengan cache strategy
 * Strategy: Cache-first, fallback ke network
 */
function handleAssetRequest(event) {
  const url = new URL(event.request.url);
  console.log('[SW] Asset Request:', url.pathname);
  
  event.respondWith(
    (async () => {
      try {
        // Cek cache dahulu
        const cachedRes = await caches.match(event.request);
        if (cachedRes) {
          console.log('[SW] Found in cache:', url.pathname);
          // Update cache di background
          updateCacheInBackground(event.request);
          return cachedRes;
        }
        
        // Network jika tidak di cache
        console.log('[SW] Fetching from network:', url.pathname);
        const networkRes = await fetch(event.request);
        
        if (!networkRes.ok) {
          console.warn('[SW] Network returned error:', networkRes.status);
          return createErrorResponse('Failed to fetch: ' + url.pathname);
        }
        
        // Cache response yang berhasil
        const cache = await caches.open(ASSETS_CACHE);
        const resClone = networkRes.clone();
        cache.put(event.request, resClone).catch(err => {
          console.warn('[SW] Cache put failed:', err);
        });
        
        console.log('[SW] Asset cached:', url.pathname);
        return networkRes;
        
      } catch (error) {
        console.error('[SW] Fetch failed:', error.message);
        
        // Fallback offline page atau generic error
        const cachedRes = await caches.match(event.request);
        return cachedRes || createErrorResponse('Offline: ' + error.message);
      }
    })()
  );
}

// ========== HELPER FUNCTIONS ==========

/**
 * Check apakah request adalah API request
 */
function isAPIRequest(url) {
  const pathname = url.pathname;
  
  // Google Apps Script endpoints
  if (pathname.includes('/script') || 
      pathname.includes('/exec') || 
      url.hostname.includes('script.google')) {
    return true;
  }
  
  // API endpoints
  if (pathname.includes('/api') || 
      pathname.includes('?action=')) {
    return true;
  }
  
  return false;
}

/**
 * Update cache di background tanpa block response
 */
function updateCacheInBackground(request) {
  // Non-blocking cache update
  fetch(request)
    .then(res => {
      if (res.ok) {
        const cache = caches.open(ASSETS_CACHE);
        return cache.then(c => c.put(request, res.clone()));
      }
    })
    .catch(err => {
      // Silent fail - tidak perlu log di background update
    });
}

/**
 * Create error response dengan friendly message
 */
function createErrorResponse(message) {
  const html = `
    <!DOCTYPE html>
    <html lang="ms">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - Dashboard Kehadiran</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          text-align: center;
          max-width: 500px;
          animation: slideUp 0.4s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .icon {
          font-size: 60px;
          margin-bottom: 20px;
        }
        h1 {
          color: #222;
          margin-bottom: 10px;
          font-size: 24px;
        }
        p {
          color: #666;
          margin-bottom: 20px;
          line-height: 1.6;
        }
        .details {
          background: #f5f5f5;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 12px;
          color: #888;
          word-break: break-all;
          font-family: monospace;
        }
        button {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .tips {
          text-align: left;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
        }
        .tips h3 {
          color: #222;
          margin-bottom: 10px;
          font-size: 13px;
        }
        .tips ul {
          list-style: none;
          font-size: 12px;
          color: #666;
        }
        .tips li {
          margin-bottom: 8px;
          padding-left: 20px;
          position: relative;
        }
        .tips li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #667eea;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📡</div>
        <h1>Offline</h1>
        <p>Anda sedang tidak terhubung dengan internet. Beberapa fitur mungkin tidak tersedia.</p>
        
        <div class="details">
          ${message}
        </div>
        
        <button onclick="location.reload()">🔄 Muat Semula</button>
        
        <div class="tips">
          <h3>📋 Yang Boleh Anda Lakukan:</h3>
          <ul>
            <li>Lihat data yang telah dicache sebelumnya</li>
            <li>Periksa tanggal pilihan</li>
            <li>Tunggu sambil menyambung semula</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    })
  });
}

// ========== MESSAGE HANDLING ==========
self.addEventListener('message', event => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      console.log('[SW] Skip waiting requested');
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      handleClearCache(payload);
      break;
      
    case 'GET_CACHE_SIZE':
      handleGetCacheSize(event);
      break;
      
    default:
      console.log('[SW] Unknown message:', type);
  }
});

/**
 * Handle cache clearing
 */
function handleClearCache(payload) {
  (async () => {
    try {
      const { cacheType } = payload || {};
      
      if (cacheType === 'all') {
        const caches_list = await caches.keys();
        await Promise.all(caches_list.map(name => caches.delete(name)));
        console.log('[SW] All caches cleared');
      } else if (cacheType === 'api') {
        await caches.delete(API_CACHE);
        console.log('[SW] API cache cleared');
      } else {
        await caches.delete(ASSETS_CACHE);
        console.log('[SW] Assets cache cleared');
      }
    } catch (err) {
      console.error('[SW] Clear cache failed:', err);
    }
  })();
}

/**
 * Handle get cache size
 */
function handleGetCacheSize(event) {
  (async () => {
    try {
      let totalSize = 0;
      const cacheNames = await caches.keys();
      
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        
        for (const request of requests) {
          const response = await cache.match(request);
          if (response) {
            const blob = await response.blob();
            totalSize += blob.size;
          }
        }
      }
      
      event.ports[0].postMessage({
        type: 'CACHE_SIZE',
        size: totalSize,
        sizeKB: (totalSize / 1024).toFixed(2),
        sizeMB: (totalSize / 1024 / 1024).toFixed(2)
      });
    } catch (err) {
      console.error('[SW] Get cache size failed:', err);
    }
  })();
}

// ========== LOGGING ==========
console.log('[SW] Service Worker loaded');
console.log('[SW] Cache version:', CACHE_VERSION);
console.log('[SW] Assets cache:', ASSETS_CACHE);
console.log('[SW] API cache:', API_CACHE);