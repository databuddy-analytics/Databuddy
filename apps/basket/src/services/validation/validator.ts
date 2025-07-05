import { 
  validatePayloadSize, 
  sanitizeString, 
  VALIDATION_LIMITS 
} from '../../utils/validation';
import { getWebsiteByIdV2, isValidOrigin } from '../../hooks/auth';
import { detectBot } from '../../utils/user-agent';
import { extractIpFromRequest } from '../../utils/ip-geo';
import { logger } from '../../lib/logger';
// @ts-ignore - autumn-js may not have type definitions
import { Autumn as autumn } from "autumn-js";

export interface ValidationRequest {
  body: any;
  query: any;
  request: Request;
}

export interface ValidationResult {
  success: boolean;
  data?: {
    clientId: string;
    userAgent: string;
    ip: string;
    ownerId?: string;
  };
  error?: {
    status: string;
    message: string;
  };
}

export interface BlockedTrafficData {
  request: Request;
  body: any;
  query: any;
  blockReason: string;
  blockCategory: string;
  botName?: string;
  clientId?: string;
}

export class ValidationService {
  async validateRequest(validationRequest: ValidationRequest): Promise<ValidationResult> {
    const { body, query, request } = validationRequest;
    
    // Payload size validation
    if (!validatePayloadSize(body, VALIDATION_LIMITS.PAYLOAD_MAX_SIZE)) {
      await this.logBlockedTraffic({
        request,
        body,
        query,
        blockReason: "payload_too_large",
        blockCategory: "Validation Error",
      });
      return { 
        success: false, 
        error: { status: "error", message: "Payload too large" } 
      };
    }

    // Client ID validation
    const clientId = sanitizeString(
      query.client_id,
      VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH,
    );
    
    if (!clientId) {
      await this.logBlockedTraffic({
        request,
        body,
        query,
        blockReason: "missing_client_id",
        blockCategory: "Validation Error",
      });
      return { 
        success: false, 
        error: { status: "error", message: "Missing client ID" } 
      };
    }

    // Website validation
    const website = await getWebsiteByIdV2(clientId);
    if (!website || website.status !== "ACTIVE") {
      await this.logBlockedTraffic({
        request,
        body,
        query,
        blockReason: "invalid_client_id",
        blockCategory: "Validation Error",
        clientId,
      });
      return {
        success: false,
        error: { status: "error", message: "Invalid or inactive client ID" },
      };
    }

    // Usage limit validation
    if (website.ownerId) {
      const { data } = await autumn.check({
        customer_id: website.ownerId,
        feature_id: "events",
        send_event: true,
      });

      if (!data?.allowed) {
        await this.logBlockedTraffic({
          request,
          body,
          query,
          blockReason: "exceeded_event_limit",
          blockCategory: "Validation Error",
          clientId,
        });
        return { 
          success: false, 
          error: { status: "error", message: "Exceeded event limit" } 
        };
      }
    }

    // Origin validation
    const origin = request.headers.get("origin");
    if (origin && !isValidOrigin(origin, website.domain)) {
      await this.logBlockedTraffic({
        request,
        body,
        query,
        blockReason: "origin_not_authorized",
        blockCategory: "Security Check",
        clientId,
      });
      return { 
        success: false, 
        error: { status: "error", message: "Origin not authorized" } 
      };
    }

    // Bot detection
    const userAgent = sanitizeString(
      request.headers.get("user-agent"),
      VALIDATION_LIMITS.STRING_MAX_LENGTH,
    ) || "";
    
    const botCheck = detectBot(userAgent, request);
    if (botCheck.isBot) {
      await this.logBlockedTraffic({
        request,
        body,
        query,
        blockReason: botCheck.reason || "unknown_bot",
        blockCategory: botCheck.category || "Bot Detection",
        botName: botCheck.botName,
        clientId,
      });
      return { 
        success: false, 
        error: { status: "ignored", message: "Bot detected" } 
      };
    }

    const ip = extractIpFromRequest(request);

    return {
      success: true,
      data: {
        clientId,
        userAgent,
        ip,
        ownerId: website.ownerId,
      },
    };
  }

  async logBlockedTraffic(data: BlockedTrafficData): Promise<void> {
    try {
      // This will be implemented by the storage service
      // For now, just log the blocked traffic
      logger.warn("Blocked traffic detected", {
        reason: data.blockReason,
        category: data.blockCategory,
        clientId: data.clientId,
        botName: data.botName,
      });
    } catch (error) {
      logger.error("Failed to log blocked traffic", { error: error as Error });
    }
  }
}

// Global validation service instance
export const validationService = new ValidationService();