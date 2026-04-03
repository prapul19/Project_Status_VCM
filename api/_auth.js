const crypto = require("crypto");

const USER_ACCESS_PASSWORD = "VCM@$2026";
const ADMIN_ACCESS_PASSWORD = "Admin@$VCM";
const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-in-vercel-auth-secret";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(data) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(data).digest("base64url");
}

function issueToken(role) {
  const payload = {
    role,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const body = b64url(JSON.stringify(payload));
  const sig = sign(body);
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "Missing or invalid token" };
  }

  const [body, sig] = token.split(".");
  const expected = sign(body);
  if (sig !== expected) {
    return { ok: false, error: "Invalid token" };
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64").toString("utf8"));
    if (!payload.exp || payload.exp <= Date.now()) {
      return { ok: false, error: "Token expired" };
    }
    return { ok: true, role: payload.role };
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }
}

function roleRank(role) {
  if (role === "admin") return 2;
  if (role === "user") return 1;
  return 0;
}

function authorize(req, requiredRole) {
  const token = req.headers["x-auth-token"];
  const verified = verifyToken(token);
  if (!verified.ok) {
    return { ok: false, status: 401, error: verified.error };
  }

  if (roleRank(verified.role) < roleRank(requiredRole)) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }

  return { ok: true, role: verified.role };
}

function validatePassword(role, password) {
  if (role === "admin") {
    return password === ADMIN_ACCESS_PASSWORD;
  }
  if (role === "user") {
    return password === USER_ACCESS_PASSWORD;
  }
  return false;
}

module.exports = {
  issueToken,
  authorize,
  validatePassword,
  TOKEN_TTL_MS
};
