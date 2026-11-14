const q = [];
let lastSeen = 0;
let lastState = null;

function push(cmd) {
  if (!cmd || typeof cmd !== "object") return;
  if (cmd.type === "stop") q.length = 0;
  cmd.ts = cmd.ts || Date.now();
  q.push(cmd);
  if (q.length > 100) q.splice(0, q.length - 100);
}

function shift() {
  return q.shift() || null;
}

function size() {
  return q.length;
}

function clear() {
  q.length = 0;
}

function markSeen() {
  lastSeen = Date.now();
}

function setStatus(s) {
  lastSeen = Date.now();
  lastState = s && typeof s === "object" ? s : { value: s };
}

function getStatus() {
  const now = Date.now();
  return {
    online: lastSeen > 0 && now - lastSeen < 15000,
    lastSeen: lastSeen || null,
    lastSeenAgoMs: lastSeen ? now - lastSeen : null,
    lastState,
    queue: q.length
  };
}

module.exports = { push, shift, size, clear, markSeen, setStatus, getStatus };
