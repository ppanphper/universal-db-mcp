/**
 * Authentication Middleware
 * API Key authentication for HTTP API
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../../types/http.js';

/**
 * API Key authentication hook
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig
): Promise<void> {
  // Skip auth for health and info endpoints
  if (request.url === '/api/health' || request.url === '/api/info') {
    return;
  }

  // Get API key from header
  const apiKey =
    request.headers['x-api-key'] ||
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.substring(7)
      : null);

  if (!apiKey) {
    reply.code(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'API key required. Provide X-API-Key header or Authorization: Bearer <key>',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
    return;
  }

  // Validate API key
  const validKeys = config.http?.apiKeys || [];
  if (validKeys.length > 0 && !validKeys.includes(apiKey as string)) {
    reply.code(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Invalid API key',
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
    return;
  }

  // Store API key in request for later use
  (request as any).apiKey = apiKey;
}
