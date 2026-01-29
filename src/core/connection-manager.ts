/**
 * Connection Manager
 * Manages database connections and sessions
 * Supports both single-connection (MCP) and multi-session (HTTP) modes
 */

import { nanoid } from 'nanoid';
import type { DbAdapter, DbConfig } from '../types/adapter.js';
import type { Session } from '../types/http.js';
import { createAdapter } from '../utils/adapter-factory.js';
import { DatabaseService, SchemaCacheConfig } from './database-service.js';

/**
 * 扩展的会话接口，包含 DatabaseService 实例
 */
interface ExtendedSession extends Session {
  /** DatabaseService 实例（带缓存） */
  service: DatabaseService;
}

/**
 * Connection Manager Class
 */
export class ConnectionManager {
  private sessions: Map<string, ExtendedSession> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private sessionTimeout: number;
  private defaultCacheConfig: Partial<SchemaCacheConfig>;

  constructor(
    sessionTimeout: number = 3600000,
    cleanupInterval: number = 300000,
    defaultCacheConfig?: Partial<SchemaCacheConfig>
  ) {
    this.sessionTimeout = sessionTimeout;
    this.defaultCacheConfig = defaultCacheConfig || {};

    // Start cleanup interval
    if (cleanupInterval > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupExpiredSessions();
      }, cleanupInterval);
    }
  }

  /**
   * Create a new connection and return session ID
   */
  async connect(config: DbConfig): Promise<string> {
    // Create adapter
    const adapter = createAdapter(config);

    // Connect to database
    await adapter.connect();

    // Generate session ID
    const sessionId = nanoid();

    // Create DatabaseService with cache support
    const service = new DatabaseService(adapter, config, this.defaultCacheConfig);

    // Store session with service
    const session: ExtendedSession = {
      id: sessionId,
      adapter,
      config,
      service,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Disconnect a session
   */
  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    // Clear schema cache before disconnecting
    session.service.clearSchemaCache();

    // Disconnect adapter
    await session.adapter.disconnect();

    // Remove session
    this.sessions.delete(sessionId);
  }

  /**
   * Get adapter for a session
   */
  getAdapter(sessionId: string): DbAdapter {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();

    return session.adapter;
  }

  /**
   * Get database service for a session
   * Returns the cached DatabaseService instance to preserve schema cache
   */
  getService(sessionId: string): DatabaseService {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在或已过期`);
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();

    // Return the existing service instance (preserves cache)
    return session.service;
  }

  /**
   * Check if session exists
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clear schema cache for a specific session
   */
  clearSessionCache(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.service.clearSchemaCache();
    }
  }

  /**
   * Clear schema cache for all sessions
   */
  clearAllCaches(): void {
    for (const session of this.sessions.values()) {
      session.service.clearSchemaCache();
    }
    console.error(`🗑️ 已清除所有会话的 Schema 缓存 (共 ${this.sessions.size} 个会话)`);
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      const lastAccessed = session.lastAccessedAt.getTime();
      const elapsed = now - lastAccessed;

      if (elapsed > this.sessionTimeout) {
        // Clear cache and disconnect
        session.service.clearSchemaCache();
        session.adapter.disconnect().catch((err: Error) => {
          console.error(`清理会话 ${sessionId} 时出错:`, err);
        });

        this.sessions.delete(sessionId);
        console.log(`🧹 清理过期会话: ${sessionId}`);
      }
    }
  }

  /**
   * Disconnect all sessions and stop cleanup
   */
  async disconnectAll(): Promise<void> {
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear all caches and disconnect all sessions
    const disconnectPromises = Array.from(this.sessions.values()).map(session => {
      session.service.clearSchemaCache();
      return session.adapter.disconnect().catch((err: Error) => {
        console.error(`断开会话 ${session.id} 时出错:`, err);
      });
    });

    await Promise.all(disconnectPromises);

    // Clear sessions
    this.sessions.clear();
  }
}
