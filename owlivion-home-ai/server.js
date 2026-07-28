// ============================================================================
// OwlMail Pro Home AI Bridge  v2  (OpenAI-compat + MCP JSON-RPC)
// ============================================================================
// Self-hosted service that proxies AI requests to headless Claude Code
// (`claude -p`) using your subscription — no per-token API key.
//
// Transports:
//   - OpenAI:  POST /v1/chat/completions  |  GET /v1/models
//   - Ollama:  POST /api/generate         |  GET /api/tags
//   - MCP:     POST /mcp  (JSON-RPC 2.0, tools: summarize_email, generate_reply, analyze_phishing)
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
const ALLOWED_MODELS = (process.env.ALLOWED_MODELS || 'sonnet,haiku,opus')
  .split(',').map((m) => m.trim()).filter(Boolean);

// Auth token — set AUTH_TOKEN env var to require Bearer auth on all POST routes.
// Leave unset to run unauthenticated (local-only / dev mode).
const AUTH_TOKEN = process.env.AUTH_TOKEN || null;

function checkAuth(req) {
  if (!AUTH_TOKEN) return true; // auth disabled
  const header = req.headers['authorization'] || '';
  return header === `Bearer ${AUTH_TOKEN}`;
}

const AVAILABLE_MODELS = ALLOWED_MODELS.map((name) => ({
  name, model: name, size: 0, modified_at: new Date().toISOString(),
  details: { family: 'claude', format: 'claude-code' },
}));
const OPENAI_MODELS = ALLOWED_MODELS.map((name) => ({
  id: name, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'claude-code',
}));

// ─── Claude runner ──────────────────────────────────────────────────────────

function runClaude({ model, prompt, system }) {
  return new Promise((resolve, reject) => {
    const safeModel = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
    const args = ['-p', '--output-format', 'text', '--model', safeModel];
    if (system) args.push('--append-system-prompt', system);

    const child = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude exited ${code}: ${stderr.trim() || 'no stderr'}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.write(prompt || '');
    child.stdin.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 5_000_000) reject(new Error('body too large')); });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function addCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── MCP Tool definitions ────────────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: 'summarize_email',
    description: 'Summarize an email in 2-3 concise sentences.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Email text content' },
        language: { type: 'string', enum: ['tr', 'en'], description: 'Response language (tr=Turkish, en=English)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'generate_reply',
    description: 'Generate a reply to an email with the specified tone.',
    inputSchema: {
      type: 'object',
      properties: {
        emailContent: { type: 'string', description: 'Original email body' },
        emailSubject: { type: 'string', description: 'Original email subject' },
        senderName: { type: 'string', description: 'Name of the original sender' },
        tone: { type: 'string', enum: ['professional', 'friendly', 'formal', 'casual'] },
        language: { type: 'string', enum: ['tr', 'en'] },
      },
      required: ['emailContent'],
    },
  },
  {
    name: 'analyze_phishing',
    description: 'Analyze an email for phishing and security threats. Returns a JSON object.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Sender address (name <email>)' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body text' },
        language: { type: 'string', enum: ['tr', 'en'] },
      },
      required: ['body'],
    },
  },
];

// ─── MCP Tool handlers ───────────────────────────────────────────────────────

async function callMcpTool(name, args) {
  switch (name) {
    case 'summarize_email': {
      const lang = args.language === 'tr' ? 'Turkish' : 'English';
      const system = `Summarize this email in 2-3 sentences in ${lang}. Be concise and capture key points. Only output the summary — no preamble.`;
      return await runClaude({ model: DEFAULT_MODEL, prompt: String(args.content || ''), system });
    }
    case 'generate_reply': {
      const lang = args.language === 'tr' ? 'Turkish' : 'English';
      const toneMap = { professional: 'professional and business-appropriate', friendly: 'warm and approachable', formal: 'highly formal and respectful', casual: 'relaxed and conversational' };
      const tone = toneMap[args.tone] || toneMap.professional;
      const system = `You are an email assistant. Write a ${tone} reply in ${lang}. Keep it concise and natural. Only output the reply text — no subject line, no metadata, no explanations.`;
      const prompt = `Email from ${args.senderName || 'sender'}:\nSubject: ${args.emailSubject || '(no subject)'}\n\n${args.emailContent}`;
      return await runClaude({ model: DEFAULT_MODEL, prompt, system });
    }
    case 'analyze_phishing': {
      const lang = args.language === 'tr' ? 'Turkish' : 'English';
      const system = `You are a cybersecurity expert. Analyze this email for phishing indicators.
Respond ONLY with a valid JSON object (no markdown, no code blocks):
{"isPhishing":boolean,"riskLevel":"low"|"medium"|"high"|"critical","score":0-100,"reasons":["..."],"recommendations":["..."]}
Provide reasons and recommendations in ${lang}.`;
      const prompt = `From: ${args.from || 'unknown'}\nSubject: ${args.subject || ''}\n\n${args.body}`;
      return await runClaude({ model: DEFAULT_MODEL, prompt, system });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── HTTP server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  addCors(res);

  // Access log — enough to diagnose client problems without ever printing the
  // token itself (only whether an Authorization header was present).
  const peer = req.socket.remoteAddress || '?';
  const authState = req.headers['authorization'] ? 'auth:yes' : 'auth:no';
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(
      `${new Date().toISOString()} ${peer} ${req.method} ${req.url} ${authState} ` +
      `-> ${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });

  // CORS preflight
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Health — public, no auth needed
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return sendJson(res, 200, { status: 'ok', backend: 'claude-code', transports: ['openai', 'ollama', 'mcp'], models: ALLOWED_MODELS, auth: AUTH_TOKEN ? 'required' : 'disabled' });
    }

    // Auth guard — all non-GET routes (except health) require the Bearer token
    if (req.method === 'POST' && !checkAuth(req)) {
      return sendJson(res, 401, { error: 'Unauthorized — missing or invalid Bearer token' });
    }

    // Ollama: list models
    if (req.method === 'GET' && url.pathname === '/api/tags') {
      return sendJson(res, 200, { models: AVAILABLE_MODELS });
    }

    // Ollama: generate
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const model = body.model || DEFAULT_MODEL;
      const started = Date.now();
      const response = await runClaude({ model, prompt: body.prompt || '', system: body.system });
      return sendJson(res, 200, { model, created_at: new Date().toISOString(), response, done: true, total_duration: (Date.now() - started) * 1_000_000 });
    }

    // OpenAI: list models
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      return sendJson(res, 200, { object: 'list', data: OPENAI_MODELS });
    }

    // OpenAI: chat completions
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const model = body.model || DEFAULT_MODEL;
      const messages = body.messages || [];
      const systemMsg = messages.find((m) => m.role === 'system');
      const userMessages = messages.filter((m) => m.role !== 'system');
      const prompt = userMessages.map((m) => m.content).join('\n\n');
      const started = Date.now();
      const text = await runClaude({ model, prompt, system: systemMsg?.content });
      return sendJson(res, 200, {
        id: `chatcmpl-${Date.now()}`, object: 'chat.completion', created: Math.floor(started / 1000), model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }

    // ── MCP JSON-RPC 2.0 endpoint ────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/mcp') {
      const rawBody = await readBody(req);
      const rpc = JSON.parse(rawBody || '{}');
      const { method, params, id } = rpc;

      // MCP notifications have no id — acknowledge with 204
      if (id === undefined) {
        res.writeHead(204); res.end(); return;
      }

      const reply = (result) => sendJson(res, 200, { jsonrpc: '2.0', id, result });
      const rpcError = (code, message) => sendJson(res, 200, { jsonrpc: '2.0', id, error: { code, message } });

      switch (method) {
        case 'initialize':
          return reply({
            protocolVersion: '2024-11-05',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'owlmail-home-ai', version: '2.0.0' },
          });

        case 'ping':
          return reply({});

        case 'tools/list':
          return reply({ tools: MCP_TOOLS });

        case 'tools/call': {
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};
          if (!toolName) return rpcError(-32602, 'Missing tool name');
          try {
            const text = await callMcpTool(toolName, toolArgs);
            return reply({ content: [{ type: 'text', text }], isError: false });
          } catch (err) {
            return reply({ content: [{ type: 'text', text: err.message }], isError: true });
          }
        }

        default:
          return rpcError(-32601, `Method not found: ${method}`);
      }
    }

    // MCP capabilities probe (GET)
    if (req.method === 'GET' && url.pathname === '/mcp') {
      return sendJson(res, 200, {
        protocolVersion: '2024-11-05',
        transport: 'http-json-rpc',
        tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
      });
    }

    sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    console.error('[home-ai] error:', err.message);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Owlivion Home AI bridge v2 listening on http://${HOST}:${PORT}`);
  console.log(`  backend:    ${CLAUDE_BIN} (subscription auth)`);
  console.log(`  models:     ${ALLOWED_MODELS.join(', ')} (default: ${DEFAULT_MODEL})`);
  console.log(`  transports: OpenAI /v1/chat/completions | Ollama /api/generate | MCP /mcp`);
});
