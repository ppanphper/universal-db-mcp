/**
 * Adapter Factory Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { createAdapter, normalizeDbType, validateDbConfig } from '../../src/utils/adapter-factory';
import type { DbConfig } from '../../src/types/adapter';

describe('Adapter Factory', () => {
  describe('normalizeDbType', () => {
    it('should normalize mssql to sqlserver', () => {
      expect(normalizeDbType('mssql')).toBe('sqlserver');
    });

    it('should normalize opengauss to gaussdb', () => {
      expect(normalizeDbType('opengauss')).toBe('gaussdb');
    });

    it('should keep valid types unchanged', () => {
      expect(normalizeDbType('mysql')).toBe('mysql');
      expect(normalizeDbType('postgres')).toBe('postgres');
    });

    it('should throw error for invalid types', () => {
      expect(() => normalizeDbType('invalid')).toThrow();
    });
  });

  describe('validateDbConfig', () => {
    it('should validate SQLite config', () => {
      const config: DbConfig = {
        type: 'sqlite',
        filePath: '/path/to/db.sqlite'
      };
      expect(() => validateDbConfig(config)).not.toThrow();
    });

    it('should throw error for SQLite without filePath', () => {
      const config: DbConfig = {
        type: 'sqlite'
      };
      expect(() => validateDbConfig(config)).toThrow('filePath');
    });

    it('should validate MySQL config', () => {
      const config: DbConfig = {
        type: 'mysql',
        host: 'localhost',
        port: 3306
      };
      expect(() => validateDbConfig(config)).not.toThrow();
    });

    it('should throw error for MySQL without host/port', () => {
      const config: DbConfig = {
        type: 'mysql'
      };
      expect(() => validateDbConfig(config)).toThrow();
    });
  });

  describe('createAdapter', () => {
    it('should create MySQL adapter', () => {
      const config: DbConfig = {
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test'
      };
      const adapter = createAdapter(config);
      expect(adapter).toBeDefined();
    });

    it('should create PostgreSQL adapter', () => {
      const config: DbConfig = {
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'password',
        database: 'test'
      };
      const adapter = createAdapter(config);
      expect(adapter).toBeDefined();
    });
  });
});
