"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: number;
  judul: string;
  deskripsi: string;
  created_at: string;
  selesai: boolean;
  deadline: string | null;
  urutan: number;
  prioritas: "Tinggi" | "Sedang" | "Rendah";
};

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [deadline, setDeadline] = useState("");
  const [prioritas, setPrioritas] = useState<"Tinggi" | "Sedang" | "Rendah">("Sedang");
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");
  const [calendarDate, setCalendarDate] = useState(new Date(2000, 0, 1));
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);

  const notifiedTasks = useRef<Set<number>>(new Set());

  useEffect(() => {
    setCalendarDate(new Date());
  }, []);

  const monthNames = [
    "Januari", "Februari", "Maret", "April",
    "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember"
  ];

  const firstDay = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth(),
    1
  ).getDay();

  const daysInMonth = new Date(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + 1,
    0
  ).getDate();

  async function loadTasks() {
    const { data, error } = await supabase
      .from("project1")
      .select("*")
      .order("urutan", { ascending: true })
      .order("id", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setTasks((data ?? []) as Task[]);
      setError("");
    }

    setLoading(false);
  }

  // SESSION: MEMERIKSA LOGIN
  useEffect(() => {
    let mounted = true;

    async function checkLogin() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

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
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // AUTO LOGOUT SETELAH 30 MENIT TIDAK AKTIF
  useEffect(() => {
    if (!sessionActive) return;

    const INACTIVITY_LIMIT = 30 * 60 * 1000;
    let timeout: ReturnType<typeof setTimeout>;

    const resetSessionTimer = () => {
      clearTimeout(timeout);

      timeout = setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.replace("/login");
      }, INACTIVITY_LIMIT);
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetSessionTimer);
    });

    resetSessionTimer();

    return () => {
      clearTimeout(timeout);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetSessionTimer);
      });
    };
  }, [sessionActive]);

  // NOTIFIKASI DEADLINE
  useEffect(() => {
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
    const interval = setInterval(checkDeadlines, 60000);

    return () => clearInterval(interval);
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

  // TAMBAH DAN EDIT TASK
  async function saveTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

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
      return;
    }

    let result;

    if (editId === null) {
      result = await supabase
        .from("project1")
        .insert([{ ...values, selesai: false }]);
    } else {
      const taskToEdit = tasks.find((task) => task.id === editId);

      if (!taskToEdit || taskToEdit.selesai) {
        setError("Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit.");
        setEditId(null);
        setJudul("");
        setDeskripsi("");
        setDeadline("");
        setPrioritas("Sedang");
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
      return;
    }

    setJudul("");
    setDeskripsi("");
    setDeadline("");
    setPrioritas("Sedang");
    setEditId(null);

    await loadTasks();
  }

  // HAPUS TASK
  async function deleteTask(id: number) {
    if (!window.confirm("Yakin ingin menghapus task ini?")) return;

    const { error } = await supabase
      .from("project1")
      .delete()
      .eq("id", id);

    if (error) setError(error.message);
    else await loadTasks();
  }

  // COMPLETE DAN UNDO
  async function toggleTask(task: Task) {
    const { error } = await supabase
      .from("project1")
      .update({ selesai: !task.selesai })
      .eq("id", task.id);

    if (error) {
      setError(error.message);
      return;
    }

    if (!task.selesai && editId === task.id) {
      setEditId(null);
      setJudul("");
      setDeskripsi("");
      setDeadline("");
      setPrioritas("Sedang");
    }

    await loadTasks();
  }

  // EDIT TASK: HANYA TASK YANG BELUM SELESAI
  function editTask(task: Task) {
    if (task.selesai) {
      setError("Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit.");
      return;
    }

    setError("");
    setEditId(task.id);
    setJudul(task.judul);
    setDeskripsi(task.deskripsi ?? "");
    setDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setPrioritas(task.prioritas ?? "Sedang");
    setActivePage("Tasks");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // DRAG AND DROP
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

    for (const task of updatedTasks) {
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

  // LOGOUT
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  const completedTasks = tasks.filter((task) => task.selesai).length;
  const pendingTasks = tasks.length - completedTasks;

  // KALENDER DEADLINE
  function renderCalendar() {
    return (
      <div className="calendar-card">
        <div className="calendar-header">
          <button
            onClick={() =>
              setCalendarDate(
                new Date(
                  calendarDate.getFullYear(),
                  calendarDate.getMonth() - 1,
                  1
                )
              )
            }
          >
            ←
          </button>

          <h2>
            {monthNames[calendarDate.getMonth()]}{" "}
            {calendarDate.getFullYear()}
          </h2>

          <button
            onClick={() =>
              setCalendarDate(
                new Date(
                  calendarDate.getFullYear(),
                  calendarDate.getMonth() + 1,
                  1
                )
              )
            }
          >
            →
          </button>
        </div>

        <div className="calendar-grid">
          {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((day) => (
            <strong key={day}>{day}</strong>
          ))}

          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;

            const deadlineTasks = tasks.filter((task) => {
              if (!task.deadline) return false;

              const date = new Date(task.deadline);

              return (
                date.getDate() === day &&
                date.getMonth() === calendarDate.getMonth() &&
                date.getFullYear() === calendarDate.getFullYear()
              );
            });

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
                <strong>{day}</strong>

                <div className="calendar-task-names">
                  {deadlineTasks.map((task) => (
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

        {tasks.filter((task) => {
          if (!task.deadline) return false;
          const date = new Date(task.deadline);

          return (
            date.getMonth() === calendarDate.getMonth() &&
            date.getFullYear() === calendarDate.getFullYear()
          );
        }).length === 0 ? (
          <p>Belum ada deadline bulan ini.</p>
        ) : (
          tasks
            .filter((task) => {
              if (!task.deadline) return false;
              const date = new Date(task.deadline);

              return (
                date.getMonth() === calendarDate.getMonth() &&
                date.getFullYear() === calendarDate.getFullYear()
              );
            })
            .map((task) => (
              <div className="deadline-item" key={task.id}>
                <div>
                  <strong>{task.judul}</strong>
                  <p>
                    {new Date(task.deadline!).toLocaleDateString("id-ID")}
                  </p>
                </div>
                <span>
                  {task.selesai ? "Selesai" : "Belum selesai"}
                </span>
              </div>
            ))
        )}
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">✓</span>
          TaskFlow
        </div>

        <p className="sidebar-label">MENU UTAMA</p>

        {[
          { name: "Dashboard", icon: "▦" },
          { name: "Tasks", icon: "☑" },
          { name: "Calendar", icon: "▣" },
        ].map((item) => (
          <button
            key={item.name}
            className={`nav-item ${activePage === item.name ? "active" : ""}`}
            onClick={() => setActivePage(item.name)}
          >
            <span>{item.icon}</span>
            {item.name}
          </button>
        ))}

        <div className="sidebar-bottom">
          <button className="nav-item logout-link" onClick={handleLogout}>
            <span>↪</span>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{activePage}</h1>
            <p>Welcome to your TaskFlow workspace.</p>
          </div>

          <button
            className="notification-button"
            onClick={enableNotifications}
          >
            Aktifkan Notifikasi
          </button>
        </header>

        {notificationStatus && (
          <p className="success-message">{notificationStatus}</p>
        )}

        {error && <p className="error-message">{error}</p>}

        {activePage === "Dashboard" && (
          <>
            <h2 className="section-title">Overview</h2>

            <div className="stats-grid">
              <div className="stat-card">
                <span>Total Tasks</span>
                <strong>{tasks.length}</strong>
              </div>
              <div className="stat-card">
                <span>Completed</span>
                <strong>{completedTasks}</strong>
              </div>
              <div className="stat-card">
                <span>In Progress</span>
                <strong>{pendingTasks}</strong>
              </div>
            </div>

            <div className="content-card">
              <h2>Recent Tasks</h2>
              {tasks.length === 0 ? (
                <p>Belum ada task. Tambahkan task pertamamu!</p>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <div className="task-row" key={task.id}>
                    <div>
                      <strong>{task.judul}</strong>
                      <p>{task.deskripsi}</p>
                      <span className={`priority-badge priority-${(task.prioritas ?? "Sedang").toLowerCase()}`}>
                        Prioritas: {task.prioritas ?? "Sedang"}
                      </span>
                    </div>
                    <span
                      className={
                        task.selesai ? "status-done" : "status-pending"
                      }
                    >
                      {task.selesai ? "Completed" : "In Progress"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activePage === "Tasks" && (
          <>
            <div className="page-heading">
              <div>
                <h2 className="section-title">My Tasks</h2>
                <p>Kelola semua tugasmu di sini.</p>
              </div>
            </div>

            <form className="task-form" onSubmit={saveTask}>
              <h3>{editId === null ? "Add New Task" : "Edit Task"}</h3>

              <input
                placeholder="Task title"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                required
              />

              <textarea
                placeholder="Task description"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
              />

              <label htmlFor="prioritas">Skala Prioritas</label>
              <select
                id="prioritas"
                value={prioritas}
                onChange={(e) => setPrioritas(e.target.value as "Tinggi" | "Sedang" | "Rendah")}
              >
                <option value="Tinggi">🔴 Tinggi — Mendesak</option>
                <option value="Sedang">🟠 Sedang — Normal</option>
                <option value="Rendah">🟢 Rendah — Tidak Mendesak</option>
              </select>

              <label>Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />

              <div className="form-actions">
                <button className="primary-button" type="submit">
                  {editId === null ? "Add Task" : "Save Changes"}
                </button>

                {editId !== null && (
                  <button
                    className="cancel-button"
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setJudul("");
                      setDeskripsi("");
                      setDeadline("");
                      setPrioritas("Sedang");
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div className="content-card">
              <h2>All Tasks ({tasks.length})</h2>

              <p className="drag-instruction">
                ☰ Tahan dan geser task untuk mengubah urutannya.
              </p>

              {savingOrder && <p>Menyimpan urutan task...</p>}

              {loading ? (
                <p>Loading...</p>
              ) : tasks.length === 0 ? (
                <p>Belum ada task. Tambahkan task pertamamu!</p>
              ) : (
                tasks.map((task) => (
                  <div
                    className={`task-row ${
                      draggedTaskId === task.id ? "dragging" : ""
                    }`}
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
                    <div className="task-info">
                      <strong
                        className={task.selesai ? "task-completed" : ""}
                      >
                        {task.judul}
                      </strong>

                      <p>{task.deskripsi}</p>

                      <small>
                        Deadline:{" "}
                        {task.deadline
                          ? new Date(task.deadline).toLocaleDateString("id-ID")
                          : "Belum ditentukan"}
                      </small>

                      <span className={`priority-badge priority-${(task.prioritas ?? "Sedang").toLowerCase()}`}>
                        {task.prioritas === "Tinggi"
                          ? "🔴 Tinggi — Mendesak"
                          : task.prioritas === "Rendah"
                            ? "🟢 Rendah — Tidak Mendesak"
                            : "🟠 Sedang — Normal"}
                      </span>

                      <span
                        className={
                          task.selesai ? "status-done" : "status-pending"
                        }
                      >
                        {task.selesai ? "Completed" : "In Progress"}
                      </span>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        draggable={false}
                        onClick={() => toggleTask(task)}
                      >
                        {task.selesai ? "Undo" : "Complete"}
                      </button>

                      {!task.selesai && (
                        <button
                          type="button"
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

        {activePage === "Calendar" && (
          <>
            <h2 className="section-title">Calendar Deadline</h2>
            <p className="page-description">
              Lihat jadwal dan deadline semua task kamu.
            </p>
            {renderCalendar()}
          </>
        )}
      </main>
    </div>
  );
}