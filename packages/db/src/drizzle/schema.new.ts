import axios from 'axios';
import { AlarmService } from './AlarmService';
import { Logger } from './Logger';

interface SiteStatus {
  url: string;
  status: 'up' | 'down';
  responseTime?: number;
}

class UptimeMonitor {
  private siteStatus: SiteStatus = { url: '', status: 'up' };
  private consecutiveFailures: number = 0;
  private lastAlertTimestamp: Date | null = null;
  private readonly failureThreshold: number = 3; // configurable
  private readonly alertInterval: number = 60 * 60 * 1000; // 1 hour

  constructor(private alarmService: AlarmService, private logger: Logger) {}

  async checkSiteStatus(url: string): Promise<void> {
    this.siteStatus.url = url;
    try {
      const response = await axios.get(url);
      if (response.status === 200) {
        this.handleSiteUp();
      } else {
        this.handleSiteDown(response.status);
      }
    } catch (error) {
      this.handleSiteDown(500); // assume server error
    }
  }

  private handleSiteUp(): void {
    if (this.siteStatus.status === 'down') {
      this.logger.log(`Site ${this.siteStatus.url} is back up`);
      this.triggerAlarm('up');
    }
    this.resetConsecutiveFailures();
  }

  private handleSiteDown(statusCode: number): void {
    if (this.siteStatus.status === 'up') {
      this.logger.log(`Site ${this.siteStatus.url} is down with status code ${statusCode}`);
      this.triggerAlarm('down');
    } else {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.logger.log(`Site ${this.siteStatus.url} has been down for ${this.consecutiveFailures} consecutive checks`);
        this.triggerAlarm('down');
      }
    }
  }

  private triggerAlarm(status: 'up' | 'down'): void {
    if (Date.now() - (this.lastAlertTimestamp?.getTime() || 0) > this.alertInterval) {
      this.alarmService.sendAlarm(this.siteStatus.url, status);
      this.lastAlertTimestamp = new Date();
    }
  }

  private resetConsecutiveFailures(): void {
    this.consecutiveFailures = 0;
  }
}

export { UptimeMonitor };