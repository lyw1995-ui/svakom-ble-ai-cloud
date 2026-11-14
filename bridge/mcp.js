const queue = require("./queue");

const SERVER_INFO = {
  name: "svakom-ble-ai-cloud",
  version: "1.0.0"
};

const TOOLS = [
  {
    name: "toy_status",
    description: "查询蓝牙中继是否在线、最后上报状态和队列长度。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "toy_set_speed",
    description: "设置玩具速度百分比（0-100）。",
    inputSchema: {
      type: "object",
      properties: {
        speed: {
          type: "number",
          minimum: 0,
          maximum: 100,
          description: "速度百分比，0-100"
        }
      },
      required: ["speed"],
      additionalProperties: true
    }
  },
  {
    name: "toy_set_pattern",
    description: "切换玩具振动模式/图案。",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          description: "模式编号或名称"
        }
      },
      required: ["pattern"],
      additionalProperties: true
    }
  },
  {
    name: "toy_stop",
    description: "立即停止玩具（清空未执行指令并排队停止）。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
}

function rpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message }
  };
}

function textResult(id, text, isError) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: String(text) }],
      isError: !!isError
    }
  };
}

function hasId(m) {
  return Object.prototype.hasOwnProperty.call(m, "id");
}

function executeTool(name, args) {
  args = args && typeof args === "object" ? args : {};

  if (name === "toy_status") {
    return {
      isError: false,
      text: JSON.stringify(queue.getStatus(), null, 2)
    };
  }

  if (name === "toy_set_speed") {
    const raw = args.speed ?? args.value ?? args.percent ?? args.level;
    let n = Number(raw);

    if (!Number.isFinite(n)) {
      return { isError: true, text: "缺少有效 speed（0-100）" };
    }

    n = Math.max(0, Math.min(100, Math.round(n)));
    queue.push({ type: "speed", value: n });

    return {
      isError: false,
      text: `已排队：速度 ${n}%。当前队列 ${queue.size()} 条。`
    };
  }

  if (name === "toy_set_pattern") {
    const raw = args.pattern ?? args.value ?? args.mode;

    if (raw === undefined || raw === null || raw === "") {
      return { isError: true, text: "缺少 pattern（模式编号或名称）" };
    }

    queue.push({ type: "pattern", value: String(raw) });

    return {
      isError: false,
      text: `已排队：模式 ${String(raw)}。当前队列 ${queue.size()} 条。`
    };
  }

  if (name === "toy_stop") {
    queue.push({ type: "stop" });
    return {
      isError: false,
      text: `已排队：停止。当前队列 ${queue.size()} 条。`
    };
  }

  return { isError: true, text: `未知工具：${name}` };
}

function handleOne(msg) {
  if (!msg || typeof msg !== "object") {
    return rpcError(null, -32600, "Invalid Request");
  }

  const id = hasId(msg) ? msg.id : undefined;
  const method = msg.method;

  if (!method) {
    return id === undefined ? null : rpcError(id, -32600, "Invalid Request");
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion:
          (msg.params && msg.params.protocolVersion) || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const params = msg.params || {};
    const name = params.name;
    const out = executeTool(name, params.arguments || {});
    return textResult(id, out.text, out.isError);
  }

  return id === undefined
    ? null
    : rpcError(id, -32601, `Method not found: ${method}`);
}

async function handleMcp(req, res, body) {
  let msg;

  try {
    msg = JSON.parse(body || "{}");
  } catch (e) {
    return send(res, 400, rpcError(null, -32700, "Parse error"));
  }

  if (Array.isArray(msg)) {
    const out = msg.map(handleOne).filter(Boolean);
    if (out.length === 0) {
      return send(res, 202);
    }
    return send(res, 200, out);
  }

  const out = handleOne(msg);
  if (out === null) {
    return send(res, 202);
  }
  return send(res, 200, out);
}

module.exports = { handleMcp };
