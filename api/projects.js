const { authorize } = require("./_auth");
const { ensureSeeded, readProjects, writeProjects } = require("./_store");

module.exports = async (req, res) => {
  await ensureSeeded();

  if (req.method === "GET") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const projects = await readProjects();
    res.status(200).json({ projects });
    return;
  }

  if (req.method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const name = String(req.body?.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Project name is required" });
      return;
    }

    const projects = await readProjects();
    if (!projects.includes(name)) {
      projects.push(name);
      await writeProjects(projects);
    }

    res.status(201).json({ projects: await readProjects() });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
