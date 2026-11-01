import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SimSession } from '../sim/session.js';
import { createMcpServer } from './createServer.js';

// A standalone spider for local MCP clients (Claude Desktop and friends).
// It has its own world; it is not the session the browser is watching.
const session = new SimSession();
session.start();

await createMcpServer(session).connect(new StdioServerTransport());
