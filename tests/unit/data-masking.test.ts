/**
 * Data Masking Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { DataMasker, createDataMasker } from '../../src/utils/data-masking.js';

describe('DataMasker', () => {
  describe('maskValue', () => {
    it('should mask phone numbers by column name', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('phone', '13812345678')).toBe('138****5678');
      expect(masker.maskValue('mobile', '13912345678')).toBe('139****5678');
      expect(masker.maskValue('telephone', '13612345678')).toBe('136****5678');
    });

    it('should mask email addresses by column name', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('email', 'test@example.com')).toBe('t***@example.com');
      expect(masker.maskValue('user_email', 'john.doe@company.org')).toBe('j***@company.org');
    });

    it('should mask ID cards by column name', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('id_card', '110101199001011234')).toBe('110***********1234');
      expect(masker.maskValue('idcard', '110101199001011234')).toBe('110***********1234');
    });

    it('should mask bank cards by column name', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('bank_card', '6222021234567890123')).toBe('************0123');
      expect(masker.maskValue('card_number', '6222021234567890')).toBe('************7890');
    });

    it('should fully mask passwords and secrets', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('password', 'secret123')).toBe('******');
      expect(masker.maskValue('api_key', 'sk-1234567890')).toBe('******');
      expect(masker.maskValue('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe('******');
    });

    it('should partially mask names and addresses', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('real_name', '张三')).toBe('张*');
      expect(masker.maskValue('full_name', '李四五')).toBe('李*五');
      expect(masker.maskValue('address', '北京市朝阳区')).toBe('北****区');
    });

    it('should not mask null or undefined values', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('phone', null)).toBe(null);
      expect(masker.maskValue('email', undefined)).toBe(undefined);
    });

    it('should not mask empty strings', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('phone', '')).toBe('');
      expect(masker.maskValue('email', '   ')).toBe('   ');
    });
  });

  describe('auto-detection', () => {
    it('should auto-detect and mask phone numbers by format', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('some_field', '13812345678')).toBe('138****5678');
    });

    it('should auto-detect and mask email addresses by format', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('some_field', 'user@domain.com')).toBe('u***@domain.com');
    });

    it('should auto-detect and mask ID cards by format', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('some_field', '110101199001011234')).toBe('110***********1234');
    });

    it('should auto-detect and mask bank cards by format', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('some_field', '6222021234567890123')).toBe('************0123');
    });

    it('should not mask regular values', () => {
      const masker = new DataMasker();
      expect(masker.maskValue('status', 'active')).toBe('active');
      expect(masker.maskValue('count', '123')).toBe('123');
      expect(masker.maskValue('name', 'Product A')).toBe('Product A');
    });
  });

  describe('maskRow', () => {
    it('should mask sensitive columns in a row', () => {
      const masker = new DataMasker();
      const row = {
        id: 1,
        name: 'Test',
        phone: '13812345678',
        email: 'test@example.com',
        status: 'active',
      };

      const { maskedRow, maskedColumns } = masker.maskRow(row);

      // Note: non-sensitive values pass through unchanged (including type)
      expect(maskedRow.id).toBe(1);
      expect(maskedRow.name).toBe('Test');
      expect(maskedRow.phone).toBe('138****5678');
      expect(maskedRow.email).toBe('t***@example.com');
      expect(maskedRow.status).toBe('active');
      expect(maskedColumns).toContain('phone');
      expect(maskedColumns).toContain('email');
      expect(maskedColumns).not.toContain('status');
      expect(maskedColumns).not.toContain('id');
    });
  });

  describe('maskRows', () => {
    it('should mask sensitive columns in multiple rows', () => {
      const masker = new DataMasker();
      const rows = [
        { id: 1, phone: '13812345678' },
        { id: 2, phone: '13912345678' },
      ];

      const { maskedRows, maskedColumns } = masker.maskRows(rows);

      expect(maskedRows[0].phone).toBe('138****5678');
      expect(maskedRows[1].phone).toBe('139****5678');
      expect(maskedColumns).toContain('phone');
    });
  });

  describe('enabled/disabled', () => {
    it('should not mask when disabled', () => {
      const masker = new DataMasker(false);
      expect(masker.maskValue('phone', '13812345678')).toBe('13812345678');
      expect(masker.maskValue('email', 'test@example.com')).toBe('test@example.com');
    });

    it('should allow toggling enabled state', () => {
      const masker = new DataMasker(true);
      expect(masker.maskValue('phone', '13812345678')).toBe('138****5678');

      masker.setEnabled(false);
      expect(masker.maskValue('phone', '13812345678')).toBe('13812345678');

      masker.setEnabled(true);
      expect(masker.maskValue('phone', '13812345678')).toBe('138****5678');
    });
  });

  describe('custom rules', () => {
    it('should support custom masking rules', () => {
      const masker = new DataMasker(true, [
        { pattern: /^custom_field$/i, type: 'full' },
      ]);

      expect(masker.maskValue('custom_field', 'sensitive data')).toBe('******');
    });
  });

  describe('createDataMasker', () => {
    it('should create a DataMasker instance', () => {
      const masker = createDataMasker();
      expect(masker).toBeInstanceOf(DataMasker);
      expect(masker.isEnabled()).toBe(true);
    });

    it('should create a disabled DataMasker when specified', () => {
      const masker = createDataMasker(false);
      expect(masker.isEnabled()).toBe(false);
    });
  });
});
