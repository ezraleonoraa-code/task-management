
"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { supabase } from "@/lib/supabase";

type Priority = "Tinggi" | "Sedang" | "Rendah";

type Task = {
  id: number;
  judul: string;
  deskripsi: string;
  created_at: string;
  selesai: boolean;
  deadline: string | null;
  urutan: number;
  prioritas: Priority;
};

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember",
];

const WEEK_DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const PRIORITY_LABEL: Record<Priority, string> = {
  Tinggi: "Mendesak",
  Sedang: "Normal",
  Rendah: "Tidak Mendesak",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  Tinggi: "priority-tinggi",
  Sedang: "priority-sedang",
  Rendah: "priority-rendah",
};

function getPriority(task: Task): Priority {
  if (
    task.prioritas === "Tinggi" ||
    task.prioritas === "Rendah"
  ) {
    return task.prioritas;
  }

  return "Sedang";
}

function TaskPriority({ task }: { task: Task }) {
  const priority = getPriority(task);

  return (
    <span className={`priority-badge ${PRIORITY_CLASS[priority]}`}>
      <span className="priority-indicator" />
      {priority} — {PRIORITY_LABEL[priority]}
    </span>
  );
}

const TaskPriorityMemo = memo(TaskPriority);

function TaskStatus({ completed }: { completed: boolean }) {
  return (
    <span className={completed ? "status-done" : "status-pending"}>
      {completed ? "Completed" : "In Progress"}
    </span>
  );
}

const TaskStatusMemo = memo(TaskStatus);

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [deadline, setDeadline] = useState("");
  const [prioritas, setPrioritas] = useState<Priority>("Sedang");

  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const notifiedTasks = useRef<Set<number>>(new Set());

  // ==========================================
  // DATA KALENDER DIHITUNG SEKALI
  // ==========================================

  const calendarInfo = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    return {
      year,
      month,
      firstDay: new Date(year, month, 1).getDay(),
      daysInMonth: new Date(year, month + 1, 0).getDate(),
      monthName: MONTH_NAMES[month],
    };
  }, [calendarDate]);

  const deadlineByDay = useMemo(() => {
    const result = new Map<number, Task[]>();

    tasks.forEach((task) => {
      if (!task.deadline) return;

      const date = new Date(task.deadline);

      if (
        date.getFullYear() !== calendarInfo.year ||
        date.getMonth() !== calendarInfo.month
      ) {
        return;
      }

      const day = date.getDate();
      const current = result.get(day) ?? [];

      current.push(task);
      result.set(day, current);
    });

    return result;
  }, [tasks, calendarInfo]);

  const monthlyTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!task.deadline) return false;

      const date = new Date(task.deadline);

      return (
        date.getFullYear() === calendarInfo.year &&
        date.getMonth() === calendarInfo.month
      );
    });
  }, [tasks, calendarInfo]);

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.selesai).length,
    [tasks]
  );

  const pendingTasks = tasks.length - completedTasks;

  const priorityCounts = useMemo(
    () => ({
      tinggi: tasks.filter(
        (task) => !task.selesai && getPriority(task) === "Tinggi"
      ).length,
      sedang: tasks.filter(
        (task) => !task.selesai && getPriority(task) === "Sedang"
      ).length,
      rendah: tasks.filter(
        (task) => !task.selesai && getPriority(task) === "Rendah"
      ).length,
    }),
    [tasks]
  );

  // ==========================================
  // LOAD TASKS
  // ==========================================

  const loadTasks = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("project1")
      .select("*")
      .order("urutan", { ascending: true })
      .order("id", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setTasks((data ?? []) as Task[]);
      setError("");
    }

    setLoading(false);
  }, []);

  // ==========================================
  // AUTHENTICATION
  // ==========================================

  useEffect(() => {
    let mounted = true;

    async function checkLogin() {
      const { data, error: authError } =
        await supabase.auth.getSession();

      if (!mounted) return;

      if (authError || !data.session) {
        window.location.replace("/login");
        return;
      }

      setSessionActive(true);
      await loadTasks();
    }

    checkLogin();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSessionActive(false);
        window.location.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadTasks]);

  // ==========================================
  // AUTO LOGOUT 30 MENIT
  // Menghindari event mousemove yang terlalu sering
  // ==========================================

  useEffect(() => {
    if (!sessionActive) return;

    const INACTIVITY_LIMIT = 30 * 60 * 1000;
    let timeout: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeout);

      timeout = setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.replace("/login");
      }, INACTIVITY_LIMIT);
    };

    const events = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
    ];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      clearTimeout(timeout);

      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [sessionActive]);

  // ==========================================
  // NOTIFIKASI DEADLINE
  // ==========================================

  useEffect(() => {
    if (!sessionActive) return;

    function checkDeadlines() {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;

      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      tasks.forEach((task) => {
        if (!task.deadline || task.selesai) return;
        if (notifiedTasks.current.has(task.id)) return;

        const remaining =
          new Date(task.deadline).getTime() - now;

        if (remaining > 0 && remaining <= oneDay) {
          new Notification("Pengingat TaskFlow!", {
            body: `Task "${task.judul}" memiliki deadline dalam 24 jam.`,
          });

          notifiedTasks.current.add(task.id);
        }
      });
    }

    checkDeadlines();

    const interval = window.setInterval(checkDeadlines, 60000);

    return () => window.clearInterval(interval);
  }, [tasks, sessionActive]);

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotificationStatus(
        "Browser tidak mendukung notifikasi."
      );
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setNotificationStatus(
        "Notifikasi berhasil diaktifkan!"
      );

      new Notification("TaskFlow", {
        body: "Pengingat deadline sudah aktif.",
      });
    } else {
      setNotificationStatus(
        "Izin notifikasi belum diberikan."
      );
    }
  }, []);

  // ==========================================
  // RESET FORM
  // ==========================================

  const resetForm = useCallback(() => {
    setEditId(null);
    setJudul("");
    setDeskripsi("");
    setDeadline("");
    setPrioritas("Sedang");
  }, []);

  // ==========================================
  // CREATE & UPDATE TASK
  // ==========================================

  async function saveTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (saving) return;

    setError("");
    setSaving(true);

    const values = {
      judul: judul.trim(),
      deskripsi: deskripsi.trim(),
      deadline: deadline
        ? new Date(deadline).toISOString()
        : null,
      prioritas,
    };

    if (!values.judul) {
      setError("Judul task wajib diisi.");
      setSaving(false);
      return;
    }

    let result;

    if (editId === null) {
      result = await supabase
        .from("project1")
        .insert([{ ...values, selesai: false }]);
    } else {
      const taskToEdit = tasks.find(
        (task) => task.id === editId
      );

      if (!taskToEdit || taskToEdit.selesai) {
        setError(
          "Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit."
        );
        resetForm();
        setSaving(false);
        return;
      }

      result = await supabase
        .from("project1")
        .update(values)
        .eq("id", editId)
        .eq("selesai", false);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    resetForm();
    await loadTasks();
    setSaving(false);
  }

  // ==========================================
  // DELETE TASK
  // ==========================================

  async function deleteTask(id: number) {
    if (!window.confirm("Yakin ingin menghapus task ini?")) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("project1")
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await loadTasks();
    }
  }

  // ==========================================
  // COMPLETE & UNDO
  // ==========================================

  async function toggleTask(task: Task) {
    const { error: updateError } = await supabase
      .from("project1")
      .update({ selesai: !task.selesai })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (!task.selesai && editId === task.id) {
      resetForm();
    }

    await loadTasks();
  }

  // ==========================================
  // EDIT TASK
  // ==========================================

  function editTask(task: Task) {
    if (task.selesai) {
      setError(
        "Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit."
      );
      return;
    }

    setError("");
    setEditId(task.id);
    setJudul(task.judul);
    setDeskripsi(task.deskripsi ?? "");
    setDeadline(
      task.deadline ? task.deadline.slice(0, 10) : ""
    );
    setPrioritas(getPriority(task));
    setActivePage("Tasks");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================
  // DRAG AND DROP
  // ==========================================

  async function handleDrop(targetId: number) {
    if (
      draggedTaskId === null ||
      draggedTaskId === targetId ||
      savingOrder
    ) {
      return;
    }

    const orderedTasks = [...tasks].sort(
      (a, b) => a.urutan - b.urutan
    );

    const fromIndex = orderedTasks.findIndex(
      (task) => task.id === draggedTaskId
    );

    const toIndex = orderedTasks.findIndex(
      (task) => task.id === targetId
    );

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedTaskId(null);
      return;
    }

    const [movedTask] = orderedTasks.splice(fromIndex, 1);
    orderedTasks.splice(toIndex, 0, movedTask);

    const updatedTasks = orderedTasks.map((task, index) => ({
      ...task,
      urutan: index + 1,
    }));

    setTasks(updatedTasks);
    setDraggedTaskId(null);
    setSavingOrder(true);
    setError("");

    try {
      for (const task of updatedTasks) {
        const { error: updateError } = await supabase
          .from("project1")
          .update({ urutan: task.urutan })
          .eq("id", task.id);

        if (updateError) {
          throw updateError;
        }
      }

      await loadTasks();
    } catch (err) {
      setError(
        "Gagal menyimpan urutan task. " +
        (err instanceof Error ? err.message : "")
      );

      await loadTasks();
    } finally {
      setSavingOrder(false);
    }
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  // ==========================================
  // CALENDAR NAVIGATION
  // ==========================================

  function changeMonth(amount: number) {
    setCalendarDate(
      new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + amount,
        1
      )
    );
  }

  // ==========================================
  // CALENDAR COMPONENT
  // ==========================================

  const renderCalendar = () => (
    <div className="calendar-card">
      <div className="calendar-header">
        <button
          type="button"
          aria-label="Bulan sebelumnya"
          onClick={() => changeMonth(-1)}
        >
          ←
        </button>

        <h2>
          {calendarInfo.monthName} {calendarInfo.year}
        </h2>

        <button
          type="button"
          aria-label="Bulan berikutnya"
          onClick={() => changeMonth(1)}
        >
          →
        </button>
      </div>

      <div className="calendar-legend">
        <span>
          <i className="legend-high" /> Tinggi
        </span>
        <span>
          <i className="legend-medium" /> Sedang
        </span>
        <span>
          <i className="legend-low" /> Rendah
        </span>
        <span>
          <i className="legend-done" /> Selesai
        </span>
      </div>

      <div className="calendar-grid">
        {WEEK_DAYS.map((day) => (
          <strong key={day}>{day}</strong>
        ))}

        {Array.from(
          { length: calendarInfo.firstDay },
          (_, index) => (
            <div
              key={`empty-${index}`}
              className="calendar-empty"
            />
          )
        )}

        {Array.from(
          { length: calendarInfo.daysInMonth },
          (_, index) => {
            const day = index + 1;
            const deadlineTasks = deadlineByDay.get(day) ?? [];

            const allCompleted =
              deadlineTasks.length > 0 &&
              deadlineTasks.every((task) => task.selesai);

            return (
              <div
                key={day}
                className={`calendar-day ${
                  deadlineTasks.length
                    ? allCompleted
                      ? "deadline-completed"
                      : "has-deadline"
                    : ""
                }`}
              >
                <strong className="calendar-number">
                  {day}
                </strong>

                <div className="calendar-task-names">
                  {deadlineTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`calendar-task-name ${
                        task.selesai
                          ? "task-name-completed"
                          : PRIORITY_CLASS[getPriority(task)]
                      }`}
                      title={task.judul}
                    >
                      {task.judul}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
        )}
      </div>

      <h3 className="upcoming-title">
        Deadline Bulan Ini
      </h3>

      {monthlyTasks.length === 0 ? (
        <p className="empty-state">
          Belum ada deadline bulan ini.
        </p>
      ) : (
        monthlyTasks.map((task) => (
          <div className="deadline-item" key={task.id}>
            <div className="deadline-info">
              <strong>{task.judul}</strong>
              <p>
                {new Date(task.deadline!).toLocaleDateString(
                  "id-ID"
                )}
              </p>
              <TaskPriorityMemo task={task} />
            </div>

            <TaskStatusMemo completed={task.selesai} />
          </div>
        ))
      )}
    </div>
  );

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✓</span>
          TaskFlow
        </div>

        <p className="sidebar-label">MENU UTAMA</p>

        <nav className="navigation">
          {[
            { name: "Dashboard", icon: "▦" },
            { name: "Tasks", icon: "☑" },
            { name: "Calendar", icon: "▣" },
          ].map((item) => (
            <button
              key={item.name}
              type="button"
              className={`nav-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="nav-item logout-link"
            onClick={handleLogout}
          >
            <span className="nav-icon">↪</span>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">TASK MANAGEMENT</p>
            <h1>{activePage}</h1>
            <p className="topbar-description">
              Welcome to your TaskFlow workspace.
            </p>
          </div>

          <button
            type="button"
            className="notification-button"
            onClick={enableNotifications}
          >
            Aktifkan Notifikasi
          </button>
        </header>

        {notificationStatus && (
          <p className="success-message">
            {notificationStatus}
          </p>
        )}

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}

        {/* DASHBOARD */}
        {activePage === "Dashboard" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Overview</h2>
                <p>Ringkasan aktivitas tugas kamu.</p>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-card stat-blue">
                <div className="stat-icon">▦</div>
                <p>Total Tasks</p>
                <strong>{tasks.length}</strong>
              </div>

              <div className="stat-card stat-green">
                <div className="stat-icon">✓</div>
                <p>Completed</p>
                <strong>{completedTasks}</strong>
              </div>

              <div className="stat-card stat-orange">
                <div className="stat-icon">◷</div>
                <p>In Progress</p>
                <strong>{pendingTasks}</strong>
              </div>
            </div>

            <div className="content-card">
              <div className="card-heading">
                <div>
                  <h2>Skala Prioritas</h2>
                  <p>Jumlah tugas berdasarkan tingkat kepentingan.</p>
                </div>
              </div>

              <div className="priority-overview">
                <div className="priority-overview-item">
                  <div className="priority-overview-heading">
                    <span>
                      <i className="priority-dot dot-tinggi" />
                      Tinggi — Mendesak
                    </span>
                    <strong>{priorityCounts.tinggi}</strong>
                  </div>
                  <div className="priority-track">
                    <div
                      className="priority-fill priority-fill-high"
                      style={{
                        width: `${
                          tasks.length
                            ? (priorityCounts.tinggi / tasks.length) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="priority-overview-item">
                  <div className="priority-overview-heading">
                    <span>
                      <i className="priority-dot dot-sedang" />
                      Sedang — Normal
                    </span>
                    <strong>{priorityCounts.sedang}</strong>
                  </div>
                  <div className="priority-track">
                    <div
                      className="priority-fill priority-fill-medium"
                      style={{
                        width: `${
                          tasks.length
                            ? (priorityCounts.sedang / tasks.length) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="priority-overview-item">
                  <div className="priority-overview-heading">
                    <span>
                      <i className="priority-dot dot-rendah" />
                      Rendah — Tidak Mendesak
                    </span>
                    <strong>{priorityCounts.rendah}</strong>
                  </div>
                  <div className="priority-track">
                    <div
                      className="priority-fill priority-fill-low"
                      style={{
                        width: `${
                          tasks.length
                            ? (priorityCounts.rendah / tasks.length) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="content-card">
              <div className="card-heading">
                <div>
                  <h2>Recent Tasks</h2>
                  <p>Lima tugas terbaru kamu.</p>
                </div>

                <button
                  type="button"
                  className="text-button"
                  onClick={() => setActivePage("Tasks")}
                >
                  Lihat semua
                </button>
              </div>

              {loading ? (
                <p className="empty-state">Loading...</p>
              ) : tasks.length === 0 ? (
                <p className="empty-state">
                  Belum ada task. Tambahkan task pertamamu!
                </p>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <div className="task-row" key={task.id}>
                    <div className="task-info">
                      <strong
                        className={
                          task.selesai ? "task-completed" : ""
                        }
                      >
                        {task.judul}
                      </strong>

                      <p>{task.deskripsi}</p>

                      <div className="task-meta">
                        <TaskPriorityMemo task={task} />
                        <TaskStatusMemo completed={task.selesai} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* TASKS */}
        {activePage === "Tasks" && (
          <>
            <div className="section-heading">
              <div>
                <h2>My Tasks</h2>
                <p>Kelola semua tugasmu di sini.</p>
              </div>
            </div>

            <form className="task-form" onSubmit={saveTask}>
              <div className="form-title">
                <div className="form-title-icon">＋</div>
                <div>
                  <h3>
                    {editId === null
                      ? "Add New Task"
                      : "Edit Task"}
                  </h3>
                  <p>
                    Isi detail tugas dan tentukan prioritasnya.
                  </p>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="judul">Task Title</label>
                <input
                  id="judul"
                  placeholder="Masukkan judul tugas..."
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="deskripsi">
                  Task Description
                </label>
                <textarea
                  id="deskripsi"
                  placeholder="Masukkan deskripsi tugas..."
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                />
              </div>

              <div className="form-two-columns">
                <div className="form-field">
                  <label htmlFor="prioritas">
                    Skala Prioritas
                  </label>

                  <select
                    id="prioritas"
                    value={prioritas}
                    onChange={(e) =>
                      setPrioritas(e.target.value as Priority)
                    }
                  >
                    <option value="Tinggi">
                      Tinggi — Mendesak
                    </option>
                    <option value="Sedang">
                      Sedang — Normal
                    </option>
                    <option value="Rendah">
                      Rendah — Tidak Mendesak
                    </option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="deadline">Deadline</label>
                  <input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) =>
                      setDeadline(e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="priority-guide">
                <div className="priority-guide-item">
                  <i className="priority-dot dot-tinggi" />
                  Tinggi
                  <small>Mendesak</small>
                </div>

                <div className="priority-guide-item">
                  <i className="priority-dot dot-sedang" />
                  Sedang
                  <small>Normal</small>
                </div>

                <div className="priority-guide-item">
                  <i className="priority-dot dot-rendah" />
                  Rendah
                  <small>Tidak mendesak</small>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Menyimpan..."
                    : editId === null
                      ? "Add Task"
                      : "Save Changes"}
                </button>

                {editId !== null && (
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="content-card">
              <div className="card-heading">
                <div>
                  <h2>All Tasks ({tasks.length})</h2>
                  <p>
                    Atur urutan tugas dengan drag-and-drop.
                  </p>
                </div>
              </div>

              {savingOrder && (
                <p className="saving-order">
                  Menyimpan urutan task...
                </p>
              )}

              {loading ? (
                <p className="empty-state">Loading...</p>
              ) : tasks.length === 0 ? (
                <p className="empty-state">
                  Belum ada task. Tambahkan task pertamamu!
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    className={`task-row ${
                      draggedTaskId === task.id ? "dragging" : ""
                    } ${task.selesai ? "completed-row" : ""}`}
                    key={task.id}
                    draggable={!savingOrder}
                    onDragStart={() =>
                      setDraggedTaskId(task.id)
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(task.id);
                    }}
                    onDragEnd={() =>
                      setDraggedTaskId(null)
                    }
                  >
                    <div className="drag-handle" aria-hidden="true">
                      ⠿
                    </div>

                    <div className="task-info">
                      <strong
                        className={
                          task.selesai ? "task-completed" : ""
                        }
                      >
                        {task.judul}
                      </strong>

                      <p>{task.deskripsi}</p>

                      <div className="task-meta">
                        <span className="deadline-label">
                          Deadline:{" "}
                          {task.deadline
                            ? new Date(
                                task.deadline
                              ).toLocaleDateString("id-ID")
                            : "Belum ditentukan"}
                        </span>

                        <TaskPriorityMemo task={task} />
                        <TaskStatusMemo completed={task.selesai} />
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className={
                          task.selesai
                            ? "undo-button"
                            : "complete-button"
                        }
                        draggable={false}
                        onClick={() => toggleTask(task)}
                      >
                        {task.selesai ? "Undo" : "Complete"}
                      </button>

                      {!task.selesai && (
                        <button
                          type="button"
                          className="edit-button"
                          draggable={false}
                          onClick={() => editTask(task)}
                        >
                          Edit
                        </button>
                      )}

                      <button
                        type="button"
                        className="delete-button"
                        draggable={false}
                        onClick={() => deleteTask(task.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* CALENDAR */}
        {activePage === "Calendar" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Calendar Deadline</h2>
                <p>
                  Lihat jadwal dan deadline semua task kamu.
                </p>
              </div>
            </div>

            {renderCalendar()}
          </>
        )}
      </main>
    </div>
  );
}

