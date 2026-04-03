const { authorize } = require("./_auth");
const { ensureSeeded, readUpdates, writeUpdates, readProjects, writeProjects } = require("./_store");

module.exports = async (req, res) => {
  await ensureSeeded();

  if (req.method === "GET") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const updates = await readUpdates();
    res.status(200).json({ updates });
    return;
  }

  if (req.method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const entry = {
      userName: String(req.body?.userName || "").trim(),
      updateDate: String(req.body?.updateDate || "").trim(),
      projectName: String(req.body?.projectName || "").trim(),
      projectStatus: String(req.body?.projectStatus || "").trim(),
      projectLeader: String(req.body?.projectLeader || "").trim(),
      teamDetails: String(req.body?.teamDetails || "").trim(),
      projectDescription: String(req.body?.projectDescription || "").trim(),
      createdAt: new Date().toISOString()
    };

    if (!entry.userName || !entry.updateDate || !entry.projectName || !entry.projectStatus || !entry.projectLeader || !entry.teamDetails || !entry.projectDescription) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const updates = await readUpdates();
    updates.push(entry);
    await writeUpdates(updates);

    const projects = await readProjects();
    if (!projects.includes(entry.projectName)) {
      projects.push(entry.projectName);
      await writeProjects(projects);
    }

    res.status(201).json({ ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await writeUpdates([]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
