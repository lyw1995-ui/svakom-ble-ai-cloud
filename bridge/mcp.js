// bridge/mcp.js
import { TaskQueue } from './queue.js';

export class McpClient {
  constructor(options = {}) {
    this.endpoint = options.endpoint || '';
    this.headers = options.headers || { 'Content-Type': 'application/json' };
    this.queue = new TaskQueue();
  }

  async callTool(toolName, params = {}) {
    return this.queue.enqueue(async () => {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({ tool: toolName, arguments: params })
      });
      return response.json();
    });
  }
}
