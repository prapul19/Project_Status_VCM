const { issueToken, validatePassword, TOKEN_TTL_MS } = require("./_auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const role = String(req.body?.role || "").trim();
  const password = String(req.body?.password || "");

  if (role !== "user" && role !== "admin") {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  if (!validatePassword(role, password)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  const token = issueToken(role);
  res.status(200).json({ token, role, expiresInMs: TOKEN_TTL_MS });
};
