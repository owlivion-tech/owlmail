// ============================================================================
// OwlMail Pro Home AI Bridge
// ============================================================================
// Self-hosted service that proxies AI requests to headless Claude Code
// (`claude -p`) using your subscription — no per-token API key.
//
// Supports two API formats so OwlMail Pro can call it directly:
//   - Ollama:  POST /api/generate  |  GET /api/tags
//   - OpenAI:  POST /v1/chat/completions  |  GET /v1/models
//
//   Run:   PORT=11500 node server.js
//   Needs: the `claude` CLI installed and logged in on this machine.
// ============================================================================

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = parseInt(process.env.PORT || '11500', 10);
const HOST = process.env.HOST || '0.0.0.0';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'sonnet';
// Comma-separated allowlist of models this bridge will pass to `claude --model`.
const ALLOWED_MODELS = (process.env.ALLOWED_MODELS || 'sonnet,haiku,opus')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const AVAILABLE_MODELS = ALLOWED_MODELS.map((name) => ({
  name,
  model: name,
  size: 0,
  modified_at: new Date().toISOString(),
  details: { family: 'claude', format: 'claude-code' },
}));

// OpenAI-format model list
const OPENAI_MODELS = ALLOWED_MODELS.map((name) => ({
  id: name,
  object: 'model',
  created: Math.floor(Date.now() / 1000),
  owned_by: 'claude-code',
}));

/** Run one non-interactive Claude Code turn and resolve with its text output. */
function runClaude({ model, prompt, system }) {
  return new Promise((resolve, reject) => {
    const safeModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
    const args = ['-p', '--output-format', 'text', '--model', safeModel];
    if (system) args.push('--append-system-prompt', system);

    const child = spawn(CLAUDE_BIN, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });

    // Feed the user prompt over stdin so long emails aren't shell-escaped.
    // Guard against EPIPE if the child exits before reading its input.
    child.stdin.on('error', () => {});
    child.stdin.write(prompt || '');
    child.stdin.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Ollama: list available models.
    if (req.method === 'GET' && url.pathname === '/api/tags') {
      return sendJson(res, 200, { models: AVAILABLE_MODELS });
    }

    // Health check.
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return sendJson(res, 200, { status: 'ok', backend: 'claude-code', models: ALLOWED_MODELS });
    }

    // Ollama: generate a completion.
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const model = body.model || DEFAULT_MODEL;
      const started = Date.now();
      const response = await runClaude({
        model,
        prompt: body.prompt || '',
        system: body.system,
      });
      return sendJson(res, 200, {
        model,
        created_at: new Date().toISOString(),
        response,
        done: true,
        total_duration: (Date.now() - started) * 1_000_000,
      });
    }

    // OpenAI: list models.
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return sendJson(res, 200, { object: 'list', data: OPENAI_MODELS });
    }

    // OpenAI: chat completions — maps messages[] → single Claude prompt.
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const model = body.model || DEFAULT_MODEL;
      const messages = body.messages || [];

      // Extract system prompt and build user prompt from message history
      const systemMsg = messages.find((m) => m.role === 'system');
      const userMessages = messages.filter((m) => m.role !== 'system');
      const prompt = userMessages.map((m) => m.content).join('\n\n');

      const started = Date.now();
      const text = await runClaude({
        model,
        prompt,
        system: systemMsg?.content,
      });

      return sendJson(res, 200, {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(started / 1000),
        model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[home-ai] error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Owlivion Home AI bridge listening on http://${HOST}:${PORT}`);
  console.log(`  backend: ${CLAUDE_BIN} (subscription auth)`);
  console.log(`  models:  ${ALLOWED_MODELS.join(', ')} (default: ${DEFAULT_MODEL})`);
});
