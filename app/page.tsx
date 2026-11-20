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

// Gantt: tampil 4 bulan, tiap bulan dibagi 4 minggu (tgl 1-7, 8-14, 15-21, 22-akhir)
const GANTT_MONTHS = 4;
const GANTT_WEEK_STARTS = [1, 8, 15, 22];

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
  if (task.prioritas === "Tinggi" || task.prioritas === "Rendah") {
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
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 0, 1));
  const [ganttStart, setGanttStart] = useState(new Date(2026, 0, 1));

  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const notifiedTasks = useRef<Set<number>>(new Set());

  // Isi kalender dengan tanggal hari ini setelah halaman terbuka di browser
  useEffect(() => {
    const now = new Date();

    setCalendarDate(now);
    setGanttStart(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

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

  // Dihitung dalam SATU putaran saja (sebelumnya 3 kali filter)
  const priorityCounts = useMemo(() => {
    const counts = { tinggi: 0, sedang: 0, rendah: 0 };

    for (const task of tasks) {
      if (task.selesai) continue;

      const priority = getPriority(task);

      if (priority === "Tinggi") counts.tinggi++;
      else if (priority === "Sedang") counts.sedang++;
      else counts.rendah++;
    }

    return counts;
  }, [tasks]);

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
  // Cek login & ambil data BERSAMAAN (tidak antre)
  // ==========================================

  useEffect(() => {
    let mounted = true;

    async function start() {
      const [{ data, error: authError }] = await Promise.all([
        supabase.auth.getSession(),
        loadTasks(),
      ]);

      if (!mounted) return;

      if (authError || !data.session) {
        window.location.replace("/login");
        return;
      }

      setSessionActive(true);
    }

    start();

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

    const events = ["pointerdown", "keydown", "scroll", "touchstart"];

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

        const remaining = new Date(task.deadline).getTime() - now;

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
      deadline: deadline ? new Date(deadline).toISOString() : null,
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
      const taskToEdit = tasks.find((task) => task.id === editId);

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
    await loadTasks(); // di sini memang perlu, karena id task baru dibuat server
    setSaving(false);
  }

  // ==========================================
  // DELETE TASK
  // Tidak ambil ulang semua data, cukup buang 1 task dari layar
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
      return;
    }

    setTasks((prev) => prev.filter((task) => task.id !== id));

    if (editId === id) {
      resetForm();
    }
  }

  // ==========================================
  // COMPLETE & UNDO
  // Tidak ambil ulang semua data, cukup ubah 1 task di layar
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

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, selesai: !item.selesai } : item
      )
    );

    if (!task.selesai && editId === task.id) {
      resetForm();
    }
  }

  // ==========================================
  // EDIT TASK
  // ==========================================

  function editTask(task: Task) {
    if (task.selesai) {
      setError(
        "Task sudah selesai. Tekan Undo terlebih dahulu untuk mengedit."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setError("");
    setEditId(task.id);
    setJudul(task.judul);
    setDeskripsi(task.deskripsi ?? "");
    setDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
    setPrioritas(getPriority(task));
    setActivePage("Tasks");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // ==========================================
  // URUTAN TASK (DRAG AND DROP + TOMBOL ▲▼)
  // Hanya task yang urutannya berubah yang dikirim ke database
  // ==========================================

  async function persistOrder(newOrder: Task[]) {
    const previous = tasks;

    const updated = newOrder.map((task, index) => ({
      ...task,
      urutan: index + 1,
    }));

    const changed = updated.filter((task) => {
      const before = previous.find((item) => item.id === task.id);
      return !before || before.urutan !== task.urutan;
    });

    setTasks(updated);
    setSavingOrder(true);
    setError("");

    try {
      if (changed.length > 0) {
        const results = await Promise.all(
          changed.map((task) =>
            supabase
              .from("project1")
              .update({ urutan: task.urutan })
              .eq("id", task.id)
          )
        );

        const failed = results.find((result) => result.error);

        if (failed?.error) {
          throw failed.error;
        }
      }
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";

      setError("Gagal menyimpan urutan task. " + message);

      await loadTasks(); // kembalikan ke urutan asli kalau gagal
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDrop(targetId: number) {
    const draggedId = draggedTaskId;

    setDraggedTaskId(null);
    setDragOverId(null);

    if (draggedId === null || draggedId === targetId || savingOrder) {
      return;
    }

    // Pakai urutan yang sedang tampil di layar
    const ordered = [...tasks];

    const fromIndex = ordered.findIndex((task) => task.id === draggedId);
    const toIndex = ordered.findIndex((task) => task.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const [movedTask] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, movedTask);

    persistOrder(ordered);
  }

  // Alternatif drag-and-drop (untuk HP / layar sentuh)
  function moveTask(id: number, direction: -1 | 1) {
    if (savingOrder) return;

    const index = tasks.findIndex((task) => task.id === id);
    const target = index + direction;

    if (index === -1 || target < 0 || target >= tasks.length) return;

    const ordered = [...tasks];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

    persistOrder(ordered);
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

  function changeGanttMonth(amount: number) {
    setGanttStart(
      new Date(ganttStart.getFullYear(), ganttStart.getMonth() + amount, 1)
    );
  }

  function goToCurrentGanttMonth() {
    const now = new Date();
    setGanttStart(new Date(now.getFullYear(), now.getMonth(), 1));
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

      <p className="calendar-hint">
        Klik nama task di kalender atau tombol Edit untuk mengubahnya.
      </p>

      <div className="calendar-grid">
        {WEEK_DAYS.map((day) => (
          <strong key={day}>{day}</strong>
        ))}

        {Array.from({ length: calendarInfo.firstDay }, (_, index) => (
          <div key={`empty-${index}`} className="calendar-empty" />
        ))}

        {Array.from({ length: calendarInfo.daysInMonth }, (_, index) => {
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
              <strong className="calendar-number">{day}</strong>

              <div className="calendar-task-names">
                {deadlineTasks.map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    className={`calendar-task-name ${
                      task.selesai
                        ? "task-name-completed"
                        : PRIORITY_CLASS[getPriority(task)]
                    }`}
                    title={
                      task.selesai
                        ? `${task.judul} (selesai)`
                        : `Edit: ${task.judul}`
                    }
                    onClick={() => editTask(task)}
                  >
                    {task.judul}
                  </button>
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
        monthlyTasks.map((task) => (
          <div className="deadline-item" key={task.id}>
            <div className="deadline-info">
              <strong>{task.judul}</strong>
              <p>
                {new Date(task.deadline!).toLocaleDateString("id-ID")}
              </p>
              <TaskPriorityMemo task={task} />
            </div>

            <div className="deadline-side">
              <TaskStatusMemo completed={task.selesai} />

              {!task.selesai && (
                <button
                  type="button"
                  className="deadline-edit"
                  onClick={() => editTask(task)}
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  // ==========================================
  // GANTT CHART COMPONENT
  // Batang task = dari tanggal dibuat sampai deadline
  // ==========================================

  const renderGantt = () => {
    const rangeMonths = Array.from({ length: GANTT_MONTHS }, (_, index) => {
      return new Date(
        ganttStart.getFullYear(),
        ganttStart.getMonth() + index,
        1
      );
    });

    const weeks = rangeMonths.flatMap((monthDate) => {
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();

      return GANTT_WEEK_STARTS.map((startDay, index) => {
        const endDay =
          index === GANTT_WEEK_STARTS.length - 1 ? lastDay : startDay + 6;

        return {
          key: `${year}-${month}-${index}`,
          label: `${startDay}-${endDay}`,
          title: `${startDay}-${endDay} ${MONTH_NAMES[month]} ${year}`,
          start: new Date(year, month, startDay).getTime(),
          end: new Date(year, month, endDay, 23, 59, 59, 999).getTime(),
          firstOfMonth: index === 0,
        };
      });
    });

    const rangeStart = weeks[0].start;
    const rangeEnd = weeks[weeks.length - 1].end;
    const now = Date.now();

    const withDeadline = tasks.filter((task) => task.deadline);

    const rows = withDeadline
      .map((task) => {
        const created = new Date(task.created_at);
        const due = new Date(task.deadline!);

        const createdStart = new Date(
          created.getFullYear(),
          created.getMonth(),
          created.getDate()
        ).getTime();

        const dueStart = new Date(
          due.getFullYear(),
          due.getMonth(),
          due.getDate()
        ).getTime();

        const dueEnd = new Date(
          due.getFullYear(),
          due.getMonth(),
          due.getDate(),
          23,
          59,
          59,
          999
        ).getTime();

        return {
          task,
          startMs: Math.min(createdStart, dueStart),
          endMs: dueEnd,
          label: `${created.toLocaleDateString("id-ID")} - ${due.toLocaleDateString("id-ID")}`,
        };
      })
      .filter((row) => row.startMs <= rangeEnd && row.endMs >= rangeStart)
      .sort((a, b) => a.startMs - b.startMs);

    const lastMonth = rangeMonths[rangeMonths.length - 1];
    const noDeadlineCount = tasks.length - withDeadline.length;

    return (
      <div className="calendar-card gantt-card">
        <div className="calendar-header">
          <button
            type="button"
            aria-label="Bulan sebelumnya"
            onClick={() => changeGanttMonth(-1)}
          >
            ←
          </button>

          <h2>
            {MONTH_NAMES[ganttStart.getMonth()]} {ganttStart.getFullYear()} -{" "}
            {MONTH_NAMES[lastMonth.getMonth()]} {lastMonth.getFullYear()}
          </h2>

          <button
            type="button"
            aria-label="Bulan berikutnya"
            onClick={() => changeGanttMonth(1)}
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

          <button
            type="button"
            className="text-button gantt-today-button"
            onClick={goToCurrentGanttMonth}
          >
            Bulan ini
          </button>
        </div>

        <p className="calendar-hint">
          Batang menunjukkan rentang dari tanggal task dibuat sampai deadline.
          Klik nama task untuk mengedit.
        </p>

        {rows.length === 0 ? (
          <p className="empty-state">
            Belum ada task dengan deadline pada periode ini.
          </p>
        ) : (
          <div className="gantt-scroll">
            <div
              className="gantt-grid"
              style={{
                gridTemplateColumns: `var(--gantt-name) repeat(${weeks.length}, minmax(var(--gantt-week), 1fr))`,
                minWidth: `calc(var(--gantt-name) + ${weeks.length} * var(--gantt-week))`,
              }}
            >
              <div className="gantt-corner">Task</div>

              {rangeMonths.map((monthDate) => (
                <div
                  className="gantt-month"
                  key={`${monthDate.getFullYear()}-${monthDate.getMonth()}`}
                >
                  {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
                </div>
              ))}

              {weeks.map((week) => (
                <div
                  key={week.key}
                  title={week.title}
                  className={`gantt-week ${
                    now >= week.start && now <= week.end ? "current" : ""
                  }`}
                >
                  {week.label}
                </div>
              ))}

              {rows.map(({ task, startMs, endMs, label }) => (
                <div className="gantt-row" key={task.id}>
                  <button
                    type="button"
                    className={`gantt-name ${task.selesai ? "done" : ""}`}
                    title={task.selesai ? task.judul : `Edit: ${task.judul}`}
                    onClick={() => editTask(task)}
                  >
                    {task.judul}
                  </button>

                  {weeks.map((week) => {
                    const active = week.start <= endMs && week.end >= startMs;

                    return (
                      <div
                        key={week.key}
                        className={`gantt-cell ${
                          week.firstOfMonth ? "month-start" : ""
                        }`}
                        title={active ? `${task.judul}: ${label}` : undefined}
                      >
                        <span
                          className={`gantt-block ${
                            active
                              ? `filled ${
                                  task.selesai
                                    ? "done"
                                    : PRIORITY_CLASS[getPriority(task)]
                                }`
                              : ""
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {noDeadlineCount > 0 && (
          <p className="gantt-note">
            {noDeadlineCount} task tanpa deadline tidak ditampilkan di Gantt
            Chart.
          </p>
        )}
      </div>
    );
  };

  // ==========================================
  // LAYAR "MEMUAT" (muncul cepat, selagi cek login)
  // Harus setelah SEMUA hook, supaya aturan hooks aman
  // ==========================================

  if (!sessionActive) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <p>Memuat TaskFlow...</p>
      </div>
    );
  }

  // ==========================================
  // MAIN PAGE
  // ==========================================

  return (
    <div className="app-layout">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Buka menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        ☰
      </button>

      <div
        className={`sidebar-overlay ${menuOpen ? "show" : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
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
            { name: "Gantt Chart", icon: "▤" },
          ].map((item) => (
            <button
              key={item.name}
              type="button"
              className={`nav-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => {
                setActivePage(item.name);
                setMenuOpen(false);
              }}
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
          <p className="success-message">{notificationStatus}</p>
        )}

        {error && <p className="error-message">{error}</p>}

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
                        className={task.selesai ? "task-completed" : ""}
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
                  <h3>{editId === null ? "Add New Task" : "Edit Task"}</h3>
                  <p>Isi detail tugas dan tentukan prioritasnya.</p>
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
                <label htmlFor="deskripsi">Task Description</label>
                <textarea
                  id="deskripsi"
                  placeholder="Masukkan deskripsi tugas..."
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                />
              </div>

              <div className="form-two-columns">
                <div className="form-field">
                  <label htmlFor="prioritas">Skala Prioritas</label>

                  <select
                    id="prioritas"
                    value={prioritas}
                    onChange={(e) =>
                      setPrioritas(e.target.value as Priority)
                    }
                  >
                    <option value="Tinggi">Tinggi — Mendesak</option>
                    <option value="Sedang">Sedang — Normal</option>
                    <option value="Rendah">Rendah — Tidak Mendesak</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="deadline">Deadline</label>
                  <input
                    id="deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
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
                  <p>Atur urutan tugas dengan drag-and-drop.</p>
                </div>
              </div>

              {savingOrder && (
                <p className="saving-order">Menyimpan urutan task...</p>
              )}

              {loading ? (
                <p className="empty-state">Loading...</p>
              ) : tasks.length === 0 ? (
                <p className="empty-state">
                  Belum ada task. Tambahkan task pertamamu!
                </p>
              ) : (
                tasks.map((task, index) => (
                  <div
                    className={`task-row ${
                      draggedTaskId === task.id ? "dragging" : ""
                    } ${
                      dragOverId === task.id && draggedTaskId !== task.id
                        ? "drag-over"
                        : ""
                    } ${task.selesai ? "completed-row" : ""}`}
                    key={task.id}
                    draggable={!savingOrder}
                    onDragStart={(e) => {
                      // Firefox wajib ada data agar drag bisa mulai
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(task.id));
                      setDraggedTaskId(task.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";

                      if (draggedTaskId !== null && dragOverId !== task.id) {
                        setDragOverId(task.id);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDragOverId(null);
                    }}
                  >
                    <div className="drag-handle" aria-hidden="true">
                      ⠿
                    </div>

                    <div className="task-info">
                      <strong
                        className={task.selesai ? "task-completed" : ""}
                      >
                        {task.judul}
                      </strong>

                      <p>{task.deskripsi}</p>

                      <div className="task-meta">
                        <span className="deadline-label">
                          Deadline:{" "}
                          {task.deadline
                            ? new Date(task.deadline).toLocaleDateString(
                                "id-ID"
                              )
                            : "Belum ditentukan"}
                        </span>

                        <TaskPriorityMemo task={task} />
                        <TaskStatusMemo completed={task.selesai} />
                      </div>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        className="reorder-button"
                        aria-label="Pindah ke atas"
                        draggable={false}
                        disabled={savingOrder || index === 0}
                        onClick={() => moveTask(task.id, -1)}
                      >
                        ▲
                      </button>

                      <button
                        type="button"
                        className="reorder-button"
                        aria-label="Pindah ke bawah"
                        draggable={false}
                        disabled={savingOrder || index === tasks.length - 1}
                        onClick={() => moveTask(task.id, 1)}
                      >
                        ▼
                      </button>

                      <button
                        type="button"
                        className={
                          task.selesai ? "undo-button" : "complete-button"
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
                <p>Lihat jadwal dan deadline semua task kamu.</p>
              </div>
            </div>

            {renderCalendar()}
          </>
        )}

        {/* GANTT CHART */}
        {activePage === "Gantt Chart" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Gantt Chart</h2>
                <p>Lihat rentang waktu semua task dalam satu tampilan.</p>
              </div>
            </div>

            {renderGantt()}
          </>
        )}
      </main>
    </div>
  );
}