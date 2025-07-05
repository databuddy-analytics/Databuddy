import { getWebsiteByIdV2, isValidOrigin } from '../../hooks/auth';
import type { WebsiteWithOwner } from '../../types/services';

export interface AuthResult {
  success: boolean;
  website?: WebsiteWithOwner;
  error?: string;
}

export interface OriginValidationResult {
  isValid: boolean;
  error?: string;
}

export class AuthService {
  async getWebsite(clientId: string): Promise<AuthResult> {
    try {
      const website = await getWebsiteByIdV2(clientId);
      
      if (!website) {
        return {
          success: false,
          error: 'Website not found'
        };
      }
      
      if (website.status !== 'ACTIVE') {
        return {
          success: false,
          error: 'Website is not active'
        };
      }
      
      return {
        success: true,
        website
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get website: ${error}`
      };
    }
  }
  
  validateOrigin(origin: string | null, allowedDomain: string): OriginValidationResult {
    if (!origin) {
      return { isValid: true }; // No origin header is allowed
    }
    
    try {
      const isValid = isValidOrigin(origin, allowedDomain);
      return { isValid };
    } catch (error) {
      return {
        isValid: false,
        error: `Origin validation failed: ${error}`
      };
    }
  }
  
  async isWebsiteActive(clientId: string): Promise<boolean> {
    const result = await this.getWebsite(clientId);
    return result.success && result.website?.status === 'ACTIVE';
  }
}

// Global auth service instance
export const authService = new AuthService();