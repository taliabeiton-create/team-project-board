const SUPABASE_URL = "https://gwcuryhghwkyvuhqyzlm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_05YV4twxFp233ltEe1ydtw_kNhDjrEU";
const TZ = "Asia/Jerusalem";
const STAGES = ["תכנון","כתיבת פרוטוקול","הלסינקי","הכנות","גיוס","איסוף נתונים","ניתוח","כתיבה","סיום"];

const configured = !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
let db = null;
let projects = [], researchers = [], milestones = [], allocations = [], tasks = [];
let workloadMode = "fte";
const openResearchIds = new Set();
const openMilestoneIds = new Set();
const openGanttIds = new Set();
const closedTaskGroups = new Set();

const pageTitles = {
  dashboardView:["דף הבית","תמונת מצב של המחקרים והצוות"],
  researchView:["מחקרים","מעקב מרוכז אחר מחקרים, אבני דרך ומשימות"],
  tasksView:["משימות","סינון, קיבוץ ומעקב אחר כל המשימות"],
  ganttView:["גאנט","תכנון וניהול זמן של מחקרים ואבני דרך"],
  peopleView:["עובדים","עומס, תפקידים והקצאות"],
  teamView:["ניהול צוות","הוספה ועריכה של עובדי המחלקה"]
};

const $ = id => document.getElementById(id);

if (configured) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  $("setupNotice").classList.add("hidden");
  init();
}

function init(){
  setupStaticSelects();
  bindEvents();
  loadAll();
}

function setupStaticSelects(){
  [$("researchStage"),$("researchStageFilter")].forEach((select,idx)=>{
    if(idx===1) select.innerHTML='<option value="">כל השלבים</option>'; else select.innerHTML='';
    STAGES.forEach(s=>addOption(select,s,s));
  });
  const year = currentIsraelDate().getFullYear();
  [year-1,year,year+1,year+2].forEach(y=>addOption($("ganttYear"),y,y,y===year));
}

function bindEvents(){
  document.querySelectorAll(".nav-button").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
  $("newResearchBtn").addEventListener("click",()=>openResearchDialog());
  $("newTaskBtn").addEventListener("click",()=>openTaskDialog());
  $("newPersonBtn").addEventListener("click",()=>openPersonDialog());
  $("refreshBtn").addEventListener("click",loadAll);

  $("expandAllResearch").addEventListener("click",()=>{projects.forEach(p=>openResearchIds.add(Number(p.id)));renderResearch();});
  $("collapseAllResearch").addEventListener("click",()=>{openResearchIds.clear();renderResearch();});

  $("workloadByFte").addEventListener("click",()=>setWorkloadMode("fte"));
  $("workloadByTasks").addEventListener("click",()=>setWorkloadMode("tasks"));

  $("taskProject").addEventListener("change",updateTaskMilestoneOptions);
  $("ganttToday").addEventListener("click",()=>{$("ganttYear").value=currentIsraelDate().getFullYear();renderGantt();});

  $("researchForm").addEventListener("submit",saveResearch);
  $("milestoneForm").addEventListener("submit",saveMilestone);
  $("taskForm").addEventListener("submit",saveTask);
  $("allocationForm").addEventListener("submit",saveAllocation);
  $("personForm").addEventListener("submit",savePerson);

  bindClose(".close-research-dialog",$("researchDialog"));
  bindClose(".close-milestone-dialog",$("milestoneDialog"));
  bindClose(".close-task-dialog",$("taskDialog"));
  bindClose(".close-allocation-dialog",$("allocationDialog"));
  bindClose(".close-person-dialog",$("personDialog"));

  ["researchSearch","researchStageFilter","researchCoordinatorFilter"].forEach(id=>{
    $(id).addEventListener("input",renderResearch);$(id).addEventListener("change",renderResearch);
  });
  ["taskSearch","taskProjectFilter","taskPersonFilter","taskStatusFilter","taskDeadlineFilter","taskPriorityFilter","taskGroupBy"].forEach(id=>{
    $(id).addEventListener("input",renderTasks);$(id).addEventListener("change",renderTasks);
  });
  ["ganttYear","ganttCoordinatorFilter"].forEach(id=>$(id).addEventListener("change",renderGantt));
  $("peopleSearch").addEventListener("input",renderPeople);
}

function bindClose(selector,dialog){document.querySelectorAll(selector).forEach(b=>b.addEventListener("click",()=>dialog.close()));}

function switchTab(tabId){
  document.querySelectorAll(".nav-button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tabId));
  document.querySelectorAll(".tab-view").forEach(v=>v.classList.toggle("active",v.id===tabId));
  const [t,s]=pageTitles[tabId];$("pageTitle").textContent=t;$("pageSubtitle").textContent=s;
}

async function loadAll(){
  const [p,r,m,a,t] = await Promise.all([
    db.from("projects").select("*").order("created_at"),
    db.from("researchers").select("*").order("name"),
    db.from("milestones").select("*").order("deadline"),
    db.from("project_allocations").select("*"),
    db.from("tasks").select("*").order("deadline")
  ]);
  const error=p.error||r.error||m.error||a.error||t.error;
  if(error){alert(error.message);return;}
  projects=p.data||[];researchers=r.data||[];milestones=m.data||[];allocations=a.data||[];tasks=t.data||[];
  await ensureGeneralMilestones();
  populateFilters();
  renderAll();
}

async function ensureGeneralMilestones(){
  for(const p of projects){
    if(!milestones.some(m=>Number(m.project_id)===Number(p.id))){
      const {data,error}=await db.from("milestones").insert({project_id:p.id,name:"שוטף וכללי",status:"in_progress",progress:0}).select().single();
      if(!error&&data) milestones.push(data);
    }
  }
}

function populateFilters(){
  fillResearcherSelect($("researchCoordinator"));
  fillResearcherSelect($("milestoneOwner"));
  fillResearcherSelect($("taskOwner"));
  fillResearcherSelect($("allocationResearcher"));

  $("taskProject").innerHTML='<option value="">בחירת מחקר</option>';
  $("taskProjectFilter").innerHTML='<option value="">לפי מחקר</option>';
  projects.forEach(p=>{addOption($("taskProject"),p.id,p.name);addOption($("taskProjectFilter"),p.id,p.name);});

  $("taskPersonFilter").innerHTML='<option value="">לפי אדם</option>';
  $("researchCoordinatorFilter").innerHTML='<option value="">כל המתאמים</option>';
  $("ganttCoordinatorFilter").innerHTML='<option value="">כל הרכזים</option>';
  researchers.forEach(r=>{
    addOption($("taskPersonFilter"),r.id,r.name);
    addOption($("researchCoordinatorFilter"),r.id,r.name);
    addOption($("ganttCoordinatorFilter"),r.id,r.name);
  });
}

function renderAll(){renderDashboard();renderResearch();renderTasks();renderGantt();renderPeople();renderTeam();}

function renderDashboard(){
  $("activeResearchCount").textContent=projects.filter(p=>p.research_status!=="completed").length;
  $("openTaskCount").textContent=tasks.filter(t=>t.status!=="done").length;
  $("overdueTaskCount").textContent=tasks.filter(isTaskOverdue).length;
  const now=israelToday(),end=addDays(now,30);
  const upcoming=milestones.filter(m=>m.status!=="done"&&m.deadline&&parseDate(m.deadline)>=now&&parseDate(m.deadline)<=end);
  $("upcomingMilestoneCount").textContent=upcoming.length;
  renderWorkload();

  const deadlines=$("dashboardDeadlines");deadlines.innerHTML=upcoming.length?"":empty("אין דד־ליינים קרובים.");
  upcoming.sort(sortByDate).slice(0,8).forEach(m=>{
    const el=document.createElement("div");el.className="stack-item";
    el.innerHTML=`<div><strong>${esc(m.name)}</strong><small>${esc(projectName(m.project_id))}</small></div><strong>${formatDate(m.deadline)}</strong>`;
    deadlines.appendChild(el);
  });

  const attention=$("dashboardAttention");
  const incomplete=projects.filter(p=>!p.coordinator_id||!p.start_date||!p.overall_deadline||!projectAllocations(p.id).length);
  attention.innerHTML=incomplete.length?"":empty("כל המחקרים מלאים.");
  incomplete.slice(0,8).forEach(p=>{
    const reasons=[];if(!p.coordinator_id)reasons.push("ללא רכז");if(!p.start_date||!p.overall_deadline)reasons.push("חסרים תאריכים");if(!projectAllocations(p.id).length)reasons.push("ללא הקצאות");
    const el=document.createElement("div");el.className="stack-item";el.innerHTML=`<div><strong>${esc(p.name)}</strong><small>${esc(reasons.join(" · "))}</small></div>`;
    attention.appendChild(el);
  });
}

function setWorkloadMode(mode){
  workloadMode=mode;$("workloadByFte").classList.toggle("active",mode==="fte");$("workloadByTasks").classList.toggle("active",mode==="tasks");
  $("workloadSubtitle").textContent=mode==="fte"?"לפי אחוזי משרה":"לפי משימות פתוחות ומשוקללות";renderWorkload();
}

function renderWorkload(){
  const c=$("dashboardWorkload");c.innerHTML="";
  researchers.forEach(r=>{
    const value=workloadMode==="fte"?totalAllocated(r.id):weightedTaskScore(r.id);
    const cap=workloadMode==="fte"?Number(r.employment_percentage||100):Math.max(...researchers.map(x=>weightedTaskScore(x.id)),1);
    const pct=Math.min((value/cap)*100,100);
    const card=document.createElement("div");card.className="workload-card";
    card.innerHTML=`<h4>${esc(r.name)}</h4><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><p>${workloadMode==="fte"?`${value}% מתוך ${cap}%`:`${value} נקודות עומס`}</p>`;
    c.appendChild(card);
  });
}

function renderResearch(){
  const c=$("researchAccordion"),search=$("researchSearch").value.trim().toLowerCase(),stage=$("researchStageFilter").value,coord=$("researchCoordinatorFilter").value;
  const list=projects.filter(p=>{
    const hay=[p.name,p.principal_investigator,p.current_stage,personName(p.coordinator_id),...projectTasks(p.id).map(t=>t.title)].join(" ").toLowerCase();
    return(!search||hay.includes(search))&&(!stage||p.current_stage===stage)&&(!coord||String(p.coordinator_id)===coord);
  });
  c.innerHTML=list.length?"":empty("לא נמצאו מחקרים.");
  list.forEach(p=>c.appendChild(createResearchCard(p)));
}

function createResearchCard(p){
  const card=document.createElement("article");card.className="research-card";if(openResearchIds.has(Number(p.id)))card.classList.add("open");
  const open=projectTasks(p.id).filter(t=>t.status!=="done"),next=nearestDeadline(p.id);
  card.innerHTML=`
    <div class="research-summary">
      <span class="chevron">›</span>
      <div><div class="name">${esc(p.name)}</div><div class="sub">${esc(personName(p.coordinator_id)||"ללא מתאם")} · ${esc(p.current_stage||"תכנון")}</div></div>
      <div class="hide-sm"><span class="status-pill status-${researchStatusToTaskStatus(p.research_status)}">${researchStatusLabel(p.research_status)}</span></div>
      <div><div class="number">${Number(p.progress||0)}%</div><div class="label">התקדמות</div></div>
      <div class="hide-md"><div class="number">${next?formatDate(next):"—"}</div><div class="label">הדד־ליין הבא</div></div>
      <div><div class="number">${open.length}</div><div class="label">משימות פתוחות</div></div>
    </div>
    <div class="research-details">
      <div class="research-action-row">
        <div class="research-actions">
          <button class="primary add-milestone">+ אבן דרך</button>
          <button class="secondary add-task">+ משימה</button>
          <button class="secondary edit-research">✎ עריכה</button>
          <button class="secondary add-allocation">+ הקצאת עובד</button>
          <button class="secondary danger-outline delete-research">מחיקת מחקר</button>
        </div>
        <div class="allocation-chips"></div>
      </div>
      <div class="milestones-title">אבני דרך</div>
      <div class="milestones-container"></div>
    </div>`;

  card.querySelector(".research-summary").addEventListener("click",()=>{
    const id=Number(p.id);openResearchIds.has(id)?openResearchIds.delete(id):openResearchIds.add(id);card.classList.toggle("open");
  });
  card.querySelector(".add-milestone").addEventListener("click",()=>openMilestoneDialog(p.id));
  card.querySelector(".add-task").addEventListener("click",()=>openTaskDialog(p.id));
  card.querySelector(".edit-research").addEventListener("click",()=>openResearchDialog(p));
  card.querySelector(".add-allocation").addEventListener("click",()=>openAllocationDialog(p.id));
  card.querySelector(".delete-research").addEventListener("click",()=>deleteResearch(p));

  const chips=card.querySelector(".allocation-chips");
  const allocs=projectAllocations(p.id);
  if(!allocs.length)chips.innerHTML='<span class="allocation-chip">אין הקצאות</span>';
  allocs.forEach(a=>{
    const chip=document.createElement("span");
    chip.className="allocation-chip";
    chip.innerHTML=`<button class="allocation-edit" title="${esc(a.role||"ללא תפקיד")} — עריכה">${esc(personName(a.researcher_id))} · ${Number(a.allocation_percent||0)}%</button><button class="allocation-delete" title="מחיקת הקצאה">×</button>`;
    chip.querySelector(".allocation-edit").addEventListener("click",()=>openAllocationDialog(p.id,a));
    chip.querySelector(".allocation-delete").addEventListener("click",()=>deleteAllocation(a));
    chips.appendChild(chip);
  });

  const box=card.querySelector(".milestones-container");
  projectMilestones(p.id).sort(sortByDate).forEach(m=>box.appendChild(createMilestoneCard(m)));
  return card;
}

function createMilestoneCard(m){
  const el=document.createElement("article");el.className="milestone-card";if(openMilestoneIds.has(Number(m.id)))el.classList.add("open");
  const mtasks=tasks.filter(t=>Number(t.milestone_id)===Number(m.id));
  el.innerHTML=`
    <div class="milestone-head">
      <span class="chevron">›</span>
      <div><div class="name">${esc(m.name)}</div><div class="sub">${esc(personName(m.owner_id)||"ללא אחראי")}</div></div>
      <span class="status-pill status-${m.status}">${statusLabel(m.status)}</span>
      <span>${m.deadline?formatDate(m.deadline):"ללא תאריך"}</span>
      <div class="mini-actions">
        <button class="mini-btn add-task-m" title="הוספת משימה">＋</button>
        <button class="mini-btn edit edit-m" title="עריכה">✎</button>
        <button class="mini-btn danger delete-m" title="מחיקה">×</button>
      </div>
    </div>
    <div class="milestone-body">
      <table class="task-table">
        <thead><tr><th>משימה</th><th>אחראי/ת</th><th>דד־ליין</th><th>סטטוס</th><th>עדיפות</th><th>פעולות</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  el.querySelector(".milestone-head").addEventListener("click",e=>{
    if(e.target.closest("button"))return;const id=Number(m.id);openMilestoneIds.has(id)?openMilestoneIds.delete(id):openMilestoneIds.add(id);el.classList.toggle("open");
  });
  el.querySelector(".add-task-m").addEventListener("click",()=>openTaskDialog(m.project_id,m.id));
  el.querySelector(".edit-m").addEventListener("click",()=>openMilestoneDialog(m.project_id,m));
  el.querySelector(".delete-m").addEventListener("click",()=>deleteMilestone(m));

  const tbody=el.querySelector("tbody");
  if(!mtasks.length)tbody.innerHTML='<tr><td colspan="6"><div class="empty">אין משימות תחת אבן דרך זו.</div></td></tr>';
  mtasks.sort(sortByDate).forEach(t=>tbody.appendChild(createTaskTableRow(t)));
  return el;
}

function createTaskTableRow(t){
  const tr=document.createElement("tr");
  tr.innerHTML=`<td><strong>${esc(t.title)}</strong></td><td>${esc(personName(t.owner_id)||"")}</td><td>${t.deadline?formatDate(t.deadline):"—"}</td><td><span class="status-pill status-${t.status}">${statusLabel(t.status)}</span></td><td>${priorityLabel(t.priority)}</td><td><div class="mini-actions"><button class="mini-btn toggle" title="${t.status==="done"?"פתיחה מחדש":"סימון כבוצע"}">${t.status==="done"?"↶":"✓"}</button><button class="mini-btn edit" title="עריכה">✎</button><button class="mini-btn danger delete" title="מחיקה">×</button></div></td>`;
  tr.querySelector(".toggle").addEventListener("click",()=>toggleTask(t));
  tr.querySelector(".edit").addEventListener("click",()=>openTaskDialog(t.project_id,t.milestone_id,t));
  tr.querySelector(".delete").addEventListener("click",()=>deleteTask(t));
  return tr;
}

function renderTasks(){
  const filtered=getFilteredTasks();
  $("allTasksStat").textContent=tasks.length;$("openTasksStat").textContent=tasks.filter(t=>t.status!=="done").length;$("overdueTasksStat").textContent=tasks.filter(isTaskOverdue).length;
  const weekAgo=addDays(israelToday(),-7);
  $("completedWeekStat").textContent=tasks.filter(t=>t.completed_at&&new Date(t.completed_at)>=weekAgo).length;

  const groupBy=$("taskGroupBy").value||"project";
  const groups={};
  filtered.forEach(t=>{const key=groupKey(t,groupBy);(groups[key]??=[]).push(t);});
  const c=$("taskGroups");c.innerHTML=Object.keys(groups).length?"":empty("אין משימות להצגה.");
  Object.entries(groups).forEach(([key,list])=>{
    const section=document.createElement("article");section.className="task-group";
    const groupId=`${groupBy}:${key}`;
    if(closedTaskGroups.has(groupId))section.classList.add("collapsed");
    section.innerHTML=`<div class="task-group-header"><div><h3>${esc(groupLabel(key,groupBy))}</h3><small>${list.length} משימות</small></div><span class="group-chevron">⌄</span></div><div class="task-group-body"><table class="task-table"><thead><tr><th>שם המשימה</th><th>אחראי/ת</th><th>אבן דרך</th><th>דד־ליין</th><th>סטטוס</th><th>עדיפות</th><th>פעולות</th></tr></thead><tbody></tbody></table></div>`;
    section.querySelector(".task-group-header").addEventListener("click",()=>{
      if(closedTaskGroups.has(groupId))closedTaskGroups.delete(groupId);else closedTaskGroups.add(groupId);
      section.classList.toggle("collapsed");
    });
    const tbody=section.querySelector("tbody");
    list.sort(sortByDate).forEach(t=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td><strong>${esc(t.title)}</strong></td><td>${esc(personName(t.owner_id)||"")}</td><td>${esc(milestoneName(t.milestone_id)||"")}</td><td class="${isTaskOverdue(t)?"date-overdue":""}">${t.deadline?formatDate(t.deadline):"—"}</td><td><span class="status-pill status-${t.status}">${statusLabel(t.status)}</span></td><td>${priorityLabel(t.priority)}</td><td><div class="mini-actions"><button class="mini-btn toggle">${t.status==="done"?"↶":"✓"}</button><button class="mini-btn edit">✎</button><button class="mini-btn danger delete">×</button></div></td>`;
      tr.querySelector(".toggle").addEventListener("click",()=>toggleTask(t));tr.querySelector(".edit").addEventListener("click",()=>openTaskDialog(t.project_id,t.milestone_id,t));tr.querySelector(".delete").addEventListener("click",()=>deleteTask(t));tbody.appendChild(tr);
    });
    c.appendChild(section);
  });
  renderPeopleQuickView();
}

function getFilteredTasks(){
  const search=$("taskSearch").value.trim().toLowerCase(),pid=$("taskProjectFilter").value,person=$("taskPersonFilter").value,status=$("taskStatusFilter").value,deadline=$("taskDeadlineFilter").value,priority=$("taskPriorityFilter").value;
  const now=israelToday(),week=addDays(now,7),month=addDays(now,30);
  return tasks.filter(t=>{
    const hay=[t.title,projectName(t.project_id),personName(t.owner_id),milestoneName(t.milestone_id),t.tag,t.notes].join(" ").toLowerCase();
    if(search&&!hay.includes(search))return false;if(pid&&String(t.project_id)!==pid)return false;if(person&&String(t.owner_id)!==person)return false;if(status&&t.status!==status)return false;if(priority&&t.priority!==priority)return false;
    if(deadline==="overdue"&&!isTaskOverdue(t))return false;
    if(deadline==="week"&&(!t.deadline||parseDate(t.deadline)<now||parseDate(t.deadline)>week))return false;
    if(deadline==="month"&&(!t.deadline||parseDate(t.deadline)<now||parseDate(t.deadline)>month))return false;
    if(deadline==="none"&&t.deadline)return false;
    return true;
  });
}

function groupKey(t,mode){
  if(mode==="person")return String(t.owner_id||"none");if(mode==="status")return t.status;if(mode==="milestone")return String(t.milestone_id||"none");return String(t.project_id);
}
function groupLabel(key,mode){
  if(mode==="person")return personName(key)||"ללא אחראי";if(mode==="status")return statusLabel(key);if(mode==="milestone")return milestoneName(key)||"ללא אבן דרך";return projectName(key)||"ללא מחקר";
}
function renderPeopleQuickView(){
  const c=$("peopleQuickView");c.innerHTML="<h3>תצוגה לפי אדם</h3>";
  researchers.slice(0,8).forEach(r=>{
    const personTasks=tasks.filter(t=>Number(t.owner_id)===Number(r.id)),open=personTasks.filter(t=>t.status!=="done").length,over=personTasks.filter(isTaskOverdue).length;
    const el=document.createElement("div");el.className="quick-person";el.innerHTML=`<strong>${esc(r.name)}</strong><small>${open} פתוחות · ${over} באיחור</small>`;
    el.addEventListener("click",()=>{$("taskPersonFilter").value=r.id;renderTasks();});c.appendChild(el);
  });
}

function renderGantt(){
  const c=$("ganttChart"),year=Number($("ganttYear").value),coord=$("ganttCoordinatorFilter").value,months=["ינו","פבר","מרץ","אפר","מאי","יוני","יולי","אוג","ספט","אוק","נוב","דצמ"];
  c.innerHTML=`<div class="gantt-header"><div class="gantt-label">מחקר</div>${months.map(m=>`<div class="gantt-cell">${m}</div>`).join("")}</div>`;
  projects.filter(p=>!coord||String(p.coordinator_id)===coord).forEach(p=>{
    const wrapper=document.createElement("div");wrapper.className="gantt-project";if(openGanttIds.has(Number(p.id)))wrapper.classList.add("open");
    const row=buildGanttRow(`${openGanttIds.has(Number(p.id))?"⌄":"›"} ${p.name}`,p.start_date,p.overall_deadline,"project",year,months);
    row.classList.add("gantt-project-row");
    row.querySelector(".gantt-label").addEventListener("click",()=>{const id=Number(p.id);openGanttIds.has(id)?openGanttIds.delete(id):openGanttIds.add(id);renderGantt();});
    wrapper.appendChild(row);
    const details=buildMilestoneDetailRow(p,year,months);details.classList.add("gantt-details-row");
    wrapper.appendChild(details);c.appendChild(wrapper);
  });
}

function buildGanttRow(label,startValue,endValue,type,year,months){
  const row=document.createElement("div");row.className="gantt-row";
  row.innerHTML=`<div class="gantt-label">${esc(label)}</div>${months.map(()=>`<div class="gantt-cell"></div>`).join("")}`;
  if(startValue&&endValue){
    const start=parseDate(startValue),end=parseDate(endValue);
    if(!(end.getFullYear()<year||start.getFullYear()>year)){
      const sm=start.getFullYear()<year?0:start.getMonth(),em=end.getFullYear()>year?11:end.getMonth();
      const cells=[...row.querySelectorAll(".gantt-cell")];
      const bar=document.createElement("div");bar.className="gantt-bar";bar.style.width=`${Math.max(100,(em-sm+1)*100)}%`;cells[sm].appendChild(bar);
    }
  } else {
    row.querySelector(".gantt-label").title="לא הוגדר טווח זמן";
  }
  return row;
}

function buildMilestoneDetailRow(p,year,months){
  const row=document.createElement("div");row.className="gantt-row";
  row.innerHTML=`<div class="gantt-label">אבני דרך</div>${months.map(()=>`<div class="gantt-cell"></div>`).join("")}`;
  const cells=[...row.querySelectorAll(".gantt-cell")];
  projectMilestones(p.id).forEach(m=>{
    if(!m.start_date||!m.deadline)return;
    const start=parseDate(m.start_date),end=parseDate(m.deadline);
    if(end.getFullYear()<year||start.getFullYear()>year)return;
    const sm=start.getFullYear()<year?0:start.getMonth(),em=end.getFullYear()>year?11:end.getMonth();
    const strip=document.createElement("div");strip.className="gantt-milestone-strip";strip.style.width=`${Math.max(100,(em-sm+1)*100)}%`;strip.textContent=m.name;
    strip.addEventListener("mouseenter",e=>showMilestoneTooltip(e,m));strip.addEventListener("mouseleave",hideTooltip);cells[sm].appendChild(strip);
  });
  return row;
}

function showMilestoneTooltip(e,m){
  hideTooltip();const related=tasks.filter(t=>Number(t.milestone_id)===Number(m.id));
  const tip=document.createElement("div");tip.id="ganttTooltip";tip.className="tooltip";tip.innerHTML=`<h4>${esc(m.name)}</h4><div>${m.start_date?formatDate(m.start_date):"—"}–${m.deadline?formatDate(m.deadline):"—"}</div><div>אחראי/ת: ${esc(personName(m.owner_id)||"לא הוגדר")}</div><div>סטטוס: ${statusLabel(m.status)}</div><ul>${related.slice(0,6).map(t=>`<li>${esc(t.title)} — ${t.deadline?formatDate(t.deadline):"ללא תאריך"}</li>`).join("")||"<li>אין משימות</li>"}</ul>`;
  document.body.appendChild(tip);tip.style.left=`${Math.min(e.clientX+12,window.innerWidth-340)}px`;tip.style.top=`${Math.min(e.clientY+12,window.innerHeight-260)}px`;
}
function hideTooltip(){document.getElementById("ganttTooltip")?.remove();}

function renderPeople(){
  const c=$("peopleCards"),search=$("peopleSearch").value.trim().toLowerCase();c.innerHTML="";
  researchers.filter(r=>!search||[r.name,r.general_role,r.specialty].join(" ").toLowerCase().includes(search)).forEach(r=>c.appendChild(personCard(r,false)));
}
function renderTeam(){const c=$("teamManagementList");c.innerHTML="";researchers.forEach(r=>c.appendChild(personCard(r,true)));}

function personCard(r,editable){
  const el=document.createElement("article");el.className="person-card";const allocs=projectAllocationsByPerson(r.id);
  el.innerHTML=`<h3>${esc(r.name)}</h3><p>${esc(r.general_role||"ללא תפקיד")} · ${esc(r.specialty||"ללא התמחות")}</p><p>${Number(r.employment_percentage||100)}% משרה · ${allocs.length} מחקרים · ${openTaskCount(r.id)} משימות פתוחות</p>${editable?'<div class="mini-actions"><button class="mini-btn edit">✎</button><button class="mini-btn danger delete">×</button></div>':""}`;
  if(editable){el.querySelector(".edit").addEventListener("click",()=>openPersonDialog(r));el.querySelector(".delete").addEventListener("click",()=>deletePerson(r));}
  return el;
}

function openResearchDialog(p=null){
  $("researchForm").reset();$("researchDialogTitle").textContent=p?"עריכת מחקר":"מחקר חדש";$("researchId").value=p?.id||"";$("researchName").value=p?.name||"";fillResearcherSelect($("researchCoordinator"),p?.coordinator_id||"");$("researchPi").value=p?.principal_investigator||"";$("researchStage").value=p?.current_stage||"תכנון";$("researchStartDate").value=p?.start_date||"";$("researchDeadline").value=p?.overall_deadline||"";$("researchStatus").value=p?.research_status||"active";$("researchProgress").value=Number(p?.progress||0);$("researchNotes").value=p?.management_notes||"";$("researchDialog").showModal();
}
function openMilestoneDialog(projectId,m=null){
  $("milestoneForm").reset();$("milestoneDialogTitle").textContent=m?"עריכת אבן דרך":"אבן דרך חדשה";$("milestoneId").value=m?.id||"";$("milestoneProjectId").value=projectId;$("milestoneName").value=m?.name||"";fillResearcherSelect($("milestoneOwner"),m?.owner_id||"");$("milestoneStartDate").value=m?.start_date||"";$("milestoneDeadline").value=m?.deadline||"";$("milestoneStatus").value=m?.status||"not_started";$("milestoneProgress").value=Number(m?.progress||0);$("milestoneNotes").value=m?.notes||"";$("milestoneDialog").showModal();
}
function openTaskDialog(projectId="",milestoneId="",t=null){
  $("taskForm").reset();$("taskDialogTitle").textContent=t?"עריכת משימה":"משימה חדשה";$("taskId").value=t?.id||"";$("taskProject").value=projectId||t?.project_id||"";updateTaskMilestoneOptions();$("taskMilestone").value=milestoneId||t?.milestone_id||"";$("taskTitle").value=t?.title||"";fillResearcherSelect($("taskOwner"),t?.owner_id||"");$("taskStartDate").value=t?.start_date||"";$("taskDeadline").value=t?.deadline||"";$("taskStatus").value=t?.status||"not_started";$("taskPriority").value=t?.priority||"normal";$("taskSize").value=t?.task_size||"medium";$("taskHours").value=Number(t?.estimated_hours||0);$("taskTag").value=t?.tag||"";$("taskNotes").value=t?.notes||"";$("taskDialog").showModal();
}
function updateTaskMilestoneOptions(){$("taskMilestone").innerHTML='<option value="">בחירת אבן דרך</option>';projectMilestones($("taskProject").value).forEach(m=>addOption($("taskMilestone"),m.id,m.name));}
function openAllocationDialog(projectId,a=null){
  $("allocationForm").reset();$("allocationId").value=a?.id||"";$("allocationProjectId").value=projectId;fillResearcherSelect($("allocationResearcher"),a?.researcher_id||"");$("allocationRole").value=a?.role||"";$("allocationPercent").value=Number(a?.allocation_percent||0);$("allocationHours").value=Number(a?.weekly_hours||0);$("allocationDialog").showModal();
}
function openPersonDialog(r=null){
  $("personForm").reset();$("personDialogTitle").textContent=r?"עריכת עובד/ת":"עובד/ת חדש/ה";$("personId").value=r?.id||"";$("personName").value=r?.name||"";$("personRole").value=r?.general_role||"";$("personSpecialty").value=r?.specialty||"";$("personFte").value=Number(r?.employment_percentage||100);$("personWeeklyHours").value=Number(r?.weekly_hours||40);$("personStartDate").value=r?.employment_start_date||"";$("personBirthday").value=r?.birthday_day_month||"";$("personStatus").value=r?.person_status||"active";$("personNotes").value=r?.management_notes||"";$("personDialog").showModal();
}

async function saveResearch(e){e.preventDefault();const payload={name:$("researchName").value.trim(),coordinator_id:$("researchCoordinator").value?Number($("researchCoordinator").value):null,principal_investigator:$("researchPi").value.trim(),current_stage:$("researchStage").value,start_date:$("researchStartDate").value||null,overall_deadline:$("researchDeadline").value||null,research_status:$("researchStatus").value,progress:Number($("researchProgress").value||0),management_notes:$("researchNotes").value.trim()};const res=$("researchId").value?await db.from("projects").update(payload).eq("id",$("researchId").value):await db.from("projects").insert(payload);if(res.error)alert(res.error.message);else{$("researchDialog").close();loadAll();}}
async function saveMilestone(e){e.preventDefault();const payload={project_id:Number($("milestoneProjectId").value),name:$("milestoneName").value.trim(),owner_id:$("milestoneOwner").value?Number($("milestoneOwner").value):null,start_date:$("milestoneStartDate").value||null,deadline:$("milestoneDeadline").value||null,status:$("milestoneStatus").value,progress:Number($("milestoneProgress").value||0),notes:$("milestoneNotes").value.trim()};const res=$("milestoneId").value?await db.from("milestones").update(payload).eq("id",$("milestoneId").value):await db.from("milestones").insert(payload);if(res.error)alert(res.error.message);else{$("milestoneDialog").close();loadAll();}}
async function saveTask(e){e.preventDefault();const payload={project_id:Number($("taskProject").value),milestone_id:Number($("taskMilestone").value),title:$("taskTitle").value.trim(),owner_id:Number($("taskOwner").value),start_date:$("taskStartDate").value||null,deadline:$("taskDeadline").value||null,status:$("taskStatus").value,priority:$("taskPriority").value,task_size:$("taskSize").value,estimated_hours:Number($("taskHours").value||0),tag:$("taskTag").value.trim(),notes:$("taskNotes").value.trim()};const res=$("taskId").value?await db.from("tasks").update(payload).eq("id",$("taskId").value):await db.from("tasks").insert(payload);if(res.error)alert(res.error.message);else{$("taskDialog").close();loadAll();}}
async function saveAllocation(e){e.preventDefault();const payload={project_id:Number($("allocationProjectId").value),researcher_id:Number($("allocationResearcher").value),role:$("allocationRole").value.trim(),allocation_percent:Number($("allocationPercent").value||0),weekly_hours:Number($("allocationHours").value||0)};const res=$("allocationId").value?await db.from("project_allocations").update(payload).eq("id",$("allocationId").value):await db.from("project_allocations").insert(payload);if(res.error)alert(res.error.message);else{$("allocationDialog").close();loadAll();}}
async function savePerson(e){e.preventDefault();const payload={name:$("personName").value.trim(),general_role:$("personRole").value.trim(),specialty:$("personSpecialty").value.trim(),employment_percentage:Number($("personFte").value||100),weekly_hours:Number($("personWeeklyHours").value||40),employment_start_date:$("personStartDate").value||null,birthday_day_month:$("personBirthday").value.trim(),person_status:$("personStatus").value,management_notes:$("personNotes").value.trim()};const res=$("personId").value?await db.from("researchers").update(payload).eq("id",$("personId").value):await db.from("researchers").insert(payload);if(res.error)alert(res.error.message);else{$("personDialog").close();loadAll();}}

async function toggleTask(t){
  const newStatus=t.status==="done"?"in_progress":"done";
  const {error}=await db.from("tasks").update({status:newStatus,completed_at:newStatus==="done"?new Date().toISOString():null}).eq("id",t.id);
  if(error)alert(error.message);else{t.status=newStatus;t.completed_at=newStatus==="done"?new Date().toISOString():null;renderAll();}
}
async function deleteTask(t){if(!confirm(`למחוק את המשימה "${t.title}"?`))return;const {error}=await db.from("tasks").delete().eq("id",t.id);if(error)alert(error.message);else loadAll();}
async function deleteMilestone(m){const count=tasks.filter(t=>Number(t.milestone_id)===Number(m.id)).length;if(!confirm(`למחוק את אבן הדרך "${m.name}"${count?` ואת ${count} המשימות שבתוכה`:""}?`))return;const {error}=await db.from("milestones").delete().eq("id",m.id);if(error)alert(error.message);else loadAll();}
async function deleteResearch(p){
  if(!confirm(`למחוק את המחקר "${p.name}" ואת כל אבני הדרך, המשימות וההקצאות שלו?`))return;
  const {error}=await db.from("projects").delete().eq("id",p.id);
  if(error)alert(error.message);else{openResearchIds.delete(Number(p.id));openGanttIds.delete(Number(p.id));loadAll();}
}
async function deleteAllocation(a){
  if(!confirm("למחוק את הקצאת העובד/ת מהמחקר?"))return;
  const {error}=await db.from("project_allocations").delete().eq("id",a.id);
  if(error)alert(error.message);else loadAll();
}
async function deletePerson(r){const used=allocations.some(a=>Number(a.researcher_id)===Number(r.id))||tasks.some(t=>Number(t.owner_id)===Number(r.id))||milestones.some(m=>Number(m.owner_id)===Number(r.id))||projects.some(p=>Number(p.coordinator_id)===Number(r.id));if(used)return alert("אי אפשר למחוק עובד/ת שעדיין משויך/ת למחקר או למשימה.");if(!confirm(`למחוק את ${r.name}?`))return;const {error}=await db.from("researchers").delete().eq("id",r.id);if(error)alert(error.message);else loadAll();}

function fillResearcherSelect(select,selected=""){select.innerHTML='<option value="">בחירת עובד/ת</option>';researchers.forEach(r=>addOption(select,r.id,r.name,String(r.id)===String(selected)));}
function addOption(select,value,text,selected=false){const o=document.createElement("option");o.value=value;o.textContent=text;o.selected=selected;select.appendChild(o);}
function projectMilestones(id){return milestones.filter(m=>Number(m.project_id)===Number(id))}
function projectTasks(id){return tasks.filter(t=>Number(t.project_id)===Number(id))}
function projectAllocations(id){return allocations.filter(a=>Number(a.project_id)===Number(id))}
function projectAllocationsByPerson(id){return allocations.filter(a=>Number(a.researcher_id)===Number(id))}
function projectName(id){return projects.find(p=>Number(p.id)===Number(id))?.name||""}
function milestoneName(id){return milestones.find(m=>Number(m.id)===Number(id))?.name||""}
function personName(id){return researchers.find(r=>Number(r.id)===Number(id))?.name||""}
function totalAllocated(id){return projectAllocationsByPerson(id).reduce((s,a)=>s+Number(a.allocation_percent||0),0)}
function openTaskCount(id){return tasks.filter(t=>Number(t.owner_id)===Number(id)&&t.status!=="done").length}
function weightedTaskScore(id){return tasks.filter(t=>Number(t.owner_id)===Number(id)&&t.status!=="done").reduce((s,t)=>s+({small:1,medium:2,large:3}[t.task_size]||2)+(t.priority==="urgent"?2:0)+(isTaskOverdue(t)?2:0),0)}
function nearestDeadline(pid){return [...projectMilestones(pid).filter(m=>m.status!=="done").map(m=>m.deadline),...projectTasks(pid).filter(t=>t.status!=="done").map(t=>t.deadline)].filter(Boolean).sort()[0]||null}
function isTaskOverdue(t){return t.status!=="done"&&t.deadline&&parseDate(t.deadline)<israelToday()}
function sortByDate(a,b){return(a.deadline||"9999-12-31").localeCompare(b.deadline||"9999-12-31")}
function statusLabel(v){return{not_started:"טרם בוצע",in_progress:"בתהליך",done:"בוצע"}[v]}
function researchStatusLabel(v){return{active:"בתהליך",paused:"מושהה",completed:"בוצע"}[v||"active"]}
function researchStatusToTaskStatus(v){return v==="completed"?"done":v==="paused"?"not_started":"in_progress"}
function priorityLabel(v){return{low:"נמוכה",normal:"רגילה",high:"גבוהה",urgent:"דחופה"}[v||"normal"]}
function currentIsraelDate(){return new Date(new Date().toLocaleString("en-US",{timeZone:TZ}))}
function israelToday(){const d=currentIsraelDate();d.setHours(0,0,0,0);return d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function parseDate(v){return new Date(`${v}T00:00:00`)}
function formatDate(v){if(!v)return"";return new Intl.DateTimeFormat("he-IL",{timeZone:TZ}).format(new Date(v))}
function empty(t){return`<div class="empty">${t}</div>`}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
