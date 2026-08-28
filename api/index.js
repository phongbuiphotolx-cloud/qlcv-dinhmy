const app = require('../server');

module.exports = async function handler(req, res) {
  try {
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Serverless Function Crash Prevention]:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Internal Serverless Function Error'
      });
    }
  }
};
