export interface TrackingData {
  eventName: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: number;
}

export interface TrackingProvider {
  name: string;
  track(data: TrackingData): Promise<void>;
  isEnabled(): boolean;
}

export class TrackingService {
  private providers: Map<string, TrackingProvider> = new Map();
  
  registerProvider(provider: TrackingProvider): void {
    this.providers.set(provider.name, provider);
  }
  
  async track(data: TrackingData, providerNames?: string[]): Promise<void> {
    const targetProviders = providerNames 
      ? providerNames.map(name => this.providers.get(name)).filter((provider): provider is TrackingProvider => provider !== undefined)
      : Array.from(this.providers.values());
    
    const enabledProviders = targetProviders.filter(provider => provider.isEnabled());
    
    await Promise.all(
      enabledProviders.map(provider => provider.track(data))
    );
  }
  
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  getProvider(name: string): TrackingProvider | undefined {
    return this.providers.get(name);
  }
}

// Global tracking service instance
export const trackingService = new TrackingService();