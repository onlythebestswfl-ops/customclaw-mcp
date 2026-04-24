# customclaw-mcp

A Model Context Protocol (MCP) server that plugs the [CustomClaw](https://customclaw.company) registry directly into MCP-capable LLM hosts — Claude Desktop, Claude Code, Cursor, Windsurf, and anything else that speaks MCP. Your assistant can browse the CustomClaw catalog, look up a specific utility, and drop its files straight into the project you're working on, all as native tool calls. No copy-paste, no context switching.

## What is CustomClaw?

[CustomClaw](https://customclaw.company) is a curated registry of drop-in developer utilities — small, battle-tested modules you paste into a project (token optimisers, Stripe helpers, auth wrappers, etc.). Some are free, some are paid. Normally you'd grab them via the `customclaw-cli` or the web UI. This MCP server lets your AI assistant do it for you.

## Install as an MCP server

### Claude Desktop

Add this to your `claude_desktop_config.json` (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

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

Restart Claude Desktop. You should see the CustomClaw tools available in the tool picker.

### Claude Code

```bash
claude mcp add customclaw -- npx -y customclaw-mcp
```

### Cursor / Windsurf / other MCP hosts

Point your host at the same command: `npx -y customclaw-mcp` over stdio.

### Environment variables

- `CUSTOMCLAW_BASE` — override the registry base URL (defaults to `https://customclaw.company`). Useful for staging or self-hosted mirrors.

## Tools exposed

| Tool | Arguments | What it does |
| --- | --- | --- |
| `list_utilities` | *(none)* | Returns the full CustomClaw catalog (utilities + agents). Cached for 5 minutes. |
| `search_utilities` | `query: string` | Fuzzy-matches against slug / name / tagline / description / category. Returns the top 25 results. |
| `get_utility_info` | `slug: string` | Full catalog entry for a single utility or agent. |
| `install_utility` | `slug: string`, `target_dir: string`, `session_id?: string` | Fetches the file payload and writes it into `target_dir`. Returns the list of files written plus any npm dependencies the host agent should install. **Does not run `npm install` itself** — that's the host's call. |

### Paid utilities

For paid utilities, pass the Stripe `session_id` from your CustomClaw receipt email — it appears as `session_id=cs_...` in the download link. Without it, the registry returns 401 and the tool surfaces a helpful error.

## Example prompts

Once the server is wired up, try these in your MCP host:

- *"What CustomClaw utilities are available? Just the free ones."*
- *"Search CustomClaw for anything related to token counting or context optimisation."*
- *"Tell me what `stripe-receipts` does — full details."*
- *"Install the `token-optimiser` utility into `./src/lib`."*
- *"I bought `pro-auth-kit`, here's my session id `cs_live_a1b2c3...`. Install it into this project."*

## How it works

- Node.js stdio MCP server built on `@modelcontextprotocol/sdk`.
- Catalog is fetched from `GET /api/catalog` and cached in memory for 5 minutes.
- File payloads come from `GET /api/cli?slug=<slug>[&session_id=<cs_...>]` — same endpoint the official `customclaw-cli` uses.
- `install_utility` refuses to write outside `target_dir` (no `..` path traversal).

## Links

- Registry: https://customclaw.company
- CLI companion: [`customclaw-cli`](https://www.npmjs.com/package/customclaw-cli) on npm
- Issues / feature requests: onlythebestswfl@gmail.com

## License

MIT
