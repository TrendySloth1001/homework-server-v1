/**
 * S3 URL Transformer Middleware
 * 
 * Intercepts all JSON responses and transforms internal S3 URLs
 * (e.g., http://minio:9000) to public-facing URLs (e.g., http://localhost:9000).
 * 
 * This ensures that all image/media URLs returned by the API are
 * resolvable by the client, regardless of how they were originally stored.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// The internal hostname used by Docker containers to communicate with MinIO
const INTERNAL_S3_PATTERNS = [
    'http://minio:9000',
    'https://minio:9000',
    'minio:9000', // Without protocol
];

/**
 * Get the public URL to use for S3 assets
 */
function getPublicS3Url(): string {
    return config.s3?.publicUrl || 'http://localhost:9000';
}

/**
 * Recursively transform all S3 URLs in an object
 */
function transformS3Urls(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle strings - the main transformation target
    if (typeof obj === 'string') {
        let result = obj;
        const publicUrl = getPublicS3Url();

        for (const pattern of INTERNAL_S3_PATTERNS) {
            if (result.includes(pattern)) {
                // Replace protocol-prefixed patterns first
                if (pattern.startsWith('http')) {
                    result = result.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), publicUrl);
                } else {
                    // For patterns without protocol, we need to be more careful
                    // Only replace if it's at the start of a URL-like string
                    const httpPattern = `http://${pattern}`;
                    const httpsPattern = `https://${pattern}`;
                    result = result.replace(new RegExp(httpPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), publicUrl);
                    result = result.replace(new RegExp(httpsPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), publicUrl.replace('http://', 'https://'));
                }
            }
        }

        return result;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => transformS3Urls(item));
    }

    // Handle objects
    if (typeof obj === 'object') {
        const transformed: any = {};
        for (const key of Object.keys(obj)) {
            transformed[key] = transformS3Urls(obj[key]);
        }
        return transformed;
    }

    // Return primitives as-is
    return obj;
}

/**
 * Express middleware that intercepts JSON responses and transforms S3 URLs
 */
export function s3UrlTransformerMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Store the original json method
    const originalJson = res.json.bind(res);

    // Override res.json to transform URLs before sending
    res.json = function (body: any): Response {
        try {
            const transformed = transformS3Urls(body);
            return originalJson(transformed);
        } catch (error) {
            console.error('[S3UrlTransformer] Error transforming response:', error);
            // If transformation fails, send the original response
            return originalJson(body);
        }
    };

    next();
}

/**
 * Utility function to transform a single URL string
 * Can be used directly in code where needed
 */
export function transformS3Url(url: string | null | undefined): string | null | undefined {
    if (!url) return url;
    return transformS3Urls(url) as string;
}
