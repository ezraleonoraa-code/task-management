"use client";

import {
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

const priorities: Priority[] = ["Tinggi", "Sedang", "Rendah"];

const priorityText: Record<Priority, string> = {
  Tinggi: "Mendesak",
  Sedang: "Normal",
  Rendah: "Tidak Mendesak",
};

const monthNames = [
  "Januari", "Februari", "Maret", "April",
  "Mei", "Juni", "Juli", "Agustus",
  "September", "Oktober", "November", "Desember",
];

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

  const notifiedTasks = useRef(new Set<number>());
  const mountedRef = useRef(true);

  const loadTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("project1")
      .select("*")
      .order("urutan", { ascending: true })
      .order("id", { ascending: false });

    if (!mountedRef.current) return;

    if (error) {
      setError(error.message);
    } else {
      setTasks((data ?? []) as Task[]);
      setError("");
    }

    setLoading(false);
  }, []);

  // Pemeriksaan sesi login
  useEffect(() => {
    mountedRef.current = true;

    async function checkLogin() {
      const { data, error } = await supabase.auth.getSession();

      if (!mountedRef.current) return;

      if (error || !data.session) {
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
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadTasks]);

  // Auto logout setelah 30 menit tidak aktif
  useEffect(() => {
    if (!sessionActive) return;

    const inactivityLimit = 30 * 60 * 1000;
    let timeout: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.replace("/login");
      }, inactivityLimit);
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"];

    events.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    resetTimer();

    return () => {
      clearTimeout(timeout);
      events.forEach((event) =>
        window.removeEventListener(event, resetTimer)
      );
    };
  }, [sessionActive]);

  // Pengingat deadline
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const checkDeadlines = () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      tasks.forEach((task) => {
        if (!task.deadline || task.selesai) return;
        if (notifiedTasks.current.has(task.id)) return;

        const remaining = new Date(task.deadline).getTime() - now;

        if (remaining > 0 && remaining <= oneDay) {
          new Notification("Pengingat TaskFlow!", {
            body: `Task "${task.judul}" memiliki deadline dalam 24 jam.`,
          });

          notifiedTasks.current.add(task.id);
        }
      });
    };

    checkDeadlines();
    const interval = window.setInterval(checkDeadlines, 60000);

    return () => window.clearInterval(interval);
  }, [tasks]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationStatus("Browser tidak mendukung notifikasi.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setNotificationStatus("Notifikasi berhasil diaktifkan!");
      new Notification("TaskFlow", {
        body: "Pengingat deadline sudah aktif.",
      });
    } else {
      setNotificationStatus("Izin notifikasi belum diberikan.");
    }
  }

  function resetForm() {
    setJudul("");
    setDeskripsi("");
    setDeadline("");
    setPrioritas("Sedang");
    setEditId(null);
  }

  // Tambah dan edit task
  async function saveTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    setError("");

    const cleanTitle = judul.trim();

    if (!cleanTitle) {
      setError("Judul task wajib diisi.");
      return;
    }

    setSaving(true);

    const values = {
      judul: cleanTitle,
      deskripsi: deskripsi.trim(),
      deadline: deadline ? new Date(`${deadline}T12:00:00`).toISOString() : null,
      prioritas,
    };

    let result;

    if (editId === null) {
      result = await supabase
        .from("project1")
        .insert([{ ...values, selesai: false }]);
    } else {
      const task = tasks.find((item) => item.id === editId);

      if (!task || task.selesai) {
        setError("Task sudah selesai. Tekan Undo terlebih dahulu.");
        setSaving(false);
        resetForm();
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

  async function deleteTask(id: number) {
    if (!window.confirm("Yakin ingin menghapus task ini?")) return;

    const { error } = await supabase
      .from("project1")
      .delete()
      .eq("id", id);

    if (error) setError(error.message);
    else await loadTasks();
  }

  async function toggleTask(task: Task) {
    const { error } = await supabase
      .from("project1")
      .update({ selesai: !task.selesai })
      .eq("id", task.id);

    if (error) {
      setError(error.message);
      return;
    }

    if (!task.selesai && editId === task.id) resetForm();

    await loadTasks();
  }

  function editTask(task: Task) {
    if (task.selesai) {
      setError("Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit.");
      return;
    }

    setError("");
    setEditId(task.id);
    setJudul(task.judul);
    setDeskripsi(task.deskripsi ?? "");
    setDeadline(
      task.deadline
        ? new Date(task.deadline).toLocaleDateString("en-CA")
        : ""
    );
    setPrioritas(task.prioritas ?? "Sedang");
    setActivePage("Tasks");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Drag and drop untuk mengurutkan task
  async function handleDrop(targetId: number) {
    if (
      draggedTaskId === null ||
      draggedTaskId === targetId ||
      savingOrder
    ) return;

    const ordered = [...tasks].sort(
      (a, b) => a.urutan - b.urutan
    );

    const from = ordered.findIndex((task) => task.id === draggedTaskId);
    const to = ordered.findIndex((task) => task.id === targetId);

    if (from < 0 || to < 0) {
      setDraggedTaskId(null);
      return;
    }

    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const updated = ordered.map((task, index) => ({
      ...task,
      urutan: index + 1,
    }));

    setTasks(updated);
    setDraggedTaskId(null);
    setSavingOrder(true);
    setError("");

    for (const task of updated) {
      const { error } = await supabase
        .from("project1")
        .update({ urutan: task.urutan })
        .eq("id", task.id);

      if (error) {
        setError("Gagal menyimpan urutan task: " + error.message);
        await loadTasks();
        setSavingOrder(false);
        return;
      }
    }

    await loadTasks();
    setSavingOrder(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.selesai).length,
    [tasks]
  );

  const pendingTasks = tasks.length - completedTasks;

  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return {
      firstDay,
      days: Array.from({ length: daysInMonth }, (_, index) => index + 1),
    };
  }, [calendarDate]);

  const calendarTasks = useMemo(() => {
    const grouped: Record<number, Task[]> = {};

    tasks.forEach((task) => {
      if (!task.deadline) return;
      const date = new Date(task.deadline);

      if (
        date.getMonth() !== calendarDate.getMonth() ||
        date.getFullYear() !== calendarDate.getFullYear()
      ) return;

      const day = date.getDate();
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(task);
    });

    return grouped;
  }, [tasks, calendarDate]);

  const monthlyTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (!task.deadline) return false;
        const date = new Date(task.deadline);

        return (
          date.getMonth() === calendarDate.getMonth() &&
          date.getFullYear() === calendarDate.getFullYear()
        );
      }),
    [tasks, calendarDate]
  );

  function changeMonth(amount: number) {
    setCalendarDate(
      new Date(
        calendarDate.getFullYear(),
        calendarDate.getMonth() + amount,
        1
      )
    );
  }

  function renderCalendar() {
    return (
      <section className="calendar-card">
        <div className="calendar-header">
          <button
            type="button"
            aria-label="Bulan sebelumnya"
            onClick={() => changeMonth(-1)}
          >
            ←
          </button>

          <h2>
            {monthNames[calendarDate.getMonth()]}{" "}
            {calendarDate.getFullYear()}
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
          <span><i className="legend-high" /> Mendesak</span>
          <span><i className="legend-medium" /> Normal</span>
          <span><i className="legend-low" /> Tidak mendesak</span>
          <span><i className="legend-done" /> Selesai</span>
        </div>

        <div className="calendar-grid">
          {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
            <strong key={day}>{day}</strong>
          ))}

          {Array.from({ length: calendarDays.firstDay }).map((_, index) => (
            <div className="calendar-empty" key={`empty-${index}`} />
          ))}

          {calendarDays.days.map((day) => {
            const dayTasks = calendarTasks[day] ?? [];
            const allCompleted =
              dayTasks.length > 0 &&
              dayTasks.every((task) => task.selesai);

            return (
              <div
                key={day}
                className={`calendar-day ${
                  allCompleted ? "deadline-completed" : ""
                } ${dayTasks.length ? "has-deadline" : ""}`}
              >
                <strong className="calendar-number">{day}</strong>

                <div className="calendar-task-names">
                  {dayTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`calendar-task-name ${
                        task.selesai
                          ? "task-name-completed"
                          : `priority-${(task.prioritas ?? "Sedang").toLowerCase()}`
                      }`}
                      title={task.judul}
                    >
                      {task.judul}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="upcoming-title">Deadline Bulan Ini</h3>

        {monthlyTasks.length === 0 ? (
          <p className="empty-state">Belum ada deadline bulan ini.</p>
        ) : (
          monthlyTasks
            .slice()
            .sort(
              (a, b) =>
                new Date(a.deadline!).getTime() -
                new Date(b.deadline!).getTime()
            )
            .map((task) => (
              <div className="deadline-item" key={task.id}>
                <div className="deadline-info">
                  <strong>{task.judul}</strong>
                  <p>
                    {new Date(task.deadline!).toLocaleDateString("id-ID")}
                  </p>
                </div>

                <span className={task.selesai ? "status-done" : "status-pending"}>
                  {task.selesai ? "Selesai" : "Belum selesai"}
                </span>
              </div>
            ))
        )}
      </section>
    );
  }

  function renderPriority(task: Task) {
    const priority = task.prioritas ?? "Sedang";

    return (
      <span className={`priority-badge priority-${priority.toLowerCase()}`}>
        <span className="priority-dot" />
        {priority} · {priorityText[priority]}
      </span>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✓</span>
          <span>TaskFlow</span>
        </div>

        <p className="sidebar-label">MENU UTAMA</p>

        <nav className="navigation">
          {[
            { name: "Dashboard", icon: "▦" },
            { name: "Tasks", icon: "☑" },
            { name: "Calendar", icon: "▣" },
          ].map((item) => (
            <button
              type="button"
              key={item.name}
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
            <p className="eyebrow">WORKSPACE</p>
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
            <span>♧</span> Aktifkan Notifikasi
          </button>
        </header>

        {notificationStatus && (
          <p className="success-message">{notificationStatus}</p>
        )}

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

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
                <span className="stat-icon">▤</span>
                <p>Total Tasks</p>
                <strong>{tasks.length}</strong>
              </div>

              <div className="stat-card stat-green">
                <span className="stat-icon">✓</span>
                <p>Completed</p>
                <strong>{completedTasks}</strong>
              </div>

              <div className="stat-card stat-orange">
                <span className="stat-icon">◷</span>
                <p>In Progress</p>
                <strong>{pendingTasks}</strong>
              </div>
            </div>

            <section className="content-card">
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
                  Lihat semua →
                </button>
              </div>

              {loading ? (
                <p className="empty-state">Memuat tugas...</p>
              ) : tasks.length === 0 ? (
                <p className="empty-state">
                  Belum ada task. Tambahkan task pertamamu!
                </p>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <div className="task-row dashboard-task" key={task.id}>
                    <div className="task-info">
                      <strong className={task.selesai ? "task-completed" : ""}>
                        {task.judul}
                      </strong>
                      <p>{task.deskripsi || "Tidak ada deskripsi."}</p>
                      {renderPriority(task)}
                    </div>

                    <span className={task.selesai ? "status-done" : "status-pending"}>
                      {task.selesai ? "Completed" : "In Progress"}
                    </span>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {activePage === "Tasks" && (
          <>
            <div className="section-heading">
              <div>
                <h2>My Tasks</h2>
                <p>Kelola dan atur prioritas semua tugasmu.</p>
              </div>
            </div>

            <form className="task-form" onSubmit={saveTask}>
              <div className="form-title">
                <div className="form-title-icon">＋</div>
                <div>
                  <h3>{editId === null ? "Add New Task" : "Edit Task"}</h3>
                  <p>Lengkapi informasi tugas di bawah ini.</p>
                </div>
              </div>

              <label htmlFor="task-title">Judul tugas</label>
              <input
                id="task-title"
                placeholder="Contoh: Mengerjakan tugas matematika"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                required
              />

              <label htmlFor="task-description">Deskripsi</label>
              <textarea
                id="task-description"
                placeholder="Tambahkan detail tugas..."
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
              />

              <div className="form-two-columns">
                <div className="form-field">
                  <label htmlFor="prioritas">Skala prioritas</label>
                  <select
                    id="prioritas"
                    value={prioritas}
                    onChange={(e) =>
                      setPrioritas(e.target.value as Priority)
                    }
                  >
                    <option value="Tinggi">🔴 Tinggi — Mendesak</option>
                    <option value="Sedang">🟠 Sedang — Normal</option>
                    <option value="Rendah">🟢 Rendah — Tidak Mendesak</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="task-deadline">Deadline</label>
                  <input
                    id="task-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
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
                      ? "＋ Add Task"
                      : "Simpan Perubahan"}
                </button>

                {editId !== null && (
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={resetForm}
                  >
                    Batal
                  </button>
                )}
              </div>
            </form>

            <section className="content-card">
              <div className="card-heading">
                <div>
                  <h2>All Tasks ({tasks.length})</h2>
                  <p>Geser tugas untuk mengubah urutannya.</p>
                </div>
              </div>

              <div className="priority-guide">
                {priorities.map((priority) => (
                  <div className="priority-guide-item" key={priority}>
                    <span className={`priority-dot dot-${priority.toLowerCase()}`} />
                    <span>{priority}</span>
                    <small>{priorityText[priority]}</small>
                  </div>
                ))}
              </div>

              {savingOrder && (
                <p className="saving-order">Menyimpan urutan tugas...</p>
              )}

              {loading ? (
                <p className="empty-state">Memuat tugas...</p>
              ) : tasks.length === 0 ? (
                <p className="empty-state">
                  Belum ada task. Tambahkan task pertamamu!
                </p>
              ) : (
                tasks.map((task) => (
                  <article
                    className={`task-row task-list-row ${
                      draggedTaskId === task.id ? "dragging" : ""
                    } ${task.selesai ? "completed-row" : ""}`}
                    key={task.id}
                    draggable={!savingOrder}
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(task.id);
                    }}
                    onDragEnd={() => setDraggedTaskId(null)}
                  >
                    <div className="drag-handle" aria-label="Geser tugas">
                      ⠿
                    </div>

                    <div className="task-info">
                      <strong className={task.selesai ? "task-completed" : ""}>
                        {task.judul}
                      </strong>

                      <p>{task.deskripsi || "Tidak ada deskripsi."}</p>

                      <div className="task-meta">
                        <span className="deadline-label">
                          ◷{" "}
                          {task.deadline
                            ? new Date(task.deadline).toLocaleDateString("id-ID")
                            : "Belum ada deadline"}
                        </span>
                        {renderPriority(task)}
                        <span className={task.selesai ? "status-done" : "status-pending"}>
                          {task.selesai ? "Completed" : "In Progress"}
                        </span>
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className={task.selesai ? "undo-button" : "complete-button"}
                        onClick={() => toggleTask(task)}
                      >
                        {task.selesai ? "↶ Undo" : "✓ Complete"}
                      </button>

                      {!task.selesai && (
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => editTask(task)}
                        >
                          Edit
                        </button>
                      )}

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => deleteTask(task.id)}
                      >
                        Hapus
                      </button>
                    </div>
                  </article>
                ))
              )}
            </section>
          </>
        )}

        {activePage === "Calendar" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Calendar Deadline</h2>
                <p>Lihat jadwal dan deadline semua tugasmu.</p>
              </div>
            </div>
            {renderCalendar()}
          </>
        )}
      </main>
    </div>
  );
}