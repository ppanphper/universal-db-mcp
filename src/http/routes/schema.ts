/**
 * Schema Routes
 * Database schema and table information endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { TablesResponse, ApiResponse } from '../../types/http.js';
import type { SchemaInfo, TableInfo } from '../../types/adapter.js';
import { ConnectionManager } from '../../core/connection-manager.js';
import type { SchemaCacheStats } from '../../core/database-service.js';

/**
 * Schema 响应（包含缓存信息）
 */
interface SchemaWithCacheInfo extends SchemaInfo {
  _cacheInfo?: {
    cached: boolean;
    cachedAt?: string;
    hitRate: string;
  };
}

/**
 * 缓存状态响应
 */
interface CacheStatusResponse {
  sessionId: string;
  cache: SchemaCacheStats;
  hitRate: string;
}

export async function setupSchemaRoutes(
  fastify: FastifyInstance,
  connectionManager: ConnectionManager
): Promise<void> {
  /**
   * GET /api/tables
   * List all tables in the database
   */
  fastify.get<{
    Querystring: { sessionId: string; forceRefresh?: string };
    Reply: ApiResponse<TablesResponse>;
  }>('/api/tables', {
    schema: {
      querystring: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
          forceRefresh: { type: 'string', description: '是否强制刷新缓存 (true/false)' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, forceRefresh } = request.query;
      const shouldRefresh = forceRefresh === 'true';

      // Get database service
      const service = connectionManager.getService(sessionId);

      // List tables
      const tables = await service.listTables(shouldRefresh);

      return {
        success: true,
        data: { tables },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'LIST_TABLES_FAILED',
          message: error instanceof Error ? error.message : 'Failed to list tables',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * GET /api/schema
   * Get complete database schema
   */
  fastify.get<{
    Querystring: { sessionId: string; forceRefresh?: string };
    Reply: ApiResponse<SchemaWithCacheInfo>;
  }>('/api/schema', {
    schema: {
      querystring: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
          forceRefresh: { type: 'string', description: '是否强制刷新缓存 (true/false)' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId, forceRefresh } = request.query;
      const shouldRefresh = forceRefresh === 'true';

      // Get database service
      const service = connectionManager.getService(sessionId);

      // Get schema
      const schema = await service.getSchema(shouldRefresh);

      // Add cache info
      const cacheStats = service.getCacheStats();
      const response: SchemaWithCacheInfo = {
        ...schema,
        _cacheInfo: {
          cached: cacheStats.isCached,
          cachedAt: cacheStats.cachedAt?.toISOString(),
          hitRate: service.getCacheHitRate() + '%',
        },
      };

      return {
        success: true,
        data: response,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'GET_SCHEMA_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get schema',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * GET /api/schema/:table
   * Get information about a specific table
   */
  fastify.get<{
    Params: { table: string };
    Querystring: { sessionId: string; forceRefresh?: string };
    Reply: ApiResponse<TableInfo>;
  }>('/api/schema/:table', {
    schema: {
      params: {
        type: 'object',
        properties: {
          table: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
          forceRefresh: { type: 'string', description: '是否强制刷新缓存 (true/false)' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { table } = request.params;
      const { sessionId, forceRefresh } = request.query;
      const shouldRefresh = forceRefresh === 'true';

      // Get database service
      const service = connectionManager.getService(sessionId);

      // Get table info
      const tableInfo = await service.getTableInfo(table, shouldRefresh);

      return {
        success: true,
        data: tableInfo,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'GET_TABLE_INFO_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get table information',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * DELETE /api/cache
   * Clear schema cache for a session
   */
  fastify.delete<{
    Querystring: { sessionId: string };
    Reply: ApiResponse<{ cleared: boolean; message: string }>;
  }>('/api/cache', {
    schema: {
      querystring: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId } = request.query;

      // Get database service and clear cache
      const service = connectionManager.getService(sessionId);
      service.clearSchemaCache();

      return {
        success: true,
        data: {
          cleared: true,
          message: 'Schema 缓存已清除',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'CLEAR_CACHE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to clear cache',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });

  /**
   * GET /api/cache/status
   * Get cache status for a session
   */
  fastify.get<{
    Querystring: { sessionId: string };
    Reply: ApiResponse<CacheStatusResponse>;
  }>('/api/cache/status', {
    schema: {
      querystring: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { sessionId } = request.query;

      // Get database service
      const service = connectionManager.getService(sessionId);
      const cacheStats = service.getCacheStats();

      return {
        success: true,
        data: {
          sessionId,
          cache: cacheStats,
          hitRate: service.getCacheHitRate() + '%',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    } catch (error) {
      reply.code(500);
      return {
        success: false,
        error: {
          code: 'GET_CACHE_STATUS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get cache status',
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.id,
        },
      };
    }
  });
}
