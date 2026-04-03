const API_BASE = "/api";
const USER_TOKEN_KEY = "vcm_user_token";
const ADMIN_TOKEN_KEY = "vcm_admin_token";

const entranceView = document.getElementById("entrance-view");
const userView = document.getElementById("user-view");
const adminView = document.getElementById("admin-view");

const userAccessBtn = document.getElementById("user-access-btn");
const adminAccessBtn = document.getElementById("admin-access-btn");
const navButtons = document.querySelectorAll("[data-nav]");

const projectForm = document.getElementById("project-form");
const formMessage = document.getElementById("form-message");

const projectNameSelect = document.getElementById("projectNameSelect");
const showAddBtn = document.getElementById("show-add-project-btn");
const addProjectRow = document.getElementById("add-project-row");
const newProjectInput = document.getElementById("newProjectInput");
const confirmAddBtn = document.getElementById("confirm-add-btn");
const cancelAddBtn = document.getElementById("cancel-add-btn");

const tableBody = document.getElementById("project-table-body");
const adminEmpty = document.getElementById("admin-empty");
const adminProjectSelect = document.getElementById("adminProjectSelect");
const refreshBtn = document.getElementById("refresh-btn");

function showView(id) {
  [entranceView, userView, adminView].forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function tokenKeyForRole(role) {
  return role === "admin" ? ADMIN_TOKEN_KEY : USER_TOKEN_KEY;
}

async function requestAccess(accessType) {
  const label = accessType === "admin" ? "Admin" : "User";
  const entered = window.prompt(`${label} Access Password:`);

  // User pressed cancel
  if (entered === null) {
    return false;
  }

  try {
    const data = await apiRequest("/auth", {
      method: "POST",
      body: JSON.stringify({ role: accessType, password: entered })
    });

    sessionStorage.setItem(tokenKeyForRole(accessType), data.token);
  } catch (err) {
    window.alert(err.message || "Incorrect password.");
    return false;
  }

  return true;
}

async function apiRequest(path, options = {}) {
  const { authRole, headers: customHeaders = {}, ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...customHeaders
  };

  if (authRole) {
    const token = sessionStorage.getItem(tokenKeyForRole(authRole));
    if (token) {
      headers["X-Auth-Token"] = token;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...fetchOptions
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && authRole) {
      sessionStorage.removeItem(tokenKeyForRole(authRole));
    }
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function refreshProjectDropdown() {
  const { projects } = await apiRequest("/projects", { authRole: "user" });
  projectNameSelect.innerHTML = '<option value="" selected disabled>Select project</option>';

  (projects || []).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    projectNameSelect.appendChild(opt);
  });

  projectNameSelect.value = "";
}

async function refreshAdminProjectDropdown() {
  const { projects } = await apiRequest("/projects", { authRole: "admin" });
  adminProjectSelect.innerHTML = '<option value="" selected disabled>Select project</option>';

  (projects || []).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    adminProjectSelect.appendChild(opt);
  });

  adminProjectSelect.value = "";
}

function showAddRow() {
  addProjectRow.classList.remove("hidden");
  newProjectInput.value = "";
  newProjectInput.focus();
  showAddBtn.style.display = "none";
}

function hideAddRow() {
  addProjectRow.classList.add("hidden");
  newProjectInput.value = "";
  showAddBtn.style.display = "";
}

async function doAddProject() {
  const name = newProjectInput.value.trim();
  if (!name) {
    newProjectInput.focus();
    return;
  }

  try {
    await apiRequest("/projects", {
      method: "POST",
      authRole: "user",
      body: JSON.stringify({ name })
    });

    await refreshProjectDropdown();
    projectNameSelect.value = name;
    hideAddRow();
    formMessage.textContent = "";
  } catch (err) {
    formMessage.textContent = `Unable to add project: ${err.message}`;
  }
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function renderTable(selectedProjectName = "") {
  tableBody.innerHTML = "";

  try {
    const { updates } = await apiRequest("/updates", { authRole: "admin" });
    if (!selectedProjectName) {
      adminEmpty.style.display = "block";
      adminEmpty.textContent = "Select a project to view status updates.";
      return;
    }

    const filtered = (updates || []).filter(
      (item) => item.projectName === selectedProjectName
    );

    if (!filtered.length) {
      adminEmpty.style.display = "block";
      adminEmpty.textContent = "No updates found for selected project.";
      return;
    }

    adminEmpty.style.display = "none";
    filtered
      .slice()
      .sort((a, b) => new Date(b.updateDate) - new Date(a.updateDate))
      .forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(item.userName)}</td>
          <td>${escapeHtml(item.updateDate)}</td>
          <td>${escapeHtml(item.projectName)}</td>
          <td>${escapeHtml(item.projectStatus)}</td>
          <td>${escapeHtml(item.projectLeader || "-")}</td>
          <td>${escapeHtml(item.teamDetails || "-")}</td>
          <td>${escapeHtml(item.projectDescription)}</td>`;
        tableBody.appendChild(tr);
      });
  } catch (err) {
    adminEmpty.style.display = "block";
    adminEmpty.textContent = "Unable to load admin data.";
    formMessage.textContent = `Unable to load admin data: ${err.message}`;
  }
}

userAccessBtn.addEventListener("click", async () => {
  if (!(await requestAccess("user"))) {
    return;
  }

  formMessage.textContent = "";
  hideAddRow();
  try {
    await refreshProjectDropdown();
  } catch (err) {
    formMessage.textContent = `Unable to load projects: ${err.message}`;
  }
  showView("user-view");
});

adminAccessBtn.addEventListener("click", async () => {
  if (!(await requestAccess("admin"))) {
    return;
  }

  formMessage.textContent = "";
  try {
    await refreshAdminProjectDropdown();
  } catch (err) {
    formMessage.textContent = `Unable to load projects: ${err.message}`;
  }
  await renderTable("");
  showView("admin-view");
});

navButtons.forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.nav)));

showAddBtn.addEventListener("click", showAddRow);
cancelAddBtn.addEventListener("click", hideAddRow);
confirmAddBtn.addEventListener("click", doAddProject);
newProjectInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    doAddProject();
  }
});

adminProjectSelect.addEventListener("change", () => {
  renderTable(adminProjectSelect.value);
});

refreshBtn.addEventListener("click", () => {
  renderTable(adminProjectSelect.value);
});

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fd = new FormData(projectForm);
  const entry = {
    userName: String(fd.get("userName") || "").trim(),
    updateDate: String(fd.get("updateDate") || "").trim(),
    projectName: String(fd.get("projectName") || "").trim(),
    projectStatus: String(fd.get("projectStatus") || "").trim(),
    projectLeader: String(fd.get("projectLeader") || "").trim(),
    teamDetails: String(fd.get("teamDetails") || "").trim(),
    projectDescription: String(fd.get("projectDescription") || "").trim()
  };

  if (Object.values(entry).some((v) => !v)) {
    formMessage.textContent = "Please fill all fields before saving.";
    return;
  }

  try {
    await apiRequest("/updates", {
      method: "POST",
      authRole: "user",
      body: JSON.stringify(entry)
    });

    formMessage.textContent = "Project update saved successfully!";
    projectForm.reset();
    hideAddRow();
    await refreshProjectDropdown();
  } catch (err) {
    formMessage.textContent = `Unable to save update: ${err.message}`;
  }
});
