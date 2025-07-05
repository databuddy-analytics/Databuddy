export interface QueueMessage<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: number;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export interface QueueProvider {
  name: string;
  publish<T>(topic: string, message: QueueMessage<T>): Promise<void>;
  subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface JobQueue {
  name: string;
  enqueue<T>(job: QueueMessage<T>): Promise<void>;
  process(handler: (job: QueueMessage) => Promise<void>): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export class QueueService {
  private providers: Map<string, QueueProvider> = new Map();
  private jobQueues: Map<string, JobQueue> = new Map();
  
  registerProvider(provider: QueueProvider): void {
    this.providers.set(provider.name, provider);
  }
  
  registerJobQueue(queue: JobQueue): void {
    this.jobQueues.set(queue.name, queue);
  }
  
  async publish<T>(topic: string, message: QueueMessage<T>, providerName?: string): Promise<void> {
    const provider = providerName 
      ? this.providers.get(providerName)
      : this.providers.values().next().value;
    
    if (!provider) {
      throw new Error('No queue provider available');
    }
    
    await provider.publish(topic, message);
  }
  
  async subscribe(topic: string, handler: (message: QueueMessage) => Promise<void>, providerName?: string): Promise<void> {
    const provider = providerName 
      ? this.providers.get(providerName)
      : this.providers.values().next().value;
    
    if (!provider) {
      throw new Error('No queue provider available');
    }
    
    await provider.subscribe(topic, handler);
  }
  
  async enqueueJob<T>(queueName: string, job: QueueMessage<T>): Promise<void> {
    const queue = this.jobQueues.get(queueName);
    
    if (!queue) {
      throw new Error(`Job queue ${queueName} not found`);
    }
    
    await queue.enqueue(job);
  }
  
  async processJobs(queueName: string, handler: (job: QueueMessage) => Promise<void>): Promise<void> {
    const queue = this.jobQueues.get(queueName);
    
    if (!queue) {
      throw new Error(`Job queue ${queueName} not found`);
    }
    
    await queue.process(handler);
  }
  
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  getJobQueues(): string[] {
    return Array.from(this.jobQueues.keys());
  }
}

// Global queue service instance
export const queueService = new QueueService();