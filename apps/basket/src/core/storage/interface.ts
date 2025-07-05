export interface StorageResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BatchStorageResult {
  success: boolean;
  processed: number;
  errors: string[];
}

export interface StorageProvider {
  name: string;
  insert<T>(table: string, data: T): Promise<StorageResult<T>>;
  insertBatch<T>(table: string, data: T[]): Promise<BatchStorageResult>;
  isHealthy(): Promise<boolean>;
}

export interface CacheProvider {
  name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  exists(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export class StorageService {
  private providers: Map<string, StorageProvider> = new Map();
  private cacheProviders: Map<string, CacheProvider> = new Map();
  
  registerProvider(provider: StorageProvider): void {
    this.providers.set(provider.name, provider);
  }
  
  registerCacheProvider(provider: CacheProvider): void {
    this.cacheProviders.set(provider.name, provider);
  }
  
  async insert<T>(table: string, data: T, providerName?: string): Promise<StorageResult<T>> {
    const provider = providerName 
      ? this.providers.get(providerName)
      : this.providers.values().next().value;
    
    if (!provider) {
      return { success: false, error: 'No storage provider available' };
    }
    
    return provider.insert(table, data);
  }
  
  async insertBatch<T>(table: string, data: T[], providerName?: string): Promise<BatchStorageResult> {
    const provider = providerName 
      ? this.providers.get(providerName)
      : this.providers.values().next().value;
    
    if (!provider) {
      return { success: false, processed: 0, errors: ['No storage provider available'] };
    }
    
    return provider.insertBatch(table, data);
  }
  
  async getCache(key: string, providerName?: string): Promise<string | null> {
    const provider = providerName 
      ? this.cacheProviders.get(providerName)
      : this.cacheProviders.values().next().value;
    
    if (!provider) {
      return null;
    }
    
    return provider.get(key);
  }
  
  async setCache(key: string, value: string, ttl?: number, providerName?: string): Promise<void> {
    const provider = providerName 
      ? this.cacheProviders.get(providerName)
      : this.cacheProviders.values().next().value;
    
    if (!provider) {
      return;
    }
    
    await provider.set(key, value, ttl);
  }
  
  async existsInCache(key: string, providerName?: string): Promise<boolean> {
    const provider = providerName 
      ? this.cacheProviders.get(providerName)
      : this.cacheProviders.values().next().value;
    
    if (!provider) {
      return false;
    }
    
    return provider.exists(key);
  }
}

// Global storage service instance
export const storageService = new StorageService();