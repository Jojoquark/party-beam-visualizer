export class WakeLockManager {
  constructor() {
    this.sentinel = null;
    this.active = false;
    this.onVisibilityChange = () => {
      if (this.active && document.visibilityState === 'visible') {
        this.request();
      }
    };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  async request() {
    this.active = true;
    if (!('wakeLock' in navigator) || !navigator.wakeLock?.request) {
      return false;
    }
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  release() {
    this.active = false;
    if (this.sentinel) {
      this.sentinel.release().catch(() => {});
      this.sentinel = null;
    }
  }
}
