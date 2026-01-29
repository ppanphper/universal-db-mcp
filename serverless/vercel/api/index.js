/**
 * Vercel Serverless Function Handler
 * Adapter for Universal Database MCP Server
 */

const { createHttpServer } = require('../../../dist/http/server.js');
const { loadConfig } = require('../../../dist/utils/config-loader.js');

let server;

/**
 * Initialize server (lazy loading)
 */
async function initServer() {
  if (!server) {
    const config = loadConfig();
    server = await createHttpServer(config);
  }
  return server;
}

/**
 * Vercel Handler
 */
module.exports = async (req, res) => {
  try {
    const fastify = await initServer();

    // Convert Vercel request to Fastify request
    const response = await fastify.inject({
      method: req.method,
      url: req.url,
      headers: req.headers,
      payload: req.body,
    });

    // Set response headers
    res.statusCode = response.statusCode;
    Object.entries(response.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    // Send response
    res.end(response.body);
  } catch (error) {
    console.error('Handler error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    }));
  }
};
