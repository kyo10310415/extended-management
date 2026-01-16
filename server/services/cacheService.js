/**
 * シンプルなメモリキャッシュサービス
 * Notion APIのレスポンスをキャッシュして高速化
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.ttl = 30 * 60 * 1000; // 30分間キャッシュ（5分→30分に延長）
  }

  /**
   * キャッシュからデータを取得
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // TTLチェック
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    console.log(`✅ Cache HIT: ${key}`);
    return item.data;
  }

  /**
   * キャッシュにデータを保存
   */
  set(key, data, customTtl = null) {
    const ttl = customTtl || this.ttl;
    const expiry = Date.now() + ttl;

    this.cache.set(key, {
      data,
      expiry,
    });

    console.log(`💾 Cache SET: ${key} (TTL: ${ttl / 1000}s)`);
  }

  /**
   * キャッシュを削除
   */
  delete(key) {
    this.cache.delete(key);
    console.log(`🗑️  Cache DELETE: ${key}`);
  }

  /**
   * すべてのキャッシュをクリア
   */
  clear() {
    this.cache.clear();
    console.log('🗑️  Cache CLEARED');
  }

  /**
   * キャッシュの統計情報
   */
  stats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// シングルトンインスタンス
const cacheService = new CacheService();

export default cacheService;
