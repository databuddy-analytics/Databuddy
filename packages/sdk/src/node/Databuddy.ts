import type {
  DatabuddyConfig,
  DatabuddyTracker,
  EventName,
  EventProperties,
  PropertiesForEvent,
} from "../core";
import { logger } from "../logger";

export class Databuddy implements DatabuddyTracker {
  constructor(config?: DatabuddyConfig) {
    this.config = {
      apiUrl: process.env.DATABUDDY_URL
        ? process.env.DATABUDDY_URL
        : "https://basket.databuddy.cc",
      clientId: process.env.DATABUDDY_CLIENTID,
      clientSecret: process.env.DATABUDDY_CLIENTSECRET,
      ...config,
    };
    if (!this.config.clientId) {
      throw new Error("Client Id required for server side event tracking.");
    }
  }

  config: DatabuddyConfig;

  screenView(_path?: string, _properties?: EventProperties): void {
    throw new Error("Method not implemented.");
  }
  setGlobalProperties(_properties: EventProperties): void {
    throw new Error("Method not implemented.");
  }
  clear(): void {
    throw new Error("Method not implemented.");
  }
  flush(): void {
    throw new Error("Method not implemented.");
  }

  async track<T extends EventName>(
    eventName: T,
    properties?: PropertiesForEvent<T>,
  ): Promise<void> {
    if (!this.config.apiUrl) {
      this.config.apiUrl = "https://basket.databuddy.cc";
    }

    const payload = {
      type: "track",
      payload: {
        eventId: crypto.randomUUID(),
        name: eventName,
        timestamp: Date.now(),
        ...properties,
      },
    };

    try {
      await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      if (e instanceof Error) {
        throw e;
      }
      logger.error(e);
    }
  }

  trackCustomEvent(_eventName: string, _properties?: EventProperties): void {}
}
