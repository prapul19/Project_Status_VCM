const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = 3001;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const DEFAULT_PROJECTS = ["DDC", "AL Islami", "AL Khayam"];
const USER_ACCESS_PASSWORD = "VCM@$2026";
const ADMIN_ACCESS_PASSWORD = "Admin@$VCM";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const authSessions = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { projects: DEFAULT_PROJECTS.slice(), updates: [], projectDetails: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
    return;
  }

  const store = readStore();
  writeStore(store);
}

function normalizeStore(raw) {
  const rawProjects = Array.isArray(raw?.projects) ? raw.projects : [];
  const rawUpdates = Array.isArray(raw?.updates) ? raw.updates : [];
  const rawProjectDetails = Array.isArray(raw?.projectDetails) ? raw.projectDetails : [];

  const cleanProjects = [
    ...new Set(
      [...DEFAULT_PROJECTS, ...rawProjects]
        .filter((name) => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean)
    )
  ];

  const cleanUpdates = rawUpdates
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      userName: String(item.userName || "").trim(),
      updateDate: String(item.updateDate || "").trim(),
      projectName: String(item.projectName || "").trim(),
      projectStatus: String(item.projectStatus || "").trim(),
      projectDescription: String(item.projectDescription || "").trim(),
      createdAt: item.createdAt || new Date().toISOString()
    }))
    .filter(
      (item) =>
        item.userName &&
        item.updateDate &&
        item.projectName &&
        item.projectStatus &&
        item.projectDescription
    );

  const cleanProjectDetails = rawProjectDetails
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      projectName: String(item.projectName || "").trim(),
      projectOwner: String(item.projectOwner || "").trim(),
      teamDetails: String(item.teamDetails || "").trim(),
      updatedAt: item.updatedAt || new Date().toISOString()
    }))
    .filter((item) => item.projectName && item.projectOwner && item.teamDetails);

  return { projects: cleanProjects, updates: cleanUpdates, projectDetails: cleanProjectDetails };
}

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { projects: DEFAULT_PROJECTS.slice(), updates: [], projectDetails: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(normalizeStore(store), null, 2), "utf8");
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function issueToken(role) {
  const token = crypto.randomBytes(24).toString("hex");
  authSessions.set(token, {
    role,
    expiresAt: Date.now() + TOKEN_TTL_MS
  });
  return token;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of authSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      authSessions.delete(token);
    }
  }
}

function roleRank(role) {
  if (role === "admin") return 2;
  if (role === "user") return 1;
  return 0;
}

function authorize(req, requiredRole) {
  cleanupSessions();

  const token = req.headers["x-auth-token"];
  if (!token || typeof token !== "string") {
    return { ok: false, status: 401, error: "Missing auth token" };
  }

  const session = authSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }

  if (roleRank(session.role) < roleRank(requiredRole)) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }

  return { ok: true, role: session.role };
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const absolute = path.join(ROOT, safePath);

  if (!absolute.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolute, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(absolute).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

async function handleApi(req, res, pathname) {
  const method = req.method || "GET";
  const requestUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (pathname === "/api/auth" && method === "POST") {
    const body = await collectBody(req);
    const role = String(body.role || "").trim();
    const password = String(body.password || "");

    if (role !== "user" && role !== "admin") {
      return sendJson(res, 400, { error: "Invalid role" });
    }

    const expectedPassword = role === "admin" ? ADMIN_ACCESS_PASSWORD : USER_ACCESS_PASSWORD;
    if (password !== expectedPassword) {
      return sendJson(res, 401, { error: "Incorrect password" });
    }

    const token = issueToken(role);
    return sendJson(res, 200, { token, role, expiresInMs: TOKEN_TTL_MS });
  }

  if (pathname === "/api/projects" && method === "GET") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const store = readStore();
    return sendJson(res, 200, { projects: store.projects });
  }

  if (pathname === "/api/projects" && method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const body = await collectBody(req);
    const name = String(body.name || "").trim();
    if (!name) {
      return sendJson(res, 400, { error: "Project name is required" });
    }

    const store = readStore();
    if (!store.projects.includes(name)) {
      store.projects.push(name);
      writeStore(store);
    }
    return sendJson(res, 201, { projects: store.projects });
  }

  if (pathname === "/api/updates" && method === "GET") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const store = readStore();
    return sendJson(res, 200, { updates: store.updates });
  }

  if (pathname === "/api/updates" && method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const body = await collectBody(req);
    const entry = {
      userName: String(body.userName || "").trim(),
      updateDate: String(body.updateDate || "").trim(),
      projectName: String(body.projectName || "").trim(),
      projectStatus: String(body.projectStatus || "").trim(),
      projectDescription: String(body.projectDescription || "").trim(),
      createdAt: new Date().toISOString()
    };

    if (
      !entry.userName ||
      !entry.updateDate ||
      !entry.projectName ||
      !entry.projectStatus ||
      !entry.projectDescription
    ) {
      return sendJson(res, 400, { error: "All fields are required" });
    }

    const store = readStore();
    store.updates.push(entry);

    if (!store.projects.includes(entry.projectName)) {
      store.projects.push(entry.projectName);
    }

    writeStore(store);
    return sendJson(res, 201, { ok: true });
  }

  if (pathname === "/api/project-details" && method === "GET") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const projectName = String(requestUrl.searchParams.get("projectName") || "").trim();
    const store = readStore();

    if (!projectName) {
      return sendJson(res, 200, { details: store.projectDetails || [] });
    }

    const detail = (store.projectDetails || []).find((item) => item.projectName === projectName) || {};
    return sendJson(res, 200, detail);
  }

  if (pathname === "/api/project-details" && method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const body = await collectBody(req);
    const entry = {
      projectName: String(body.projectName || "").trim(),
      projectOwner: String(body.projectOwner || "").trim(),
      teamDetails: String(body.teamDetails || "").trim(),
      updatedAt: new Date().toISOString()
    };

    if (!entry.projectName || !entry.projectOwner || !entry.teamDetails) {
      return sendJson(res, 400, { error: "All fields are required" });
    }

    const store = readStore();
    const details = Array.isArray(store.projectDetails) ? store.projectDetails : [];
    const idx = details.findIndex((item) => item.projectName === entry.projectName);
    if (idx >= 0) {
      details[idx] = entry;
    } else {
      details.push(entry);
    }
    store.projectDetails = details;

    if (!store.projects.includes(entry.projectName)) {
      store.projects.push(entry.projectName);
    }

    writeStore(store);
    return sendJson(res, 201, { ok: true, detail: entry });
  }

  if (pathname === "/api/updates" && method === "DELETE") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      return sendJson(res, auth.status, { error: auth.error });
    }

    const store = readStore();
    store.updates = [];
    writeStore(store);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: "API route not found" });
}

ensureStore();

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    if (pathname.startsWith("/api/")) {
      await handleApi(req, res, pathname);
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    sendJson(res, 500, { error: err.message || "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
