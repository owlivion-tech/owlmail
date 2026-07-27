# Owlivion Home AI Bridge

Self-hosted AI backend for Owlivion Mail. It exposes an **Ollama-compatible**
HTTP API (`/api/generate`, `/api/tags`) but answers using **headless Claude Code**
(`claude -p`), which authenticates with your **Claude Code subscription** — so
there is no per-token API key in the client and email content never leaves your
home network except for the Claude Code call itself.

The Owlivion Mail client already ships an Ollama transport, so it needs no new
provider code — it just points at this bridge (`HOME_AI_URL`, default
`http://100.88.12.69:11500`).

## Requirements

- Node.js ≥ 18
- The `claude` CLI installed **and logged in** on the home server
  (`claude` → `/login`, using the subscription account).

## Run

```bash
cd owlivion-home-ai
PORT=11500 HOST=0.0.0.0 node server.js
```

Environment variables:

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `11500` | Listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI |
| `DEFAULT_MODEL` | `sonnet` | Model when the client doesn't specify one |
| `ALLOWED_MODELS` | `sonnet,haiku,opus` | Models the bridge will accept |

## Run as a service (systemd)

Copy `owlivion-home-ai.service` to `/etc/systemd/system/`, adjust the paths and
`User=`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now owlivion-home-ai
```

## Quick test

```bash
curl -s localhost:11500/api/tags
curl -s localhost:11500/api/generate \
  -d '{"model":"sonnet","prompt":"Reply with the single word OK."}'
```

## Security notes

- Bind it to your private/VPN interface (e.g. the Tailscale IP) rather than a
  public one, and/or firewall the port to trusted hosts.
- The bridge runs `claude` as its own OS user; keep that account's Claude Code
  session scoped to what you intend to expose.
