const SUPABASE_URL = "https://gwcuryhghwkyvuhqyzlm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_05YV4twxFp233ltEe1ydtw_kNhDjrEU";

const configured =
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_ANON_KEY.includes("YOUR_");

let db = null;
let allProjects = [];
let allResearchers = [];

const pageTitles = {
  dashboardView: ["דשבורד", "תמונת מצב עדכנית של הצוות והפרויקטים"],
  projectsView: ["פרויקטים", "ניהול משימות לפי פרויקט"],
  researchersView: ["עובדים", "כל המשימות של כל עובד/ת בכל הפרויקטים"],
  calendarView: ["לוח זמנים", "דד־ליינים, משימות באיחור ומשימות ללא תאריך"],
  teamView: ["ניהול צוות", "הוספה וניהול של חברי צוות"],
};

const setupNotice = document.getElementById("setupNotice");
const projectsContainer = document.getElementById("projectsContainer");
const researchersContainer = document.getElementById("researchersContainer");
const teamList = document.getElementById("teamList");
const calendarTasks = document.getElementById("calendarTasks");
const projectForm = document.getElementById("projectForm");
const researcherForm = document.getElementById("researcherForm");
const projectNameInput = document.getElementById("projectName");
const researcherNameInput = document.getElementById("researcherName");
const projectMessage = document.getElementById("projectMessage");
const refreshBtn = document.getElementById("refreshBtn");
const quickTaskBtn = document.getElementById("quickTaskBtn");
const taskDialog = document.getElementById("taskDialog");
const quickTaskForm = document.getElementById("quickTaskForm");

if (configured) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setupNotice.classList.add("hidden");
  loadAll();
} else {
  projectsContainer.innerHTML =
    '<div class="empty">המערכת עדיין לא מחוברת למסד הנתונים.</div>';
}

document.querySelectorAll(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.querySelectorAll("[data-go-tab]").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.goTab));
});

function switchTab(tabId) {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-view").forEach((view) => {
    view.classList.toggle("active", view.id === tabId);
  });
  const [title, subtitle] = pageTitles[tabId];
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageSubtitle").textContent = subtitle;
}

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureConfigured()) return;
  const name = projectNameInput.value.trim();
  if (!name) return;

  projectMessage.textContent = "שומרת...";
  const { error } = await db.from("projects").insert({ name });
  if (error) {
    projectMessage.textContent = `שגיאה: ${error.message}`;
    return;
  }

  projectNameInput.value = "";
  projectMessage.textContent = "הפרויקט נוסף.";
  await loadAll();
});

researcherForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureConfigured()) return;
  const name = researcherNameInput.value.trim();
  if (!name) return;

  const { error } = await db.from("researchers").insert({ name });
  if (error) return alert(error.message);

  researcherNameInput.value = "";
  await loadAll();
});

refreshBtn.addEventListener("click", loadAll);
quickTaskBtn.addEventListener("click", () => openTaskDialog());

document.getElementById("closeDialogBtn").addEventListener("click", () => taskDialog.close());
document.getElementById("cancelDialogBtn").addEventListener("click", () => taskDialog.close());

quickTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    project_id: Number(document.getElementById("dialogProject").value),
    title: document.getElementById("dialogTitle").value.trim(),
    owner: document.getElementById("dialogOwner").value,
    deadline: document.getElementById("dialogDeadline").value || null,
    status: document.getElementById("dialogStatus").value,
    priority: document.getElementById("dialogPriority").value,
    tag: document.getElementById("dialogTag").value.trim(),
    notes: document.getElementById("dialogNotes").value.trim(),
  };

  const { error } = await db.from("tasks").insert(payload);
  if (error) return alert(error.message);

  quickTaskForm.reset();
  taskDialog.close();
  await loadAll();
});

[
  "projectSearch",
  "projectStatusFilter",
  "projectPriorityFilter",
  "hideCompleted",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderProjects);
  document.getElementById(id).addEventListener("change", renderProjects);
});

[
  "researcherSearch",
  "researcherStatusFilter",
  "researcherPriorityFilter",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderResearchers);
  document.getElementById(id).addEventListener("change", renderResearchers);
});

document.getElementById("calendarFilter").addEventListener("change", renderCalendar);
document.getElementById("calendarSort").addEventListener("change", renderCalendar);

function ensureConfigured() {
  if (!configured) {
    alert("יש להשלים תחילה את חיבור Supabase בקובץ app.js.");
    return false;
  }
  return true;
}

async function loadAll() {
  if (!configured) return;

  const [
    { data: researchers, error: researchersError },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    db.from("researchers").select("id, name, created_at").order("name"),
    db
      .from("projects")
      .select("id, name, created_at, tasks(id, title, owner, deadline, status, notes, priority, tag, completed_at, created_at)")
      .order("created_at", { ascending: true }),
  ]);

  if (researchersError || projectsError) {
    alert(researchersError?.message || projectsError?.message);
    return;
  }

  allResearchers = researchers || [];
  allProjects = projects || [];

  populateDialogSelects();
  renderDashboard();
  renderProjects();
  renderResearchers();
  renderCalendar();
  renderTeam();
}

function renderDashboard() {
  const tasks = flattenTasks();
  const today = startOfToday();

  document.getElementById("totalTasks").textContent = tasks.length;
  document.getElementById("overdueTasks").textContent =
    tasks.filter((task) => isOverdue(task, today)).length;
  document.getElementById("progressTasks").textContent =
    tasks.filter((task) => task.status === "in_progress").length;
  document.getElementById("doneTasks").textContent =
    tasks.filter((task) => task.status === "done").length;

  renderUpcomingDeadlines(tasks);
  renderWorkload(tasks);
  renderProjectProgress();
}

function renderUpcomingDeadlines(tasks) {
  const container = document.getElementById("upcomingDeadlines");
  const today = startOfToday();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const upcoming = tasks
    .filter((task) => task.status !== "done" && task.deadline)
    .filter((task) => {
      const due = parseDate(task.deadline);
      return due >= today && due <= weekEnd;
    })
    .sort(sortTasks)
    .slice(0, 8);

  container.innerHTML = "";
  if (!upcoming.length) {
    container.innerHTML = '<div class="empty">אין דד־ליינים בשבעת הימים הקרובים.</div>';
    return;
  }

  upcoming.forEach((task) => {
    const item = document.createElement("div");
    item.className = "stack-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(task.title)}</strong>
        <small>${escapeHtml(task.projectName)} · ${escapeHtml(task.owner)}</small>
      </div>
      <strong>${formatDate(task.deadline)}</strong>
    `;
    container.appendChild(item);
  });
}

function renderWorkload(tasks) {
  const container = document.getElementById("workloadList");
  const rows = allResearchers.map((researcher) => {
    const openCount = tasks.filter(
      (task) => task.owner === researcher.name && task.status !== "done"
    ).length;
    return { name: researcher.name, count: openCount };
  });

  const max = Math.max(...rows.map((row) => row.count), 1);
  container.innerHTML = "";

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "workload-row";
    item.innerHTML = `
      <span>${escapeHtml(row.name)}</span>
      <div class="progress-track">
        <div class="progress-fill" style="width:${(row.count / max) * 100}%"></div>
      </div>
      <strong>${row.count}</strong>
    `;
    container.appendChild(item);
  });
}

function renderProjectProgress() {
  const container = document.getElementById("projectProgressList");
  container.innerHTML = "";

  if (!allProjects.length) {
    container.innerHTML = '<div class="empty">עדיין אין פרויקטים.</div>';
    return;
  }

  allProjects.forEach((project) => {
    const total = project.tasks?.length || 0;
    const done = project.tasks?.filter((task) => task.status === "done").length || 0;
    const percent = total ? Math.round((done / total) * 100) : 0;

    const row = document.createElement("div");
    row.className = "project-progress-row";
    row.innerHTML = `
      <span>${escapeHtml(project.name)}</span>
      <div class="progress-track">
        <div class="progress-fill" style="width:${percent}%"></div>
      </div>
      <strong>${percent}%</strong>
    `;
    container.appendChild(row);
  });
}

function renderProjects() {
  projectsContainer.innerHTML = "";

  const search = document.getElementById("projectSearch").value.trim().toLowerCase();
  const statusFilter = document.getElementById("projectStatusFilter").value;
  const priorityFilter = document.getElementById("projectPriorityFilter").value;
  const hideCompleted = document.getElementById("hideCompleted").checked;

  const filteredProjects = allProjects
    .map((project) => {
      const tasks = (project.tasks || [])
        .filter((task) => {
          const haystack = [
            project.name,
            task.title,
            task.owner,
            task.notes || "",
            task.tag || "",
          ].join(" ").toLowerCase();

          return (
            (!search || haystack.includes(search)) &&
            (!statusFilter || task.status === statusFilter) &&
            (!priorityFilter || task.priority === priorityFilter) &&
            (!hideCompleted || task.status !== "done")
          );
        })
        .sort(sortTasks);

      return { ...project, tasks };
    })
    .filter((project) => {
      if (!search && !statusFilter && !priorityFilter && !hideCompleted) return true;
      return project.tasks.length > 0 || project.name.toLowerCase().includes(search);
    });

  if (!filteredProjects.length) {
    projectsContainer.innerHTML = '<div class="empty">לא נמצאו פרויקטים או משימות.</div>';
    return;
  }

  filteredProjects.forEach(renderProject);
}

function renderProject(project) {
  const node = document.getElementById("projectTemplate").content.cloneNode(true);
  const tasks = project.tasks || [];
  const done = tasks.filter((task) => task.status === "done").length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  node.querySelector(".project-title").textContent = project.name;
  node.querySelector(".project-count").textContent = `${tasks.length} משימות`;
  node.querySelector(".mini-progress-fill").style.width = `${percent}%`;

  node.querySelector(".add-task-to-project").addEventListener("click", () => {
    openTaskDialog(project.id);
  });

  node.querySelector(".delete-project").addEventListener("click", async () => {
    if (!confirm(`למחוק את הפרויקט "${project.name}" ואת כל המשימות שלו?`)) return;
    const { error } = await db.from("projects").delete().eq("id", project.id);
    if (error) return alert(error.message);
    await loadAll();
  });

  const taskCards = node.querySelector(".task-cards");
  if (!tasks.length) {
    taskCards.innerHTML = '<div class="empty">אין משימות להצגה בפרויקט זה.</div>';
  } else {
    tasks.forEach((task) => taskCards.appendChild(createTaskCard(task)));
  }

  projectsContainer.appendChild(node);
}

function createTaskCard(task) {
  const node = document.getElementById("taskCardTemplate").content.cloneNode(true);
  const card = node.querySelector(".task-card");
  card.classList.add(`status-${task.status}`);

  const statusBadge = node.querySelector(".status-badge");
  statusBadge.textContent = statusLabel(task.status);
  statusBadge.classList.add(task.status);

  const priorityBadge = node.querySelector(".priority-badge");
  priorityBadge.textContent = priorityLabel(task.priority);
  priorityBadge.classList.add(task.priority || "normal");

  node.querySelector(".tag-badge").textContent = task.tag || "";
  node.querySelector(".task-title-text").textContent = task.title;
  node.querySelector(".owner-text").textContent = `אחראי/ת: ${task.owner}`;
  node.querySelector(".deadline-text").textContent = deadlineLabel(task);
  node.querySelector(".created-text").textContent = `נוצרה: ${formatDate(task.created_at)}`;
  node.querySelector(".task-notes-text").textContent = task.notes || "";

  const completeButton = node.querySelector(".complete-toggle");
  completeButton.textContent = task.status === "done" ? "החזרה לפתוח" : "סימון כבוצע";
  completeButton.addEventListener("click", async () => {
    const newStatus = task.status === "done" ? "in_progress" : "done";
    const { error } = await db
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "done" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);

    if (error) return alert(error.message);
    await loadAll();
  });

  const titleInput = node.querySelector(".edit-title");
  const ownerInput = node.querySelector(".edit-owner");
  const deadlineInput = node.querySelector(".edit-deadline");
  const statusInput = node.querySelector(".edit-status");
  const priorityInput = node.querySelector(".edit-priority");
  const tagInput = node.querySelector(".edit-tag");
  const notesInput = node.querySelector(".edit-notes");

  titleInput.value = task.title;
  populateResearcherSelect(ownerInput, task.owner);
  deadlineInput.value = task.deadline || "";
  statusInput.value = task.status;
  priorityInput.value = task.priority || "normal";
  tagInput.value = task.tag || "";
  notesInput.value = task.notes || "";

  node.querySelector(".save-task").addEventListener("click", async (event) => {
    event.preventDefault();
    const newStatus = statusInput.value;

    const { error } = await db
      .from("tasks")
      .update({
        title: titleInput.value.trim(),
        owner: ownerInput.value,
        deadline: deadlineInput.value || null,
        status: newStatus,
        priority: priorityInput.value,
        tag: tagInput.value.trim(),
        notes: notesInput.value.trim(),
        completed_at:
          newStatus === "done"
            ? task.completed_at || new Date().toISOString()
            : null,
      })
      .eq("id", task.id);

    if (error) return alert(error.message);
    await loadAll();
  });

  node.querySelector(".delete-task").addEventListener("click", async (event) => {
    event.preventDefault();
    if (!confirm("למחוק את המשימה?")) return;
    const { error } = await db.from("tasks").delete().eq("id", task.id);
    if (error) return alert(error.message);
    await loadAll();
  });

  return node;
}

function renderResearchers() {
  researchersContainer.innerHTML = "";
  const search = document.getElementById("researcherSearch").value.trim().toLowerCase();
  const statusFilter = document.getElementById("researcherStatusFilter").value;
  const priorityFilter = document.getElementById("researcherPriorityFilter").value;
  const tasks = flattenTasks();

  if (!allResearchers.length) {
    researchersContainer.innerHTML = '<div class="empty">עדיין אין עובדים בצוות.</div>';
    return;
  }

  allResearchers.forEach((researcher) => {
    const researcherTasks = tasks
      .filter((task) => task.owner === researcher.name)
      .filter((task) => !statusFilter || task.status === statusFilter)
      .filter((task) => !priorityFilter || task.priority === priorityFilter)
      .filter((task) => {
        const haystack = [
          task.title,
          task.projectName,
          task.notes || "",
          task.tag || "",
        ].join(" ").toLowerCase();
        return !search || haystack.includes(search);
      })
      .sort(sortTasks);

    const node = document.getElementById("researcherCardTemplate").content.cloneNode(true);
    node.querySelector(".researcher-title").textContent = researcher.name;
    node.querySelector(".researcher-count").textContent = `${researcherTasks.length} משימות`;
    node.querySelector(".researcher-load").textContent =
      `${researcherTasks.filter((task) => task.status !== "done").length} פתוחות`;

    const list = node.querySelector(".researcher-tasks");

    if (!researcherTasks.length) {
      list.innerHTML = '<div class="empty">אין משימות להצגה.</div>';
    } else {
      researcherTasks.forEach((task) => {
        const item = document.createElement("div");
        item.className = `researcher-task-item status-${task.status}`;
        item.innerHTML = `
          <div class="researcher-task-top">
            <strong>${escapeHtml(task.title)}</strong>
            <span>${statusLabel(task.status)} · ${priorityLabel(task.priority)}</span>
          </div>
          <div class="researcher-task-meta">
            <span><strong>פרויקט:</strong> ${escapeHtml(task.projectName)}</span>
            <span><strong>דד־ליין:</strong> ${deadlineLabel(task)}</span>
            ${task.tag ? `<span><strong>תגית:</strong> ${escapeHtml(task.tag)}</span>` : ""}
          </div>
          ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ""}
        `;
        list.appendChild(item);
      });
    }

    researchersContainer.appendChild(node);
  });
}

function renderCalendar() {
  let tasks = flattenTasks();
  const filter = document.getElementById("calendarFilter").value;
  const sort = document.getElementById("calendarSort").value;
  const today = startOfToday();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  if (filter === "overdue") tasks = tasks.filter((task) => isOverdue(task, today));
  if (filter === "week") {
    tasks = tasks.filter((task) => {
      if (!task.deadline || task.status === "done") return false;
      const due = parseDate(task.deadline);
      return due >= today && due <= weekEnd;
    });
  }
  if (filter === "no_deadline") tasks = tasks.filter((task) => !task.deadline);
  if (filter === "done") tasks = tasks.filter((task) => task.status === "done");

  tasks.sort((a, b) => {
    if (sort === "priority") return priorityRank(b.priority) - priorityRank(a.priority);
    if (sort === "owner") return a.owner.localeCompare(b.owner, "he");
    if (sort === "project") return a.projectName.localeCompare(b.projectName, "he");
    return sortTasks(a, b);
  });

  calendarTasks.innerHTML = "";
  if (!tasks.length) {
    calendarTasks.innerHTML = '<div class="empty">אין משימות להצגה.</div>';
    return;
  }

  tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = "calendar-task";
    const overdue = isOverdue(task, today);
    item.innerHTML = `
      <div class="calendar-date ${overdue ? "overdue" : ""}">
        ${task.deadline ? formatDate(task.deadline) : "ללא דד־ליין"}
      </div>
      <div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.projectName)} · ${escapeHtml(task.owner)} · ${statusLabel(task.status)} · ${priorityLabel(task.priority)}</p>
      </div>
      <div class="calendar-actions">
        <button class="primary complete-calendar-task">${task.status === "done" ? "פתיחה מחדש" : "בוצע"}</button>
      </div>
    `;

    item.querySelector(".complete-calendar-task").addEventListener("click", async () => {
      const newStatus = task.status === "done" ? "in_progress" : "done";
      const { error } = await db
        .from("tasks")
        .update({
          status: newStatus,
          completed_at: newStatus === "done" ? new Date().toISOString() : null,
        })
        .eq("id", task.id);
      if (error) return alert(error.message);
      await loadAll();
    });

    calendarTasks.appendChild(item);
  });
}

function renderTeam() {
  teamList.innerHTML = "";
  const tasks = flattenTasks();

  allResearchers.forEach((researcher) => {
    const assigned = tasks.filter((task) => task.owner === researcher.name);
    const open = assigned.filter((task) => task.status !== "done").length;

    const member = document.createElement("article");
    member.className = "team-member";
    member.innerHTML = `
      <strong>${escapeHtml(researcher.name)}</strong>
      <small>${assigned.length} משימות · ${open} פתוחות</small>
    `;

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger ghost";
    deleteButton.textContent = "מחיקה מהרשימה";
    deleteButton.addEventListener("click", async () => {
      if (assigned.length > 0) {
        alert("אי אפשר למחוק עובד/ת שיש לו/לה משימות משויכות. יש להעביר קודם את המשימות לעובד/ת אחר/ת.");
        return;
      }
      if (!confirm(`למחוק את ${researcher.name} מרשימת הצוות?`)) return;
      const { error } = await db.from("researchers").delete().eq("id", researcher.id);
      if (error) return alert(error.message);
      await loadAll();
    });

    member.appendChild(deleteButton);
    teamList.appendChild(member);
  });
}

function populateDialogSelects() {
  const projectSelect = document.getElementById("dialogProject");
  projectSelect.innerHTML = '<option value="">בחירת פרויקט</option>';
  allProjects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.appendChild(option);
  });

  populateResearcherSelect(document.getElementById("dialogOwner"));
}

function openTaskDialog(projectId = "") {
  if (!allProjects.length) {
    alert("יש ליצור קודם פרויקט.");
    return;
  }
  populateDialogSelects();
  if (projectId) document.getElementById("dialogProject").value = String(projectId);
  taskDialog.showModal();
}

function populateResearcherSelect(select, selected = "") {
  select.innerHTML = '<option value="">בחירת אחראי/ת</option>';
  allResearchers.forEach((researcher) => {
    const option = document.createElement("option");
    option.value = researcher.name;
    option.textContent = researcher.name;
    if (researcher.name === selected) option.selected = true;
    select.appendChild(option);
  });
}

function flattenTasks() {
  return allProjects.flatMap((project) =>
    (project.tasks || []).map((task) => ({
      ...task,
      projectName: project.name,
      projectId: project.id,
    }))
  );
}

function sortTasks(a, b) {
  if (!a.deadline && !b.deadline) {
    return priorityRank(b.priority) - priorityRank(a.priority);
  }
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return a.deadline.localeCompare(b.deadline);
}

function priorityRank(priority) {
  return { low: 1, normal: 2, high: 3, urgent: 4 }[priority] || 2;
}

function priorityLabel(priority) {
  return {
    low: "עדיפות נמוכה",
    normal: "עדיפות רגילה",
    high: "עדיפות גבוהה",
    urgent: "דחופה",
  }[priority || "normal"];
}

function statusLabel(status) {
  return {
    not_started: "טרם בוצע",
    in_progress: "בתהליך",
    done: "בוצע",
  }[status];
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

function isOverdue(task, today = startOfToday()) {
  return Boolean(
    task.deadline &&
    task.status !== "done" &&
    parseDate(task.deadline) < today
  );
}

function deadlineLabel(task) {
  if (!task.deadline) return "ללא דד־ליין";
  const today = startOfToday();
  const due = parseDate(task.deadline);
  const diff = Math.ceil((due - today) / 86400000);

  if (task.status !== "done" && diff < 0) {
    return `${formatDate(task.deadline)} — באיחור`;
  }
  if (task.status !== "done" && diff === 0) {
    return `${formatDate(task.deadline)} — היום`;
  }
  if (task.status !== "done" && diff > 0 && diff <= 3) {
    return `${formatDate(task.deadline)} — בעוד ${diff} ימים`;
  }
  return formatDate(task.deadline);
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("he-IL").format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
