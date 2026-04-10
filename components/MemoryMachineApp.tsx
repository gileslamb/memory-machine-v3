"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const ACCENT = "#2d6a4f";
const MUTED = "#5c5c58";
const BORDER = "#e0e0dc";
const BG = "#f5f5f2";
const TEXT = "#1a1a1a";

const card: CSSProperties = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: 16,
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  current_state: string | null;
  budget: string | null;
  status_v2: string | null;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: string;
  reminders_id: string | null;
  created_at: string;
  updated_at: string;
};

type LogRow = {
  id: string;
  content: string;
  project_id: string | null;
  created_at: string;
};

type TimesheetRow = {
  id: string;
  project_id: string;
  duration_minutes: number;
  notes: string | null;
  logged_at: string;
  project_name: string | null;
};

type ArchiveRow = {
  id: string;
  week_label: string;
  logs_snapshot: string;
  synthesis: string | null;
  archived_at: string;
};

function mondayStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isThisWeek(iso: string): boolean {
  const t = new Date(iso).getTime();
  const start = mondayStart(new Date()).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return t >= start && t < end;
}

function authHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j && typeof j.error === "string") return j.error;
  } catch {
    /* ignore */
  }
  return res.statusText || "Request failed";
}

function firstTwoLines(text: string): string {
  const lines = text.split("\n");
  return lines.slice(0, 2).join("\n");
}

const STATUS_V2_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#888888" },
  "in-dev": { label: "In dev", color: "#3a7bd5" },
  active: { label: "Active", color: "#2d6a4f" },
  delivered: { label: "Delivered", color: "#0d9488" },
  "on-hold": { label: "On hold", color: "#d97706" },
};

const STATUS_V2_ORDER = [
  "pending",
  "in-dev",
  "active",
  "delivered",
  "on-hold",
] as const;

type ProjectCardProps = {
  project: Project;
  token: string;
  minutesTotal: number;
  onRefreshProjects: () => Promise<void>;
  onArchive: () => void | Promise<void>;
};

function ProjectCard({
  project,
  token,
  minutesTotal,
  onRefreshProjects,
  onArchive,
}: ProjectCardProps) {
  const effectiveStatus = project.status_v2 ?? "pending";
  const meta = STATUS_V2_META[effectiveStatus] ?? STATUS_V2_META.pending;

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projLogs, setProjLogs] = useState<LogRow[]>([]);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [logsOpen, setLogsOpen] = useState(false);
  const [stateExpanded, setStateExpanded] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(project.budget ?? "");
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBudgetDraft(project.budget ?? "");
  }, [project.budget]);

  const loadProjectData = useCallback(async () => {
    if (!token) return;
    const [tr, lr] = await Promise.all([
      fetch(
        `/api/tasks?project_id=${encodeURIComponent(project.id)}`,
        { headers: authHeaders(token) }
      ),
      fetch(
        `/api/logs?project_id=${encodeURIComponent(project.id)}`,
        { headers: authHeaders(token) }
      ),
    ]);
    if (tr.ok) setTasks(await tr.json());
    if (lr.ok) {
      const all: LogRow[] = await lr.json();
      setProjLogs(all.slice(0, 5));
    }
  }, [token, project.id]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData, project.updated_at]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    function close(e: MouseEvent) {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node)
      ) {
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [statusMenuOpen]);

  const openTasks = tasks.filter((t) => t.status === "open");
  const doneTasks = tasks.filter((t) => t.status === "done");

  async function patchStatusV2(v: string) {
    setStatusMenuOpen(false);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ status_v2: v }),
    });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    await onRefreshProjects();
  }

  async function saveBudget() {
    setBudgetEditing(false);
    const next = budgetDraft.trim();
    const payload = next === "" ? { budget: null } : { budget: next };
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert(await parseError(res));
      setBudgetDraft(project.budget ?? "");
      return;
    }
    await onRefreshProjects();
  }

  async function completeTask(taskId: string) {
    const prev = tasks;
    setTasks((t) =>
      t.map((x) => (x.id === taskId ? { ...x, status: "done" } : x))
    );
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    if (!res.ok) {
      setTasks(prev);
      alert(await parseError(res));
    }
  }

  const hoursStr =
    minutesTotal <= 0 ? "0h logged" : `${(minutesTotal / 60).toFixed(1)}h logged`;
  const stateText = project.current_state?.trim() ?? "";

  return (
    <div style={{ ...card, fontSize: 16, lineHeight: 1.7 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, flex: "1 1 200px" }}>
          {project.name}
        </div>
        <div ref={statusMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setStatusMenuOpen((o) => !o)}
            style={{
              minHeight: 44,
              padding: "8px 14px",
              borderRadius: 999,
              border: "none",
              background: meta.color,
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {meta.label}
          </button>
          {statusMenuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                zIndex: 30,
                background: "#fff",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                minWidth: 160,
                padding: 6,
              }}
            >
              {STATUS_V2_ORDER.map((v) => {
                const m = STATUS_V2_META[v];
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void patchStatusV2(v)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      minHeight: 44,
                      padding: "10px 12px",
                      border: "none",
                      background:
                        v === effectiveStatus ? "#f0f0ec" : "transparent",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 15,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: m.color,
                        marginRight: 8,
                        verticalAlign: "middle",
                      }}
                    />
                    {m.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontWeight: 600, marginRight: 8 }}>Budget:</span>
          {budgetEditing ? (
            <input
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={() => void saveBudget()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              autoFocus
              aria-label="Budget"
              style={{
                minHeight: 44,
                padding: "8px 10px",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                width: "100%",
                maxWidth: 360,
                fontSize: 16,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBudgetEditing(true)}
              style={{
                minHeight: 44,
                padding: "6px 0",
                border: "none",
                background: "transparent",
                color: project.budget ? TEXT : MUTED,
                fontSize: 16,
                textAlign: "left",
                cursor: "pointer",
                fontStyle: project.budget ? "normal" : "italic",
              }}
            >
              {project.budget?.trim() ? project.budget : "No budget set"}
            </button>
          )}
        </div>
        <div style={{ color: MUTED }}>{hoursStr}</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Current state</div>
        {stateText ? (
          <>
            <div
              style={{
                whiteSpace: "pre-wrap",
                ...(stateExpanded
                  ? {}
                  : {
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical" as const,
                      overflow: "hidden",
                    }),
              }}
            >
              {stateText}
            </div>
            <button
              type="button"
              onClick={() => setStateExpanded((e) => !e)}
              style={{
                marginTop: 8,
                minHeight: 44,
                padding: "8px 0",
                border: "none",
                background: "transparent",
                color: ACCENT,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 15,
              }}
            >
              {stateExpanded ? "Show less" : "Show more"}
            </button>
          </>
        ) : (
          <p style={{ margin: 0, color: MUTED, fontStyle: "italic" }}>
            No state yet
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTasksOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            minHeight: 48,
            padding: "10px 0",
            border: "none",
            borderBottom: `1px solid ${BORDER}`,
            background: "transparent",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span>Tasks ({openTasks.length} open)</span>
          <span style={{ color: MUTED }}>{tasksOpen ? "−" : "+"}</span>
        </button>
        {tasksOpen ? (
          <div style={{ paddingTop: 12 }}>
            {openTasks.length === 0 ? (
              <p style={{ margin: "0 0 8px", color: MUTED }}>No open tasks.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {openTasks.map((t) => (
                  <li key={t.id} style={{ marginBottom: 10 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        cursor: "pointer",
                        minHeight: 44,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => void completeTask(t.id)}
                        style={{
                          width: 22,
                          height: 22,
                          marginTop: 4,
                          flexShrink: 0,
                        }}
                        aria-label={`Mark done: ${t.title}`}
                      />
                      <span style={{ paddingTop: 2 }}>{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {doneTasks.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowDone((s) => !s)}
                  style={{
                    minHeight: 44,
                    marginTop: 8,
                    padding: "8px 0",
                    border: "none",
                    background: "transparent",
                    color: ACCENT,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 15,
                  }}
                >
                  {showDone ? "Hide done" : `Show ${doneTasks.length} done`}
                </button>
                {showDone ? (
                  <ul
                    style={{
                      listStyle: "none",
                      margin: "8px 0 0",
                      padding: 0,
                      opacity: 0.65,
                    }}
                  >
                    {doneTasks.map((t) => (
                      <li
                        key={t.id}
                        style={{
                          marginBottom: 8,
                          textDecoration: "line-through",
                          paddingLeft: 34,
                        }}
                      >
                        {t.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setLogsOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            minHeight: 48,
            padding: "10px 0",
            border: "none",
            borderBottom: `1px solid ${BORDER}`,
            background: "transparent",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span>Recent logs</span>
          <span style={{ color: MUTED }}>{logsOpen ? "−" : "+"}</span>
        </button>
        {logsOpen ? (
          <div style={{ paddingTop: 12 }}>
            {projLogs.length === 0 ? (
              <p style={{ margin: 0, color: MUTED }}>No logs yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {projLogs.map((log) => (
                  <div key={log.id}>
                    <div
                      style={{
                        fontSize: 13,
                        color: MUTED,
                        marginBottom: 4,
                      }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 15,
                      }}
                    >
                      {firstTwoLines(log.content)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => void onArchive()}
        style={{
          minHeight: 48,
          padding: "12px 18px",
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          background: "#fff",
          fontSize: 16,
          cursor: "pointer",
        }}
      >
        Archive project
      </button>
    </div>
  );
}

export default function MemoryMachineApp() {
  const [token, setToken] = useState<string | null>(null);
  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "log" | "projects" | "timesheet" | "context" | "help"
  >("log");

  const [projects, setProjects] = useState<Project[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [timesheet, setTimesheet] = useState<TimesheetRow[]>([]);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [stableContent, setStableContent] = useState("");
  const [stableSavedAt, setStableSavedAt] = useState<string | null>(null);

  const [logText, setLogText] = useState("");
  const [logProjectId, setLogProjectId] = useState("");
  const [logBusy, setLogBusy] = useState(false);

  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  const [tsProject, setTsProject] = useState("");
  const [tsDuration, setTsDuration] = useState("");
  const [tsNotes, setTsNotes] = useState("");
  const [tsBusy, setTsBusy] = useState(false);

  const [initMsg, setInitMsg] = useState<string | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null);

  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setToken(sessionStorage.getItem("mm_token"));
  }, []);

  const authed = Boolean(token);

  const refreshProjects = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/projects", { headers: authHeaders(token) });
    if (!res.ok) return;
    setProjects(await res.json());
  }, [token]);

  const refreshLogs = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/logs", { headers: authHeaders(token) });
    if (!res.ok) return;
    setLogs(await res.json());
  }, [token]);

  const refreshTimesheet = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/timesheet", { headers: authHeaders(token) });
    if (!res.ok) return;
    setTimesheet(await res.json());
  }, [token]);

  const refreshArchives = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/archive", { headers: authHeaders(token) });
    if (!res.ok) return;
    setArchives(await res.json());
  }, [token]);

  const refreshStable = useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/stable", { headers: authHeaders(token) });
    if (!res.ok) return;
    const row = await res.json();
    setStableContent(row.content ?? "");
    setStableSavedAt(row.updated_at ?? null);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    refreshProjects();
    refreshLogs();
    refreshTimesheet();
    refreshArchives();
    refreshStable();
  }, [token, refreshProjects, refreshLogs, refreshTimesheet, refreshArchives, refreshStable]);

  useEffect(() => {
    if (tab === "projects" && token) {
      void refreshTimesheet();
    }
  }, [tab, token, refreshTimesheet]);

  async function submitGate(e: React.FormEvent) {
    e.preventDefault();
    setGateError(null);
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: gatePassword }),
    });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem("mm_authenticated", "1");
      sessionStorage.setItem("mm_token", gatePassword);
      setToken(gatePassword);
      setGatePassword("");
    } else {
      setGateError("Incorrect password.");
    }
  }

  function signOut() {
    sessionStorage.removeItem("mm_token");
    sessionStorage.removeItem("mm_authenticated");
    setToken(null);
  }

  async function submitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !logText.trim()) return;
    setLogBusy(true);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { ...authHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({
          content: logText.trim(),
          project_id: logProjectId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(
          typeof data.error === "string" ? data.error : res.statusText || "Request failed"
        );
        return;
      }
      if (data.claude_error) {
        alert(`Log saved. Claude could not update project state: ${data.claude_error}`);
      }
      setLogText("");
      refreshLogs();
      refreshProjects();
    } finally {
      setLogBusy(false);
    }
  }

  async function deleteLog(id: string) {
    if (!token) return;
    if (!confirm("Delete this log entry?")) return;
    const res = await fetch(`/api/logs/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    refreshLogs();
  }

  function toggleLogExpand(id: string) {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects]
  );

  const logsByDay = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    for (const row of logs) {
      const d = new Date(row.created_at);
      const key = d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return map;
  }, [logs]);

  const sortedLogDays = useMemo(() => {
    return Array.from(logsByDay.entries()).sort((a, b) => {
      const ta = Math.max(...a[1].map((r) => new Date(r.created_at).getTime()));
      const tb = Math.max(...b[1].map((r) => new Date(r.created_at).getTime()));
      return tb - ta;
    });
  }, [logsByDay]);

  const projectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newProjectName.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({
        name: newProjectName.trim(),
        description: newProjectDesc.trim() || undefined,
      }),
    });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    setNewProjectName("");
    setNewProjectDesc("");
    refreshProjects();
  }

  async function archiveProject(id: string) {
    if (!token) return;
    if (!confirm("Archive this project?")) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    refreshProjects();
  }

  const timesheetTotals = useMemo(() => {
    const byProject = new Map<
      string,
      { name: string; weekMin: number; allMin: number }
    >();
    for (const row of timesheet) {
      const name = row.project_name ?? row.project_id;
      if (!byProject.has(row.project_id)) {
        byProject.set(row.project_id, { name, weekMin: 0, allMin: 0 });
      }
      const e = byProject.get(row.project_id)!;
      e.allMin += row.duration_minutes;
      if (isThisWeek(row.logged_at)) e.weekMin += row.duration_minutes;
    }
    return Array.from(byProject.entries()).map(([id, v]) => ({
      id,
      ...v,
    }));
  }, [timesheet]);

  const timesheetByProject = useMemo(() => {
    const m = new Map<string, TimesheetRow[]>();
    for (const row of timesheet) {
      if (!m.has(row.project_id)) m.set(row.project_id, []);
      m.get(row.project_id)!.push(row);
    }
    return m;
  }, [timesheet]);

  const minutesByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of timesheet) {
      m.set(row.project_id, (m.get(row.project_id) ?? 0) + row.duration_minutes);
    }
    return m;
  }, [timesheet]);

  async function submitTimesheet(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !tsProject) return;
    setTsBusy(true);
    try {
      const res = await fetch("/api/timesheet", {
        method: "POST",
        headers: { ...authHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({
          project_id: tsProject,
          duration: tsDuration,
          notes: tsNotes || undefined,
        }),
      });
      if (!res.ok) {
        alert(await parseError(res));
        return;
      }
      setTsDuration("");
      setTsNotes("");
      refreshTimesheet();
    } finally {
      setTsBusy(false);
    }
  }

  function copyTimesheetMd() {
    const lines = [
      "| Project | Date | Minutes | Hours | Notes |",
      "| --- | --- | ---: | ---: | --- |",
    ];
    for (const row of timesheet) {
      const name = row.project_name ?? row.project_id;
      const d = new Date(row.logged_at).toLocaleString();
      const h = (row.duration_minutes / 60).toFixed(2);
      const notes = (row.notes ?? "").replace(/\|/g, "\\|");
      lines.push(
        `| ${name} | ${d} | ${row.duration_minutes} | ${h} | ${notes} |`
      );
    }
    void navigator.clipboard.writeText(lines.join("\n"));
    alert("Timesheet copied as markdown table.");
  }

  async function saveStable() {
    if (!token) return;
    const res = await fetch("/api/stable", {
      method: "POST",
      headers: { ...authHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ content: stableContent }),
    });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    const row = await res.json();
    setStableSavedAt(row.updated_at ?? null);
    alert("Saved.");
  }

  async function copyExport() {
    if (!token) return;
    const res = await fetch("/api/export", { headers: authHeaders(token) });
    if (!res.ok) {
      alert(await parseError(res));
      return;
    }
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    alert("Full export copied to clipboard.");
  }

  async function runInit() {
    if (!token) return;
    setInitMsg(null);
    const res = await fetch("/api/init", {
      method: "POST",
      headers: authHeaders(token),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInitMsg(data.error || "Init failed");
      return;
    }
    setInitMsg(data.message || "Database ready.");
    refreshProjects();
    refreshLogs();
    refreshStable();
  }

  async function runArchive() {
    if (!token) return;
    if (
      !confirm(
        "Archive this week’s logs into weekly_archive and clear the logs table?"
      )
    ) {
      return;
    }
    setArchiveBusy(true);
    try {
      const res = await fetch("/api/archive", {
        method: "POST",
        headers: authHeaders(token),
      });
      if (!res.ok) {
        alert(await parseError(res));
        return;
      }
      refreshLogs();
      refreshArchives();
    } finally {
      setArchiveBusy(false);
    }
  }

  const tabBtn = (id: typeof tab): CSSProperties => ({
    minHeight: 48,
    minWidth: 48,
    padding: "12px 18px",
    border: "none",
    borderRadius: 8,
    background: tab === id ? ACCENT : "transparent",
    color: tab === id ? "#fff" : TEXT,
    fontWeight: 600,
    flexShrink: 0,
  });

  if (!authed) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: BG,
        }}
      >
        <form
          onSubmit={submitGate}
          style={{
            ...card,
            width: "100%",
            maxWidth: 400,
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: "1.35rem" }}>
            Memory Machine v3
          </h1>
          <p style={{ margin: "0 0 20px", color: MUTED }}>
            Enter the password to continue.
          </p>
          <label
            htmlFor="mm-pw"
            style={{ display: "block", marginBottom: 8, fontWeight: 600 }}
          >
            Password
          </label>
          <input
            id="mm-pw"
            type="password"
            value={gatePassword}
            onChange={(e) => setGatePassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "14px 12px",
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              marginBottom: 16,
            }}
          />
          {gateError ? (
            <p style={{ color: "#b00020", margin: "0 0 12px" }}>{gateError}</p>
          ) : null}
          <button
            type="submit"
            style={{
              width: "100%",
              minHeight: 48,
              background: ACCENT,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>
      <header
        style={{
          borderBottom: `1px solid ${BORDER}`,
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>
            Memory Machine v3
          </div>
          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
            }}
          >
            <button type="button" style={tabBtn("log")} onClick={() => setTab("log")}>
              Log
            </button>
            <button
              type="button"
              style={tabBtn("projects")}
              onClick={() => setTab("projects")}
            >
              Projects
            </button>
            <button
              type="button"
              style={tabBtn("timesheet")}
              onClick={() => setTab("timesheet")}
            >
              Timesheet
            </button>
            <button
              type="button"
              style={tabBtn("context")}
              onClick={() => setTab("context")}
            >
              Context
            </button>
            <button type="button" style={tabBtn("help")} onClick={() => setTab("help")}>
              Help
            </button>
            <button
              type="button"
              onClick={signOut}
              style={{
                minHeight: 48,
                padding: "12px 14px",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                background: "#fff",
                color: MUTED,
              }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
        {tab === "log" && (
          <section>
            <form onSubmit={submitLog} style={{ ...card, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: "1.2rem" }}>New log</h2>
              <label htmlFor="log-body" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                Entry
              </label>
              <textarea
                id="log-body"
                value={logText}
                onChange={(e) => setLogText(e.target.value)}
                rows={8}
                placeholder="Paste or type a session summary…"
                style={{
                  width: "100%",
                  padding: 12,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                  resize: "vertical",
                  minHeight: 160,
                }}
              />
              <label htmlFor="log-proj" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                Project (optional — enables state update via Claude)
              </label>
              <select
                id="log-proj"
                value={logProjectId}
                onChange={(e) => setLogProjectId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 16,
                  minHeight: 48,
                }}
              >
                <option value="">No project</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={logBusy}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {logBusy ? "Saving…" : "Submit log"}
              </button>
            </form>

            <h2 style={{ fontSize: "1.15rem", margin: "0 0 12px" }}>Recent logs</h2>
            {sortedLogDays.map(([day, rows]) => (
              <div key={day} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 10,
                    color: MUTED,
                    fontSize: "0.95rem",
                  }}
                >
                  {day}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {rows.map((row) => {
                    const expanded = expandedLogIds.has(row.id);
                    return (
                      <div key={row.id} style={card}>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <span style={{ color: MUTED, fontSize: "0.9rem" }}>
                            {new Date(row.created_at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {row.project_id ? (
                              <span
                                style={{
                                  marginLeft: 8,
                                  padding: "2px 8px",
                                  background: "#eef5f1",
                                  color: ACCENT,
                                  borderRadius: 6,
                                  fontWeight: 600,
                                }}
                              >
                                {projectNameById.get(row.project_id) ?? row.project_id}
                              </span>
                            ) : null}
                          </span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => toggleLogExpand(row.id)}
                              style={{
                                minHeight: 44,
                                padding: "8px 12px",
                                border: `1px solid ${BORDER}`,
                                borderRadius: 8,
                                background: "#fff",
                              }}
                            >
                              {expanded ? "Collapse" : "Expand"}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteLog(row.id)}
                              style={{
                                minHeight: 44,
                                padding: "8px 12px",
                                border: `1px solid #e8c4c4`,
                                borderRadius: 8,
                                background: "#fff8f8",
                                color: "#8b1a1a",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            ...(expanded
                              ? {}
                              : {
                                  display: "-webkit-box",
                                  WebkitLineClamp: 3,
                                  WebkitBoxOrient: "vertical" as const,
                                  overflow: "hidden",
                                }),
                          }}
                        >
                          {row.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {logs.length === 0 ? (
              <p style={{ color: MUTED }}>No logs yet.</p>
            ) : null}
          </section>
        )}

        {tab === "projects" && (
          <section style={{ fontSize: 16, lineHeight: 1.7, color: TEXT }}>
            <form onSubmit={createProject} style={{ ...card, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: "1.2rem" }}>Add project</h2>
              <input
                placeholder="Name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 10,
                  minHeight: 48,
                  fontSize: 16,
                }}
              />
              <textarea
                placeholder="Description (optional)"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: 12,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                  fontSize: 16,
                }}
              />
              <button
                type="submit"
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                Create project
              </button>
            </form>

            <h2 style={{ fontSize: "1.15rem", margin: "0 0 16px" }}>Active projects</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {activeProjects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  token={token!}
                  minutesTotal={minutesByProject.get(p.id) ?? 0}
                  onRefreshProjects={refreshProjects}
                  onArchive={() => archiveProject(p.id)}
                />
              ))}
            </div>
            {activeProjects.length === 0 ? (
              <p style={{ color: MUTED }}>No active projects. Run database init or add one.</p>
            ) : null}
          </section>
        )}

        {tab === "timesheet" && (
          <section>
            <form onSubmit={submitTimesheet} style={{ ...card, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: "1.2rem" }}>Log time</h2>
              <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                Project
              </label>
              <select
                value={tsProject}
                onChange={(e) => setTsProject(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                  minHeight: 48,
                }}
              >
                <option value="" disabled>
                  Select project
                </option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <label htmlFor="ts-dur" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                Duration (e.g. 90m, 2h, 1.5 for 1.5 hours, or minutes as a number)
              </label>
              <input
                id="ts-dur"
                value={tsDuration}
                onChange={(e) => setTsDuration(e.target.value)}
                placeholder="2h"
                style={{
                  width: "100%",
                  padding: "14px 12px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                  minHeight: 48,
                }}
              />
              <label htmlFor="ts-notes" style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
                Notes (optional)
              </label>
              <textarea
                id="ts-notes"
                value={tsNotes}
                onChange={(e) => setTsNotes(e.target.value)}
                rows={2}
                style={{
                  width: "100%",
                  padding: 12,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              />
              <button
                type="submit"
                disabled={tsBusy}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {tsBusy ? "Saving…" : "Log time"}
              </button>
            </form>

            <h2 style={{ fontSize: "1.15rem", margin: "0 0 12px" }}>Summary by project</h2>
            <div style={{ ...card, marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: `1px solid ${BORDER}` }}>
                    <th style={{ padding: "8px 4px" }}>Project</th>
                    <th style={{ padding: "8px 4px" }}>This week (h)</th>
                    <th style={{ padding: "8px 4px" }}>All time (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheetTotals.map((t) => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "10px 4px" }}>{t.name}</td>
                      <td style={{ padding: "10px 4px" }}>{(t.weekMin / 60).toFixed(1)}</td>
                      <td style={{ padding: "10px 4px" }}>{(t.allMin / 60).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {timesheetTotals.length === 0 ? (
                <p style={{ color: MUTED, margin: 0 }}>No entries yet.</p>
              ) : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              <button
                type="button"
                onClick={copyTimesheetMd}
                style={{
                  minHeight: 48,
                  padding: "12px 18px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Copy timesheet (markdown)
              </button>
            </div>

            <h2 style={{ fontSize: "1.15rem", margin: "0 0 12px" }}>Recent entries by project</h2>
            {activeProjects.map((p) => {
              const entries = timesheetByProject.get(p.id) ?? [];
              if (entries.length === 0) return null;
              return (
                <div key={p.id} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{p.name}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {entries.slice(0, 30).map((row) => (
                      <div
                        key={row.id}
                        style={{
                          ...card,
                          padding: 12,
                        }}
                      >
                        <div style={{ color: MUTED, fontSize: "0.9rem" }}>
                          {new Date(row.logged_at).toLocaleString()} ·{" "}
                          {row.duration_minutes} min (
                          {(row.duration_minutes / 60).toFixed(2)} h)
                        </div>
                        {row.notes ? (
                          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{row.notes}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {tab === "context" && (
          <section>
            <div style={{ ...card, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem" }}>Stable context</h2>
              {stableSavedAt ? (
                <p style={{ margin: "0 0 12px", color: MUTED, fontSize: "0.9rem" }}>
                  Last saved {new Date(stableSavedAt).toLocaleString()}
                </p>
              ) : null}
              <textarea
                value={stableContent}
                onChange={(e) => setStableContent(e.target.value)}
                rows={16}
                style={{
                  width: "100%",
                  padding: 12,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  marginBottom: 12,
                  minHeight: 280,
                  resize: "vertical",
                }}
              />
              <button
                type="button"
                onClick={saveStable}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  marginRight: 10,
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={copyExport}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  background: "#fff",
                  fontWeight: 600,
                }}
              >
                Copy full export
              </button>
            </div>

            <div style={{ ...card, marginBottom: 24 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: "1.2rem" }}>Weekly archive</h2>
              <p style={{ margin: "0 0 12px", color: MUTED }}>
                Saves all current logs into an archive row and clears the logs table.
              </p>
              <button
                type="button"
                disabled={archiveBusy}
                onClick={runArchive}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: ACCENT,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {archiveBusy ? "Archiving…" : "Archive & clear logs"}
              </button>
            </div>

            <h2 style={{ fontSize: "1.15rem", margin: "0 0 12px" }}>Previous archives</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {archives.map((a) => {
                const open = expandedArchiveId === a.id;
                return (
                  <div key={a.id} style={card}>
                    <button
                      type="button"
                      onClick={() => setExpandedArchiveId(open ? null : a.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{a.week_label}</div>
                      <div style={{ color: MUTED, fontSize: "0.9rem" }}>
                        Archived {new Date(a.archived_at).toLocaleString()}
                      </div>
                    </button>
                    {open ? (
                      <div style={{ marginTop: 12 }}>
                        {a.synthesis ? (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Synthesis</div>
                            <div style={{ whiteSpace: "pre-wrap" }}>{a.synthesis}</div>
                          </div>
                        ) : null}
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Logs snapshot</div>
                        <pre
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: "0.85rem",
                            background: "#fafaf8",
                            padding: 12,
                            borderRadius: 8,
                            border: `1px solid ${BORDER}`,
                            maxHeight: 360,
                            overflow: "auto",
                          }}
                        >
                          {a.logs_snapshot}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {archives.length === 0 ? (
              <p style={{ color: MUTED }}>No archives yet.</p>
            ) : null}
          </section>
        )}

        {tab === "help" && (
          <section style={card}>
            <h2 style={{ margin: "0 0 16px", fontSize: "1.2rem" }}>
              How to use Memory Machine v3
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, color: TEXT }}>
              <p style={{ margin: 0 }}>
                <strong>After a Claude session:</strong> summarise what mattered, open the{" "}
                <strong>Log</strong> tab, paste the summary, pick the project if you want the live
                project state updated automatically, then submit.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Weekly rhythm:</strong> open <strong>Context</strong>, use{" "}
                <strong>Copy full export</strong> and paste that into Claude. Refine your long-lived
                stable context there, paste the result back into the textarea, save, then use{" "}
                <strong>Archive & clear logs</strong> when you are ready to roll the week forward.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Timesheet:</strong> after each working session, log project plus duration
                (for example <code>2h</code> or <code>90m</code>). Notes are optional.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Claude posting logs directly:</strong> configure{" "}
                <code>MEMORY_MACHINE_API_KEY</code> in Vercel. Send{" "}
                <code>Authorization: Bearer &lt;your API key&gt;</code> or the header{" "}
                <code>x-memory-machine-api-key: &lt;your API key&gt;</code> on{" "}
                <code>POST /api/logs</code> with JSON body{" "}
                <code>{`{ "content": "...", "project_id": "optional-uuid" }`}</code>
                . The same key works for other write endpoints if you automate them; the browser uses
                your password after unlock.
              </p>
            </div>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
              <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem" }}>Database setup</h3>
              <p style={{ margin: "0 0 12px", color: MUTED }}>
                After env vars are set, run init once (creates tables and seed projects).
              </p>
              <button
                type="button"
                onClick={runInit}
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  background: "#fff",
                  fontWeight: 600,
                }}
              >
                Run /api/init
              </button>
              {initMsg ? (
                <p style={{ marginTop: 12, marginBottom: 0, color: MUTED }}>{initMsg}</p>
              ) : null}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
