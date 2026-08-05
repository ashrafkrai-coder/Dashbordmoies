/**
 * Service Worker Helper Utility
 * Membantu komunikasi dengan Service Worker dan management offline features
 */

class ServiceWorkerHelper {
  constructor() {
    this.registration = null;
    this.isOnline = navigator.onLine;
    this.listeners = [];
    
    this.init();
  }

  /**
   * Initialize Service Worker
   */
  async init() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SWH] Service Worker tidak didukung');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('sw.js', {
        scope: './'
      });
      
      console.log('[SWH] Service Worker registered:', this.registration);
      
      // Listen untuk updates
      this.registration.addEventListener('updatefound', () => {
        this.handleUpdateFound();
      });
      
      // Periodic check untuk updates
      if (this.registration.periodicSync) {
        try {
          await this.registration.periodicSync.register('update-cache', {
            minInterval: 24 * 60 * 60 * 1000 // 1 hari
          });
          console.log('[SWH] Periodic sync registered');
        } catch (err) {
          console.warn('[SWH] Periodic sync failed:', err);
        }
      }
      
      return true;
    } catch (error) {
      console.error('[SWH] Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Handle update found
   */
  handleUpdateFound() {
    const newWorker = this.registration.installing;
    console.log('[SWH] New Service Worker installing');

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        console.log('[SWH] New Service Worker ready');
        this.notifyListeners('update-available');
      }
    });
  }

  /**
   * Check for updates
   */
  async checkForUpdates() {
    if (!this.registration) return false;
    
    try {
      await this.registration.update();
      console.log('[SWH] Checked for updates');
      return true;
    } catch (error) {
      console.error('[SWH] Update check failed:', error);
      return false;
    }
  }

  /**
   * Activate waiting Service Worker (untuk update)
   */
  activateUpdate() {
    if (!this.registration?.waiting) return false;

    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    
    // Reload page setelah aktivasi
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
    
    return true;
  }

  /**
   * Clear cache
   */
  async clearCache(cacheType = 'all') {
    if (!navigator.serviceWorker.controller) {
      console.warn('[SWH] No active Service Worker');
      return false;
    }

    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_CACHE',
      payload: { cacheType }
    });

    return true;
  }

  /**
   * Get cache size
   */
  async getCacheSize() {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker.controller) {
        reject(new Error('No active Service Worker'));
        return;
      }

      const channel = new MessageChannel();
      
      channel.port1.onmessage = (event) => {
        if (event.data.type === 'CACHE_SIZE') {
          resolve(event.data);
        }
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_CACHE_SIZE' },
        [channel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Cache size request timeout')), 5000);
    });
  }

  /**
   * Handle online/offline events
   */
  onlineStatusChanged(callback) {
    const handler = () => {
      this.isOnline = navigator.onLine;
      callback(this.isOnline);
    };

    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);

    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }

  /**
   * Add listener untuk SW events
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify semua listeners
   */
  notifyListeners(event) {
    this.listeners.forEach(callback => callback(event));
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      registered: !!this.registration,
      isOnline: this.isOnline,
      hasController: !!navigator.serviceWorker.controller,
      waiting: !!this.registration?.waiting,
      installing: !!this.registration?.installing,
      active: !!this.registration?.active
    };
  }
}

// Export global instance
const swHelper = new ServiceWorkerHelper();

// Auto log status changes
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(() => {
    console.log('[SWH] Service Worker ready');
    console.log('[SWH] Status:', swHelper.getStatus());
  });
}