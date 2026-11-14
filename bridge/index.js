const http = require("http");
const { URL } = require("url");
const { handleMcp } = require("./mcp");
const queue = require("./queue");

const PORT = process.env.PORT || 3000;
const SECRET = process.env.BRIDGE_SECRET || "";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bridge-Secret");
}

function json(res, status, obj) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function getSecret(req, url) {
  return (
    url.searchParams.get("secret") ||
    req.headers["x-bridge-secret"] ||
    (req.headers.authorization || "").replace(/^Bearer\s+/i, "") ||
    ""
  );
}

function auth(req, url, res) {
  if (!SECRET) {
    json(res, 503, { ok: false, error: "BRIDGE_SECRET is not configured" });
    return false;
  }
  if (getSecret(req, url) !== SECRET) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  try {
    if (path === "/" && req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service: "svakom-ble-ai-cloud",
        secretConfigured: !!SECRET,
        mcp: "/mcp?secret=...",
        relayPoll: "/toy-next?secret=...",
        relayStatus: "/relay/status?secret=...",
        queue: queue.size(),
        status: queue.getStatus()
      });
    }

    if (path === "/mcp") {
      if (req.method !== "POST") {
        return json(res, 405, { ok: false, error: "Use POST for MCP" });
      }
      if (!auth(req, url, res)) return;
      const body = await readBody(req);
      return handleMcp(req, res, body);
    }

    const pollPaths = new Set([
      "/relay/poll",
      "/poll",
      "/next",
      "/toy-next",
      "/command",
      "/api/poll",
      "/api/relay/poll"
    ]);

    if (pollPaths.has(path) && (req.method === "GET" || req.method === "POST")) {
      if (!auth(req, url, res)) return;
      queue.markSeen();
      const cmd = queue.shift();
      if (cmd) {
        return json(res, 200, Object.assign({ ok: true, command: cmd, cmd }, cmd));
      }
      return json(res, 200, { ok: true, command: null, cmd: null });
    }

    const statusPaths = new Set([
      "/relay/status",
      "/status",
      "/api/status",
      "/toy-status",
      "/api/relay/status"
    ]);

    if (statusPaths.has(path)) {
      if (!auth(req, url, res)) return;

      if (req.method === "GET") {
        return json(res, 200, { ok: true, status: queue.getStatus() });
      }

      if (req.method === "POST") {
        const body = await readBody(req);
        let data = {};
        try {
          data = body ? JSON.parse(body) : {};
        } catch (e) {
          data = { raw: body };
        }
        queue.setStatus(data);
        return json(res, 200, { ok: true, status: queue.getStatus() });
      }

      return json(res, 405, { ok: false, error: "method not allowed" });
    }

    if (path === "/relay/clear" && req.method === "POST") {
      if (!auth(req, url, res)) return;
      queue.clear();
      return json(res, 200, { ok: true, queue: 0 });
    }

    return json(res, 404, { ok: false, error: "not found", path });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || String(e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`svakom-ble-ai-cloud listening on ${PORT}`);
});
