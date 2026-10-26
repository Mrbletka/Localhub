// Model Context Protocol endpoint (Streamable HTTP, JSON responses) so external agents -
// Claude Code, Claude Desktop, or any MCP client - can read and write the workspace with
// the same tools the built-in agents use.
//   claude mcp add --transport http localhub http://127.0.0.1:3737/mcp
import { TOOLS, runTool } from './agents/tools.js';
import { CORE_RULES } from './bedrock/knowledge.js';
import { STUDIO_VERSION } from './bedrock/versions.js';

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `Localhub Bedrock Studio workspace. Each top-level folder is a Minecraft Bedrock add-on project
(BP/ behavior pack, RP/ resource pack, project.json, DESIGN.md). Paths are relative to the workspace root, e.g.
"ruby-tycoon/BP/scripts/main.js". Start with list_projects, read the project's DESIGN.md, and run validate_project after edits.

${CORE_RULES}`;

const publicTools = () => TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleOne(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined || msg.id === null;
  const { method, params = {} } = msg;
  const reply = (result) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, result });

  switch (method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'localhub-bedrock-studio', version: STUDIO_VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: publicTools() });
    case 'tools/call': {
      const name = params.name;
      if (!TOOLS.some((t) => t.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const res = await runTool(name, params.arguments ?? {}, ctx);
      const content = [{ type: 'text', text: res.text }];
      for (const img of res.images || []) content.push({ type: 'image', data: img.data, mimeType: img.mediaType });
      return reply({ content, isError: !res.ok });
    }
    case 'resources/list':
      return reply({ resources: [] });
    case 'prompts/list':
      return reply({ prompts: [] });
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${method}`);
  }
}

/** body: parsed JSON (object or array). Returns { status, json } - json null means 202 Accepted. */
export async function handleMcp(body, ctx) {
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleOne(m, ctx)))).filter(Boolean);
    return out.length ? { status: 200, json: out } : { status: 202, json: null };
  }
  const res = await handleOne(body, ctx);
  return res ? { status: 200, json: res } : { status: 202, json: null };
}
