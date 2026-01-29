
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distIndex = path.resolve(projectRoot, 'dist/index.js');
const dbFile = path.resolve(projectRoot, 'test_verify.db');

// 初始化 SQLite 数据库
import Database from 'better-sqlite3';
const db = new Database(dbFile);
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  );
  INSERT OR IGNORE INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com');
  INSERT OR IGNORE INTO users (id, name, email) VALUES (2, 'Bob', 'bob@example.com');
`);
db.close();

console.log('✅ 测试数据库已准备:', dbFile);

// 启动 MCP Server
const serverProcess = spawn('node', [distIndex, '--type', 'sqlite', '--file', dbFile], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr
});

serverProcess.stderr.on('data', (data) => {
    console.error('Server Log:', data.toString());
});

serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (code !== 0) {
        console.error('❌ Server 非正常退出');
        process.exit(code);
    }
});

let messageId = 0;

function sendRequest(method, params) {
    if (serverProcess.killed || serverProcess.exitCode !== null) {
        console.error('❌ Server 已退出，无法发送请求');
        return;
    }
    const request = {
        jsonrpc: '2.0',
        id: messageId++,
        method,
        params,
    };
    const jsonStr = JSON.stringify(request);
    try {
        serverProcess.stdin.write(jsonStr + '\n');
        console.log('📤 发送:', jsonStr);
    } catch (err) {
        console.error('❌ 发送失败:', err);
    }
}

serverProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const response = JSON.parse(line);
            console.log('📥 收到:', JSON.stringify(response, null, 2));

            if (response.id !== undefined) {
                handleResponse(response);
            }
        } catch (e) {
            console.log('收到非 JSON 输出:', line);
        }
    }
});

const steps = [
    {
        name: 'Initialize',
        action: () => sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'verify-script', version: '1.0.0' }
        })
    },
    {
        name: 'List Tools',
        action: () => sendRequest('tools/list', {})
    },
    {
        name: 'List Databases',
        action: () => sendRequest('tools/call', {
            name: 'list_databases',
            arguments: {}
        })
    },
    {
        name: 'List Tables',
        action: () => sendRequest('tools/call', {
            name: 'list_tables',
            arguments: {}
        })
    },
    {
        name: 'Get Schema',
        action: () => sendRequest('tools/call', {
            name: 'get_schema',
            arguments: { tableNames: ['users'] } // 测试参数过滤
        })
    },
    {
        name: 'Execute Query',
        action: () => sendRequest('tools/call', {
            name: 'execute_query',
            arguments: { query: 'SELECT * FROM users' }
        })
    }
];

let currentStep = 0;

function handleResponse(response) {
    if (response.error) {
        console.error('❌ 步骤失败:', steps[currentStep]?.name, response.error);
        process.exit(1);
    }

    // 检查特定步骤的响应内容
    if (steps[currentStep].name === 'Get Schema') {
        const result = response.result;
        // 简单验证是否包含 expected data
        if (!JSON.stringify(result).includes('users')) {
            console.warn('⚠️ Schema 响应未包含 users 表信息');
        }
    }

    currentStep++;
    if (currentStep < steps.length) {
        console.log(`\n--- 执行步骤 ${currentStep + 1}/${steps.length}: ${steps[currentStep].name} ---`);
        steps[currentStep].action();
    } else {
        console.log('\n✅ 所有验证步骤完成！');
        process.exit(0);
    }
}

// 开始测试
console.log(`\n--- 执行步骤 1/${steps.length}: ${steps[0].name} ---`);
steps[0].action();

// 超时保护
setTimeout(() => {
    console.error('❌ 测试超时');
    process.exit(1);
}, 10000);
