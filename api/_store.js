const { kv } = require("@vercel/kv");

const PROJECTS_KEY = "vcm:projects";
const UPDATES_KEY = "vcm:updates";
const DEFAULT_PROJECTS = ["DDC", "AL Islami", "AL Khayam"];

function uniqueStrings(values) {
  return [...new Set((values || []).filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
}

function normalizeUpdates(values) {
  return (values || [])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      userName: String(item.userName || "").trim(),
      updateDate: String(item.updateDate || "").trim(),
      projectName: String(item.projectName || "").trim(),
      projectStatus: String(item.projectStatus || "").trim(),
      projectDescription: String(item.projectDescription || "").trim(),
      createdAt: item.createdAt || new Date().toISOString()
    }))
    .filter((item) => item.userName && item.updateDate && item.projectName && item.projectStatus && item.projectDescription);
}

async function readProjects() {
  const stored = await kv.get(PROJECTS_KEY);
  const merged = uniqueStrings([...(Array.isArray(stored) ? stored : []), ...DEFAULT_PROJECTS]);
  return merged;
}

async function writeProjects(projects) {
  await kv.set(PROJECTS_KEY, uniqueStrings(projects));
}

async function readUpdates() {
  const stored = await kv.get(UPDATES_KEY);
  return normalizeUpdates(Array.isArray(stored) ? stored : []);
}

async function writeUpdates(updates) {
  await kv.set(UPDATES_KEY, normalizeUpdates(updates));
}

async function ensureSeeded() {
  const projects = await readProjects();
  await writeProjects(projects);

  const updates = await readUpdates();
  await writeUpdates(updates);
}

module.exports = {
  readProjects,
  writeProjects,
  readUpdates,
  writeUpdates,
  ensureSeeded,
  DEFAULT_PROJECTS
};
