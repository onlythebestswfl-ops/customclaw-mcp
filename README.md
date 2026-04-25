# customclaw-mcp

[![npm version](https://img.shields.io/npm/v/customclaw-mcp.svg?style=flat-square)](https://www.npmjs.com/package/customclaw-mcp)
[![npm downloads](https://img.shields.io/npm/dm/customclaw-mcp.svg?style=flat-square)](https://www.npmjs.com/package/customclaw-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![smithery](https://img.shields.io/badge/smithery-onlythebestswfl%2Fcustomclaw-ff6a00?style=flat-square)](https://smithery.ai/servers/onlythebestswfl/customclaw)
[![MCP](https://img.shields.io/badge/MCP-stdio%20%7C%20HTTP-7c3aed?style=flat-square)](https://modelcontextprotocol.io)

> **Install, don't regenerate.** MCP server for the [CustomClaw](https://customclaw.company) registry — 37 vetted single-file utilities for LLM and agent code (rate limiters that respect `Retry-After`, JSON repair, response caches, retry with backoff, token counters, PII scrubbers). Your agent gets four native tool calls instead of 120 lines of plausible-looking new code.

📖 Background: [The utility-amnesia problem](https://customclaw.company/blog/utility-amnesia) — why your coding agent rewrote the same rate limiter 47 times.

## 30-second install

```bash
npx -y customclaw-mcp
```

Drop that command into your MCP client's config (snippets below) and you're done. Free tools install with no auth.

## What it does

Plugs the CustomClaw catalog (37 utilities, 32 free) into any Model Context Protocol host — Claude Desktop, Claude Code, Cursor, Windsurf, anything that speaks MCP — as four tools:

| Tool | Arguments | Purpose |
| --- | --- | --- |
| `list_utilities` | — | Full catalog (cached 5 min) |
| `search_utilities` | `query: string` | Fuzzy match on slug/name/description |
| `get_utility_info` | `slug: string` | Full detail for one utility |
| `install_utility` | `slug`, `target_dir`, `session_id?` | Fetch payload + write files |

## Install (by client)

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "customclaw": {
      "command": "npx",
      "args": ["-y", "customclaw-mcp"]
    }
  }
}
```

Restart Claude Desktop. Tools appear in the tool picker.

### Claude Code

```bash
claude mcp add customclaw -- npx -y customclaw-mcp
```

### Cursor / Windsurf / any stdio MCP host

Point the host at `npx -y customclaw-mcp`.

### Streamable HTTP (smithery, ChatGPT, etc.)

Use the hosted endpoint: `https://customclaw.company/mcp`. Registered on smithery as [`onlythebestswfl/customclaw`](https://smithery.ai/servers/onlythebestswfl/customclaw).

## Example prompts

Once connected:

- *"Add a rate limiter that respects Retry-After."* → `search_utilities` → `install_utility rate-limit-handler`
- *"I need to parse broken JSON from Claude output."* → `json-repair`
- *"What do you have for caching LLM responses?"* → `search_utilities` → short results table
- *"Install `token-optimiser` into `./src/lib`."* → direct `install_utility`
- *"Scan this project's prompts for injection — is there a tool?"* → `injection-scanner`

## Task → slug quick reference

| If you need… | Slug |
| --- | --- |
| Rate limiting with `Retry-After` handling | `rate-limit-handler` |
| JSON repair for LLM output | `json-repair` |
| Response cache by prompt hash | `response-cache` |
| Retry with exponential backoff | `retry-with-backoff` |
| Token counting across models | `token-optimiser` |
| PII scrubbing before logging | `pii-scrubber` |
| Prompt-injection scanner | `injection-scanner` |
| Cost forecaster per provider | `cost-forecaster` |

Full list via `list_utilities` or [customclaw.company/api/catalog](https://customclaw.company/api/catalog).

## Paid utilities

For paid utilities, pass the Stripe checkout `session_id` from your receipt email as the `session_id` argument to `install_utility`. Without it, the tool returns a helpful 401.

## Environment

- `CUSTOMCLAW_BASE` — registry base URL override (default `https://customclaw.company`). Useful for staging or self-hosted mirrors.

## How it works

- Node.js stdio MCP server. Dependency: `@modelcontextprotocol/sdk`.
- Catalog fetched from `GET /api/catalog`; cached 5 min per process.
- Payloads from `GET /api/cli?slug=<slug>[&session_id=<cs_...>]` — same endpoint the official `customclaw-cli` uses.
- `install_utility` refuses to write outside `target_dir` (path-traversal guard).

## Links

- Registry: [customclaw.company](https://customclaw.company)
- CLI companion: [`customclaw-cli`](https://www.npmjs.com/package/customclaw-cli)
- Source: [github.com/onlythebestswfl-ops/customclaw-mcp](https://github.com/onlythebestswfl-ops/customclaw-mcp)

## License

MIT.
