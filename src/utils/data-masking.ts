/**
 * 数据脱敏工具
 * 用于保护敏感数据，支持多种脱敏策略
 *
 * 支持的脱敏类型：
 * - phone: 手机号（138****1234）
 * - email: 邮箱（z***@example.com）
 * - idcard: 身份证（110***********1234）
 * - bankcard: 银行卡（************1234）
 * - password: 密码（******）
 * - partial: 部分隐藏（张*明）
 * - full: 完全隐藏（******）
 */

/**
 * 脱敏类型
 */
export type MaskType = 'phone' | 'email' | 'idcard' | 'bankcard' | 'password' | 'partial' | 'full';

/**
 * 脱敏规则
 */
export interface MaskingRule {
  /** 匹配模式（列名正则） */
  pattern: RegExp;
  /** 脱敏类型 */
  type: MaskType;
}

/**
 * 默认脱敏规则（按优先级排序）
 */
const DEFAULT_MASKING_RULES: MaskingRule[] = [
  // 密码类 - 完全隐藏
  { pattern: /^(password|passwd|pwd|secret|token|api_key|apikey|access_token|refresh_token)$/i, type: 'full' },

  // 手机号
  { pattern: /^(phone|mobile|tel|telephone|cellphone|phone_number|mobile_number|contact_phone|user_phone)$/i, type: 'phone' },

  // 邮箱
  { pattern: /^(email|mail|e_mail|email_address|user_email|contact_email)$/i, type: 'email' },

  // 身份证
  { pattern: /^(id_card|idcard|id_number|identity|citizen_id|ssn|social_security|identity_card|id_no)$/i, type: 'idcard' },

  // 银行卡
  { pattern: /^(bank_card|bankcard|card_number|card_no|account_number|account_no|bank_account)$/i, type: 'bankcard' },

  // 地址类 - 部分隐藏
  { pattern: /^(address|addr|home_address|work_address|detail_address)$/i, type: 'partial' },

  // 姓名类 - 部分隐藏
  { pattern: /^(real_name|realname|full_name|fullname|true_name|user_name|username|nick_name|nickname)$/i, type: 'partial' },
];

/**
 * 数据脱敏器类
 */
export class DataMasker {
  private rules: MaskingRule[];
  private enabled: boolean;

  constructor(enabled: boolean = true, customRules?: MaskingRule[]) {
    this.enabled = enabled;
    this.rules = customRules
      ? [...customRules, ...DEFAULT_MASKING_RULES]
      : DEFAULT_MASKING_RULES;
  }

  /**
   * 脱敏单个值
   * @param columnName - 列名
   * @param value - 原始值
   * @returns 脱敏后的值
   */
  maskValue(columnName: string, value: unknown): unknown {
    if (!this.enabled || value === null || value === undefined) {
      return value;
    }

    const stringValue = String(value);

    // 空字符串不处理
    if (stringValue.trim() === '') {
      return value;
    }

    // 根据列名匹配规则
    const rule = this.findMatchingRule(columnName);

    if (rule) {
      return this.applyMask(stringValue, rule.type);
    }

    // 自动检测敏感数据格式
    const maskedValue = this.autoDetectAndMask(stringValue);

    // 如果没有被脱敏，返回原始值（保持类型）
    if (maskedValue === stringValue) {
      return value;
    }

    return maskedValue;
  }

  /**
   * 脱敏一行数据
   * @param row - 原始行数据
   * @returns 脱敏后的行数据和被脱敏的列名
   */
  maskRow(row: Record<string, unknown>): {
    maskedRow: Record<string, unknown>;
    maskedColumns: string[];
  } {
    const maskedRow: Record<string, unknown> = {};
    const maskedColumns: string[] = [];

    for (const [key, value] of Object.entries(row)) {
      const maskedValue = this.maskValue(key, value);
      maskedRow[key] = maskedValue;

      if (maskedValue !== value) {
        maskedColumns.push(key);
      }
    }

    return { maskedRow, maskedColumns };
  }

  /**
   * 脱敏多行数据
   * @param rows - 原始行数据数组
   * @returns 脱敏后的行数据数组和被脱敏的列名
   */
  maskRows(rows: Record<string, unknown>[]): {
    maskedRows: Record<string, unknown>[];
    maskedColumns: string[];
  } {
    const allMaskedColumns = new Set<string>();
    const maskedRows = rows.map(row => {
      const { maskedRow, maskedColumns } = this.maskRow(row);
      maskedColumns.forEach(col => allMaskedColumns.add(col));
      return maskedRow;
    });

    return {
      maskedRows,
      maskedColumns: Array.from(allMaskedColumns),
    };
  }

  /**
   * 查找匹配的脱敏规则
   * @param columnName - 列名
   * @returns 匹配的规则或 undefined
   */
  private findMatchingRule(columnName: string): MaskingRule | undefined {
    return this.rules.find(rule => rule.pattern.test(columnName));
  }

  /**
   * 自动检测并脱敏（基于值的格式）
   * @param value - 原始值
   * @returns 脱敏后的值
   */
  private autoDetectAndMask(value: string): string {
    // 检测手机号格式（中国大陆）
    if (/^1[3-9]\d{9}$/.test(value)) {
      return this.applyMask(value, 'phone');
    }

    // 检测邮箱格式
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return this.applyMask(value, 'email');
    }

    // 检测身份证格式（18位）
    if (/^\d{17}[\dXx]$/.test(value)) {
      return this.applyMask(value, 'idcard');
    }

    // 检测银行卡格式（16-19位数字）
    if (/^\d{16,19}$/.test(value)) {
      return this.applyMask(value, 'bankcard');
    }

    return value;
  }

  /**
   * 应用脱敏
   * @param value - 原始值
   * @param type - 脱敏类型
   * @returns 脱敏后的值
   */
  private applyMask(value: string, type: MaskType): string {
    switch (type) {
      case 'phone':
        // 138****1234
        return value.length >= 11
          ? value.slice(0, 3) + '****' + value.slice(-4)
          : '****';

      case 'email':
        // z***@example.com
        const atIndex = value.indexOf('@');
        if (atIndex > 0) {
          const prefix = value.slice(0, 1);
          const domain = value.slice(atIndex);
          return prefix + '***' + domain;
        }
        return '***@***';

      case 'idcard':
        // 110***********1234
        return value.length >= 18
          ? value.slice(0, 3) + '***********' + value.slice(-4)
          : '***';

      case 'bankcard':
        // ************1234
        return value.length >= 4
          ? '************' + value.slice(-4)
          : '****';

      case 'password':
      case 'full':
        return '******';

      case 'partial':
        // 保留首尾，中间用 * 替换
        if (value.length <= 1) {
          return '*';
        }
        if (value.length === 2) {
          return value.slice(0, 1) + '*';
        }
        // 对于较长的字符串，保留首尾各1个字符
        const maskLength = value.length - 2;
        return value.slice(0, 1) + '*'.repeat(Math.min(maskLength, 6)) + value.slice(-1);

      default:
        return value;
    }
  }

  /**
   * 检查是否启用脱敏
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 设置是否启用脱敏
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 添加自定义脱敏规则
   * @param rule - 脱敏规则
   */
  addRule(rule: MaskingRule): void {
    // 添加到规则列表开头，优先级最高
    this.rules.unshift(rule);
  }
}

/**
 * 创建默认的数据脱敏器
 * @param enabled - 是否启用脱敏，默认 true
 * @returns DataMasker 实例
 */
export function createDataMasker(enabled: boolean = true): DataMasker {
  return new DataMasker(enabled);
}
