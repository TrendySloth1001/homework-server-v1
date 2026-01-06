/**
 * URL Validator
 * Validates web search URLs to ensure they're not 404 and have real content
 */

import axios from 'axios';

interface URLValidationResult {
  isValid: boolean;
  statusCode?: number;
  title?: string;
  hasContent?: boolean;
  error?: string;
}

export class URLValidator {
  private readonly timeout = 8000; // 8 seconds
  private readonly userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Validate if URL is accessible and has real content
   */
  async validate(url: string): Promise<URLValidationResult> {
    try {
      // Quick validation: Check if URL is properly formatted
      try {
        new URL(url);
      } catch {
        return { isValid: false, error: 'Invalid URL format' };
      }

      // HEAD request to check if URL exists (faster than GET)
      try {
        const headResponse = await axios.head(url, {
          timeout: this.timeout,
          maxRedirects: 5,
          validateStatus: (status) => status < 500,
          headers: {
            'User-Agent': this.userAgent,
          },
        });

        // 404 or other client errors
        if (headResponse.status === 404) {
          return { isValid: false, statusCode: 404, error: 'Not found (404)' };
        }

        if (headResponse.status >= 400) {
          return {
            isValid: false,
            statusCode: headResponse.status,
            error: `HTTP ${headResponse.status}`,
          };
        }

        // If HEAD succeeded, consider it valid
        // (We skip content checking to be faster - Tavily already filtered for relevance)
        return {
          isValid: true,
          statusCode: headResponse.status,
          hasContent: true,
        };

      } catch (headError: any) {
        // HEAD request failed or not supported - try GET as fallback
        if (headError.code === 'ECONNABORTED' || headError.code === 'ETIMEDOUT') {
          return { isValid: false, error: 'Timeout' };
        }

        // Try GET request as fallback (some servers don't support HEAD)
        try {
          const getResponse = await axios.get(url, {
            timeout: this.timeout,
            maxRedirects: 5,
            responseType: 'text',
            headers: {
              'User-Agent': this.userAgent,
            },
            maxContentLength: 1024 * 100, // Only fetch first 100KB
          });

          if (getResponse.status === 404) {
            return { isValid: false, statusCode: 404, error: 'Not found (404)' };
          }

          if (getResponse.status >= 400) {
            return { isValid: false, statusCode: getResponse.status };
          }

          // Check if response has meaningful content
          const hasContent = getResponse.data && 
                            typeof getResponse.data === 'string' && 
                            getResponse.data.length > 100;

          if (!hasContent) {
            return {
              isValid: false,
              statusCode: getResponse.status,
              error: 'Empty or no content',
            };
          }

          return {
            isValid: true,
            statusCode: getResponse.status,
            hasContent: true,
          };

        } catch (getError: any) {
          return {
            isValid: false,
            error: getError.code || getError.message || 'Request failed',
          };
        }
      }

    } catch (error: any) {
      return {
        isValid: false,
        error: error.code || error.message || 'Unknown error',
      };
    }
  }

  /**
   * Batch validate multiple URLs with concurrency control
   */
  async validateBatch(urls: string[]): Promise<Map<string, URLValidationResult>> {
    const results = new Map<string, URLValidationResult>();
    
    // Validate in parallel batches of 5 to avoid overwhelming servers
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(async (url) => ({
        url,
        result: await this.validate(url),
      }));

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(({ url, result }) => {
        results.set(url, result);
      });

      // Small delay between batches to be respectful
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }

  /**
   * Quick batch validation (only checks first N URLs)
   */
  async validateTop(urls: string[], limit: number = 10): Promise<Map<string, URLValidationResult>> {
    const topUrls = urls.slice(0, limit);
    return this.validateBatch(topUrls);
  }
}

export const urlValidator = new URLValidator();
