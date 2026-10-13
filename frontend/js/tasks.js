
"use strict";

const API_BASE = "http://127.0.0.1:8000";

let tasks = [];
let editingTaskId = null;
let isSavingTask = false;
let isLoadingTasks = false;

// =====================================================
// AUTHENTICATION AND API
// =====================================================

function getToken() {
    return localStorage.getItem("orbit_token");
}

function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();

    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    if (!token) {
        window.location.href = "../login.html";
        throw new Error("Please log in first.");
    }

    let response;

    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                ...authHeaders(),
                ...(options.headers || {})
            }
        });
    } catch {
        throw new Error("Cannot connect to the FastAPI backend on port 8000.");
    }

    if (response.status === 401) {
        localStorage.removeItem("orbit_token");
        localStorage.removeItem("orbit_user");
        window.location.href = "../login.html";
        throw new Error("Session expired. Please log in again.");
    }

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        let detail = data?.detail || data?.message ||
            `Request failed (${response.status})`;

        if (Array.isArray(detail)) {
            detail = detail.map(item =>
                `${item.loc?.join(".") || "field"}: ${item.msg}`
            ).join(", ");
        }

        throw new Error(String(detail));
    }

    return data;
}

// =====================================================
// HELPERS
// =====================================================

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function getValue(id) {
    return document.getElementById(id)?.value ?? "";
}

function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function numberOrNull(value) {
    if (value === "" || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
    return value === "" || value == null ? null : value;
}

function taskStatus(task) {
    return String(task.status ?? "TODO").split(".").pop().toUpperCase();
}

function taskResponseItems(response) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.items)) return response.items;
    if (Array.isArray(response?.tasks)) return response.tasks;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.results)) return response.results;
    return [];
}

// =====================================================
// REFRESH PROJECT PROGRESS
// =====================================================

function refreshProjectProgress() {
    // Projects page may not be loaded on this page.
    // Its own timer and focus listener refresh it when opened.
    if (typeof window.loadProjects === "function") {
        window.loadProjects({ silent: true });
    }
}

// =====================================================
// STATUS AND PRIORITY
// =====================================================

function formatStatus(status) {
    const value = String(status || "TODO").toUpperCase();

    const labels = {
        TODO: "To Do",
        IN_PROGRESS: "In Progress",
        BLOCKED: "Blocked",
        DONE: "Completed",
        COMPLETED: "Completed"
    };

    const classes = {
        TODO: "task-status-todo",
        IN_PROGRESS: "task-status-in-progress",
        BLOCKED: "task-status-blocked",
        DONE: "task-status-done",
        COMPLETED: "task-status-done"
    };

    return `<span class="task-badge ${classes[value] || "task-status-todo"}">
        ${escapeHtml(labels[value] || value)}
    </span>`;
}

function formatPriority(priority) {
    const value = String(priority || "MEDIUM").toUpperCase();

    const labels = {
        LOW: "Low",
        MEDIUM: "Medium",
        HIGH: "High",
        URGENT: "Urgent"
    };

    const classes = {
        LOW: "task-priority-low",
        MEDIUM: "task-priority-medium",
        HIGH: "task-priority-high",
        URGENT: "task-priority-high"
    };

    return `<span class="task-badge ${classes[value] || classes.MEDIUM}">
        ${escapeHtml(labels[value] || "Medium")}
    </span>`;
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

    if (Number.isNaN(date.getTime())) return escapeHtml(value);

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// =====================================================
// LOAD TASKS
// =====================================================

async function loadTasks() {
    if (isLoadingTasks) return;
    isLoadingTasks = true;

    const tbody = document.getElementById("tableBody");

    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="task-empty">Loading tasks...</td></tr>`;
    }

    try {
        const response = await apiRequest("/api/tasks", {
            method: "GET",
            cache: "no-store"
        });

        tasks = taskResponseItems(response);

        updateTaskStats(tasks);
        filterTasks();

    } catch (error) {
        console.error("Load tasks error:", error);

        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="7" class="task-empty">
                    Failed to load tasks.<br>
                    <small>${escapeHtml(error.message)}</small>
                </td></tr>`;
        }

        updateTaskStats([]);
    } finally {
        isLoadingTasks = false;
    }
}

// =====================================================
// RENDER TASKS
// =====================================================

function renderTasks(taskList = tasks) {
    const tbody = document.getElementById("tableBody");
    if (!tbody) return;

    if (!taskList.length) {
        tbody.innerHTML = `
            <tr><td colspan="7" class="task-empty">
                No tasks found. Create a new task to get started.
            </td></tr>`;
        return;
    }

    tbody.innerHTML = taskList.map(taskRow).join("");
}

function taskRow(task) {
    const id = Number(task.id);

    return `
        <tr>
            <td class="task-title-cell">
                <div class="task-title-main">
                    ${escapeHtml(task.title || "Untitled Task")}
                </div>
                ${task.description
                    ? `<div class="task-description">${escapeHtml(task.description)}</div>`
                    : ""}
            </td>
            <td>${task.project_id
                ? `Project #${escapeHtml(task.project_id)}`
                : "—"}</td>
            <td>${task.assigned_employee_id
                ? `Employee #${escapeHtml(task.assigned_employee_id)}`
                : "Unassigned"}</td>
            <td>${formatStatus(taskStatus(task))}</td>
            <td>${formatPriority(task.priority)}</td>
            <td>${formatDate(task.deadline)}</td>
            <td>
                <div class="task-actions">
                    <button type="button" class="task-action edit"
                        title="Edit Task" onclick="editTask(${id})">✎</button>
                    <button type="button" class="task-action delete"
                        title="Delete Task" onclick="deleteTask(${id})">🗑</button>
                </div>
            </td>
        </tr>`;
}

// =====================================================
// STATISTICS
// =====================================================

function updateTaskStats(list = tasks) {
    setText("totalTasks", list.length);
    setText("pendingTasks", list.filter(t => taskStatus(t) === "TODO").length);
    setText("inProgressTasks", list.filter(t => taskStatus(t) === "IN_PROGRESS").length);
    setText("completedTasks", list.filter(t =>
        ["DONE", "COMPLETED"].includes(taskStatus(t))).length);
}

// =====================================================
// TOAST
// =====================================================

function showToast(message, type = "success") {
    let container = document.getElementById("toastContainer");

    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
}

// =====================================================
// MODAL
// =====================================================

function openTaskModal() {
    editingTaskId = null;
    document.getElementById("taskForm")?.reset();

    setValue("taskStatus", "TODO");
    setValue("taskPriority", "MEDIUM");
    setText("taskModalTitle", "Create Task");

    const button = document.getElementById("saveTaskButton");
    if (button) {
        button.textContent = "Save Task";
        button.disabled = false;
    }

    const modal = document.getElementById("taskModal");
    if (modal) {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }
}

function editTask(id) {
    const task = tasks.find(item => Number(item.id) === Number(id));

    if (!task) {
        showToast("Task not found.", "error");
        return;
    }

    editingTaskId = Number(task.id);

    setValue("taskTitle", task.title);
    setValue("taskProject", task.project_id);
    setValue("taskDescription", task.description);
    setValue("taskAssignee", task.assigned_employee_id);
    setValue("taskPriority", task.priority || "MEDIUM");
    setValue("taskStatus", taskStatus(task));
    setValue("taskStartDate", task.start_date);
    setValue("taskDueDate", task.deadline);

    setText("taskModalTitle", "Edit Task");

    const button = document.getElementById("saveTaskButton");
    if (button) button.textContent = "Update Task";

    const modal = document.getElementById("taskModal");
    if (modal) {
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }
}

function closeTaskModal() {
    const modal = document.getElementById("taskModal");

    if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }

    document.getElementById("taskForm")?.reset();
    editingTaskId = null;
}

// =====================================================
// CREATE / UPDATE TASK
// =====================================================

async function saveTask(event) {
    if (event) event.preventDefault();
    if (isSavingTask) return;

    const title = getValue("taskTitle").trim();

    if (!title) {
        showToast("Task title is required.", "error");
        return;
    }

    const payload = {
        project_id: numberOrNull(getValue("taskProject")),
        title,
        description: stringOrNull(getValue("taskDescription").trim()),
        assigned_employee_id: numberOrNull(getValue("taskAssignee")),
        priority: getValue("taskPriority") || "MEDIUM",
        status: getValue("taskStatus") || "TODO",
        start_date: stringOrNull(getValue("taskStartDate")),
        deadline: stringOrNull(getValue("taskDueDate"))
    };

    const wasEditing = editingTaskId !== null;
    const endpoint = wasEditing
        ? `/api/tasks/${editingTaskId}`
        : "/api/tasks";

    const button = document.getElementById("saveTaskButton");
    isSavingTask = true;

    if (button) {
        button.disabled = true;
        button.textContent = "Saving...";
    }

    try {
        await apiRequest(endpoint, {
            method: wasEditing ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });

        closeTaskModal();
        showToast(
            wasEditing ? "Task updated successfully." : "Task created successfully."
        );

        await loadTasks();
        refreshProjectProgress();

    } catch (error) {
        console.error("Save task error:", error);
        showToast(error.message || "Unable to save task.", "error");
    } finally {
        isSavingTask = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Save Task";
        }
    }
}

// =====================================================
// DELETE TASK
// =====================================================

async function deleteTask(id) {
    const task = tasks.find(item => Number(item.id) === Number(id));

    if (!task) {
        showToast("Task not found.", "error");
        return;
    }

    if (!confirm(`Are you sure you want to delete "${task.title}"?`)) return;

    try {
        await apiRequest(`/api/tasks/${Number(id)}`, {
            method: "DELETE"
        });

        showToast("Task deleted successfully.");
        await loadTasks();
        refreshProjectProgress();

    } catch (error) {
        console.error("Delete task error:", error);
        showToast(error.message || "Unable to delete task.", "error");
    }
}

// =====================================================
// SEARCH / FILTER
// =====================================================

function filterTasks() {
    const search = getValue("taskSearch").trim().toLowerCase();
    const status = getValue("statusFilter").toUpperCase();

    const filtered = tasks.filter(task => {
        const text = [
            task.title,
            task.description,
            task.project_id,
            task.assigned_employee_id
        ].join(" ").toLowerCase();

        return (!search || text.includes(search)) &&
            (!status || taskStatus(task) === status);
    });

    renderTasks(filtered);
}

// =====================================================
// CSV EXPORT
// =====================================================

function exportTasks() {
    if (!tasks.length) {
        showToast("No tasks to export.", "error");
        return;
    }

    const headers = [
        "ID", "Title", "Project ID", "Employee ID",
        "Status", "Priority", "Start Date", "Deadline", "Description"
    ];

    const rows = tasks.map(task => [
        task.id, task.title, task.project_id ?? "",
        task.assigned_employee_id ?? "", taskStatus(task),
        task.priority ?? "", task.start_date ?? "",
        task.deadline ?? "", task.description ?? ""
    ]);

    const csv = [headers, ...rows].map(row =>
        row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `orbit-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// =====================================================
// SIDEBAR
// =====================================================

function toggleSidebar() {
    document.getElementById("sidebar")?.classList.toggle("open");
}

// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener("DOMContentLoaded", () => {
    loadTasks();

    document.getElementById("taskForm")
        ?.addEventListener("submit", saveTask);

    document.getElementById("taskSearch")
        ?.addEventListener("input", filterTasks);

    document.getElementById("statusFilter")
        ?.addEventListener("change", filterTasks);

    document.getElementById("taskModal")
        ?.addEventListener("click", event => {
            if (event.target.id === "taskModal") closeTaskModal();
        });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeTaskModal();
    });
});

// =====================================================
// EXPOSE FUNCTIONS
// =====================================================

Object.assign(window, {
    loadTasks,
    openTaskModal,
    closeTaskModal,
    editTask,
    deleteTask,
    saveTask,
    exportTasks,
    toggleSidebar,
    filterTasks
});
