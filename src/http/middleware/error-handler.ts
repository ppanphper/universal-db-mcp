/**
 * Error Handler Middleware
 * Centralized error handling for HTTP API
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

/**
 * Global error handler
 */
export function setupErrorHandler(fastify: any): void {
  fastify.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Log error
    request.log.error(error);

    // Determine status code
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || 'INTERNAL_ERROR';

    // Send error response
    reply.code(statusCode).send({
      success: false,
      error: {
        code: errorCode,
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: request.id,
      },
    });
  });
}
