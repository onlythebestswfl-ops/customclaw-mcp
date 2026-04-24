#!/usr/bin/env node

/**
 * customclaw-mcp — Model Context Protocol server for the CustomClaw registry.
 *
 * Exposes four tools over stdio so MCP hosts (Claude Desktop, Claude Code, Cursor, etc.)
 * can discover and install CustomClaw developer utilities as native tools:
 *
 *   - list_utilities       — full catalog (5-minute cache)
 *   - search_utilities     — fuzzy match across slug/name/tagline/description
 *   - get_utility_info     — full entry for a single slug
 *   - install_utility      — fetch payload and write files to target_dir
 *
 * Env:
 *   CUSTOMCLAW_BASE  override the registry base URL (default https://customclaw.company)
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs');
const path = require('path');

const SITE_BASE = process.env.CUSTOMCLAW_BASE || 'https://customclaw.company';
const CATALOG_TTL_MS = 5 * 60 * 1000;

// ---------- catalog cache ----------
let catalogCache = { data: null, ts: 0 };

async function fetchCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force && catalogCache.data && now - catalogCache.ts < CATALOG_TTL_MS) {
    return catalogCache.data;
  }
  const res = await fetch(`${SITE_BASE}/api/catalog`);
  if (!res.ok) {
    throw new Error(`Catalog fetch failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  catalogCache = { data, ts: now };
  return data;
}

// ---------- helpers ----------
function allEntries(catalog) {
  const utils = (catalog.utilities || []).map((u) => ({ ...u, kind: 'utility' }));
  const agents = (catalog.agents || []).map((a) => ({ ...a, kind: 'agent' }));
  return [...utils, ...agents];
}

function findBySlug(catalog, slug) {
  return allEntries(catalog).find((e) => e.slug === slug) || null;
}

function scoreMatch(entry, q) {
  const query = q.toLowerCase().trim();
  if (!query) return 0;
  const fields = [
    [entry.slug || '', 4],
    [entry.name || '', 3],
    [entry.tagline || '', 2],
    [entry.description || '', 1],
    [entry.category || '', 1],
  ];
  let score = 0;
  for (const [val, weight] of fields) {
    const v = String(val).toLowerCase();
    if (!v) continue;
    if (v === query) score += weight * 10;
    else if (v.includes(query)) score += weight * 3;
    else {
      // token match
      const tokens = query.split(/\s+/).filter(Boolean);
      for (const t of tokens) {
        if (v.includes(t)) score += weight;
      }
    }
  }
  return score;
}

function fuzzySearch(catalog, query) {
  return allEntries(catalog)
    .map((e) => ({ entry: e, score: scoreMatch(e, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)
    .map((x) => x.entry);
}

function textResult(text) {
  return { content: [{ type: 'text', text }] };
}

function jsonResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}

// ---------- tool: install_utility ----------
async function installUtility({ slug, target_dir, session_id }) {
  if (!slug || typeof slug !== 'string') {
    throw new Error('slug is required (string)');
  }
  if (!target_dir || typeof target_dir !== 'string') {
    throw new Error('target_dir is required (string, absolute or relative directory)');
  }

  const url = new URL(`${SITE_BASE}/api/cli`);
  url.searchParams.set('slug', slug);
  if (session_id) url.searchParams.set('session_id', session_id);

  const res = await fetch(url.toString());

  if (res.status === 401) {
    throw new Error(
      `This utility is paid and requires proof of purchase. ` +
      `Pass session_id (the Stripe checkout session_id) — you'll find session_id=... ` +
      `in the download URL from your CustomClaw receipt email. ` +
      `Then call install_utility again with { slug: "${slug}", target_dir, session_id: "cs_..." }.`
    );
  }
  if (res.status === 404) {
    throw new Error(`No utility with slug "${slug}". Use list_utilities or search_utilities to find valid slugs.`);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
    } catch {
      // body wasn't JSON, keep generic message
    }
    throw new Error(`Registry error: ${msg}`);
  }

  const payload = await res.json();
  const { files = [], dependencies = [], message } = payload;

  // Resolve target_dir against cwd if relative.
  const resolvedDir = path.isAbsolute(target_dir)
    ? target_dir
    : path.resolve(process.cwd(), target_dir);

  const written = [];
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      continue;
    }
    // Join and ensure the final path stays inside resolvedDir (defence against "../").
    const destPath = path.resolve(resolvedDir, file.path);
    const rel = path.relative(resolvedDir, destPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Refusing to write outside target_dir: ${file.path}`);
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, file.content);
    written.push(destPath);
  }

  return {
    slug,
    target_dir: resolvedDir,
    files_written: written,
    dependencies,
    dependencies_install_hint:
      dependencies.length > 0
        ? `Run one of: npm install ${dependencies.join(' ')}  |  yarn add ${dependencies.join(' ')}  |  pnpm add ${dependencies.join(' ')}`
        : 'No dependencies required.',
    message: message || 'Utility successfully written.',
  };
}

// ---------- MCP server ----------
const server = new Server(
  {
    name: 'customclaw-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const TOOLS = [
  {
    name: 'list_utilities',
    description:
      'List every utility and agent available in the CustomClaw registry (https://customclaw.company). ' +
      'Results are cached for 5 minutes. Returns catalog JSON with utilities and agents arrays.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'search_utilities',
    description:
      'Fuzzy-search the CustomClaw registry by keyword. Matches across slug, name, tagline, description, and category. ' +
      'Returns the top 25 matches sorted by relevance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword(s) to search for, e.g. "token optimiser" or "stripe".',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_utility_info',
    description:
      'Return the full catalog entry for a single utility or agent by slug (name, tagline, description, price, free flag, category, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The utility or agent slug, e.g. "token-optimiser".',
        },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'install_utility',
    description:
      'Fetch a CustomClaw utility payload and write its files into target_dir. ' +
      'For paid utilities, pass session_id (the Stripe checkout session_id from the buyer\'s receipt email). ' +
      'Returns the list of files written and any npm dependencies the caller should install — ' +
      'this tool does NOT run npm install itself; the host agent decides when to install deps.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The utility slug to install.',
        },
        target_dir: {
          type: 'string',
          description:
            'Directory to write files into. Absolute path preferred; relative paths are resolved against the server process cwd.',
        },
        session_id: {
          type: 'string',
          description:
            'Optional. Stripe checkout session_id for paid utilities. Found as session_id=... in the CustomClaw receipt email download URL.',
        },
      },
      required: ['slug', 'target_dir'],
      additionalProperties: false,
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'list_utilities': {
        const catalog = await fetchCatalog();
        return jsonResult(catalog);
      }
      case 'search_utilities': {
        if (!args.query || typeof args.query !== 'string') {
          return textResult('Error: query is required (string).');
        }
        const catalog = await fetchCatalog();
        const matches = fuzzySearch(catalog, args.query);
        if (matches.length === 0) {
          return textResult(`No matches for "${args.query}". Try list_utilities to browse the full catalog.`);
        }
        return jsonResult({ query: args.query, count: matches.length, results: matches });
      }
      case 'get_utility_info': {
        if (!args.slug || typeof args.slug !== 'string') {
          return textResult('Error: slug is required (string).');
        }
        const catalog = await fetchCatalog();
        const entry = findBySlug(catalog, args.slug);
        if (!entry) {
          return textResult(
            `No utility or agent with slug "${args.slug}". Use search_utilities or list_utilities to find valid slugs.`
          );
        }
        return jsonResult(entry);
      }
      case 'install_utility': {
        const result = await installUtility({
          slug: args.slug,
          target_dir: args.target_dir,
          session_id: args.session_id,
        });
        return jsonResult(result);
      }
      default:
        return textResult(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${err && err.message ? err.message : String(err)}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio server stays alive until the host closes the pipe — nothing to log to stdout
  // (stdout is the MCP transport). Errors go to stderr.
}

main().catch((err) => {
  console.error('[customclaw-mcp] fatal:', err);
  process.exit(1);
});
