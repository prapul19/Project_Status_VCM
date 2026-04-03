const { authorize } = require("./_auth");
const {
  ensureSeeded,
  readProjectDetails,
  writeProjectDetails,
  readProjects,
  writeProjects
} = require("./_store");

module.exports = async (req, res) => {
  await ensureSeeded();

  if (req.method === "GET") {
    const auth = authorize(req, "admin");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const projectName = String(req.query?.projectName || "").trim();
    const details = await readProjectDetails();

    if (!projectName) {
      res.status(200).json({ details });
      return;
    }

    const one = details.find((d) => d.projectName === projectName) || null;
    res.status(200).json(one || {});
    return;
  }

  if (req.method === "POST") {
    const auth = authorize(req, "user");
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const entry = {
      projectName: String(req.body?.projectName || "").trim(),
      projectOwner: String(req.body?.projectOwner || "").trim(),
      teamDetails: String(req.body?.teamDetails || "").trim(),
      updatedAt: new Date().toISOString()
    };

    if (!entry.projectName || !entry.projectOwner || !entry.teamDetails) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const details = await readProjectDetails();
    const idx = details.findIndex((d) => d.projectName === entry.projectName);
    if (idx >= 0) {
      details[idx] = entry;
    } else {
      details.push(entry);
    }
    await writeProjectDetails(details);

    const projects = await readProjects();
    if (!projects.includes(entry.projectName)) {
      projects.push(entry.projectName);
      await writeProjects(projects);
    }

    res.status(201).json({ ok: true, detail: entry });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
