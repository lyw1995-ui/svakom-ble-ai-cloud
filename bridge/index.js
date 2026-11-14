// bridge/index.js
import { McpClient } from './mcp.js';

export default function createClient(config) {
  return new McpClient(config);
}
