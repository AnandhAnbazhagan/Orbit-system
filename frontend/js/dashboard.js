
/* =========================================================
   ORBIT SYSTEM — LIVE DASHBOARD
   Uses api.js, requireAuth(), and GET /api/dashboard
========================================================= */

(() => {
    "use strict";

    const REFRESH_INTERVAL = 30000;
    let refreshTimer = null;
    let refreshInProgress = false;

    document.addEventListener("DOMContentLoaded", initializeDashboard);

    async function initializeDashboard() {
        try {
            if (typeof requireAuth !== "function") {
                throw new Error(
                    "requireAuth() is missing. Check frontend/js/api.js."
                );
            }

            const user = await requireAuth();

            if (!user) return;

            renderProfile(user);
            await loadDashboard();

            refreshTimer = window.setInterval(() => {
                if (!document.hidden) loadDashboard();
            }, REFRESH_INTERVAL);

            document.addEventListener("visibilitychange", () => {
                if (!document.hidden) loadDashboard();
            });

        } catch (error) {
            console.error("Dashboard initialization failed:", error);
            showToast(error.message || "Unable to initialize dashboard.");
        }
    }

    /* ---------------- USER PROFILE ---------------- */

    function renderProfile(user) {
        const employee = user.employee || {};

        const name =
            employee.name ||
            [employee.first_name, employee.last_name]
                .filter(Boolean)
                .join(" ") ||
            user.name ||
            user.email ||
            "User";

        const role =
            employee.designation ||
            user.role ||
            "Workspace User";

        setText("welcome", `Welcome back, ${name}`);
        setText("profileName", name);
        setText("profileRole", role);
        setText("profileAvatar", name.trim().charAt(0).toUpperCase() || "U");
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value ?? "";
    }

    /* ---------------- LOAD LIVE DATA ---------------- */

    async function loadDashboard() {
        if (refreshInProgress) return;
        refreshInProgress = true;

        try {
            let data;

            // Use the shared API helper so its authentication headers apply.
            if (typeof apiGet === "function") {
                data = await apiGet("/api/dashboard");
            } else {
                throw new Error(
                    "apiGet() is missing. Check frontend/js/api.js."
                );
            }

            if (!data || typeof data !== "object") {
                throw new Error("The dashboard API returned no usable data.");
            }

            // Support APIs that wrap the result in a "data" property.
            if (data.data && typeof data.data === "object") {
                data = data.data;
            }

            console.log("Live dashboard response:", data);

            const stats = data.stats || data.statistics || {};

            setStat("employees",
                stats.employees ?? stats.total_employees);

            setStat("active_projects",
                stats.active_projects ?? stats.projects_in_progress);

            setStat("pending_tasks",
                stats.pending_tasks ?? stats.todo_tasks);

            setStat("completed_tasks",
                stats.completed_tasks ?? stats.done_tasks);

            setStat("inventory_items",
                stats.inventory_items ?? stats.total_inventory_items);

            setStat("low_stock",
                stats.low_stock ?? stats.low_stock_items);

            renderProjectStatus(
                data.project_status || data.projects_by_status || {}
            );

            renderTaskStatus(
                data.task_status || data.tasks_by_status || {}
            );

            setLiveState(true);

        } catch (error) {
            console.error("Dashboard refresh failed:", error);
            setLiveState(false);

            // Keep the last successfully loaded values instead of
            // replacing them with misleading zeros.
        } finally {
            refreshInProgress = false;
        }
    }

    function setStat(name, value) {
        const element = document.querySelector(`[data-stat="${name}"]`);
        if (!element) return;

        if (value !== undefined && value !== null) {
            element.textContent = Number.isFinite(Number(value))
                ? Number(value).toLocaleString()
                : value;
        }
    }

    /* ---------------- NORMALIZE STATUS KEYS ---------------- */

    function normalizeStatuses(raw) {
        const result = {};

        if (Array.isArray(raw)) {
            raw.forEach(item => {
                if (!item || typeof item !== "object") return;

                const key = item.status ?? item.name;
                const value = item.count ?? item.total ?? item.value;

                if (key != null) {
                    result[normalizeKey(key)] = Number(value) || 0;
                }
            });

            return result;
        }

        Object.entries(raw || {}).forEach(([key, value]) => {
            result[normalizeKey(key)] =
                Number(
                    typeof value === "object" && value !== null
                        ? value.count ?? value.total ?? value.value
                        : value
                ) || 0;
        });

        return result;
    }

    function normalizeKey(value) {
        return String(value)
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");
    }

    function readCount(data, ...keys) {
        for (const key of keys) {
            if (data[key] !== undefined) return data[key];
        }
        return 0;
    }

    /* ---------------- PROJECT STATUS ---------------- */

    function renderProjectStatus(raw) {
        const data = normalizeStatuses(raw);

        const statuses = {
            in_progress: readCount(data, "in_progress", "inprogress"),
            completed: readCount(data, "completed", "done"),
            not_started: readCount(data, "not_started", "planned", "todo"),
            on_hold: readCount(data, "on_hold", "onhold"),
            cancelled: readCount(data, "cancelled", "canceled")
        };

        renderStatusRows("projectChart", [
            { key: "in_progress", label: "In Progress", icon: "I" },
            { key: "completed", label: "Completed", icon: "C" },
            { key: "not_started", label: "Not Started", icon: "N" },
            { key: "on_hold", label: "On Hold", icon: "H" },
            { key: "cancelled", label: "Cancelled", icon: "X" }
        ], statuses);
    }

    /* ---------------- TASK STATUS ---------------- */

    function renderTaskStatus(raw) {
        const data = normalizeStatuses(raw);

        const statuses = {
            pending: readCount(data, "pending", "todo", "to_do"),
            in_progress: readCount(data, "in_progress", "inprogress"),
            completed: readCount(data, "completed", "done"),
            blocked: readCount(data, "blocked")
        };

        renderStatusRows("taskChart", [
            { key: "pending", label: "Pending", icon: "P" },
            { key: "in_progress", label: "In Progress", icon: "I" },
            { key: "completed", label: "Completed", icon: "C" },
            { key: "blocked", label: "Blocked", icon: "B" }
        ], statuses);
    }

    /* ---------------- RENDER STATUS ROWS ---------------- */

    function renderStatusRows(containerId, definitions, statuses) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const total = Object.values(statuses)
            .reduce((sum, value) => sum + (Number(value) || 0), 0);

        container.replaceChildren();

        definitions.forEach(definition => {
            const value = Number(statuses[definition.key]) || 0;
            const percentage = total > 0 ? (value / total) * 100 : 0;

            const row = document.createElement("div");
            row.className = "status-row";

            const icon = document.createElement("div");
            icon.className = "status-icon";
            icon.textContent = definition.icon;

            const content = document.createElement("div");
            content.className = "status-content";

            const header = document.createElement("div");
            header.className = "status-header";

            const label = document.createElement("span");
            label.textContent = definition.label;

            const count = document.createElement("strong");
            count.textContent = value.toLocaleString();

            header.append(label, count);

            const track = document.createElement("div");
            track.className = "progress-track";

            const fill = document.createElement("div");
            fill.className = "progress-fill";
            fill.style.width = `${percentage}%`;
            fill.title = `${value} of ${total}`;

            track.appendChild(fill);
            content.append(header, track);
            row.append(icon, content);
            container.appendChild(row);
        });
    }

    /* ---------------- LIVE STATUS INDICATOR ---------------- */

    function setLiveState(isLive) {
        document.querySelectorAll(".live-badge").forEach(badge => {
            badge.style.background = isLive ? "#ecfdf5" : "#fff7ed";
            badge.style.color = isLive ? "#047857" : "#c2410c";

            const dot = badge.querySelector(".live-dot");
            if (dot) dot.style.background = isLive ? "#10b981" : "#f97316";

            // Keep the existing badge text and indicate connection state.
            badge.title = isLive
                ? "Dashboard data loaded successfully"
                : "Refresh failed. Showing the last available data.";
        });
    }

    function showToast(message) {
        const toast = document.getElementById("toast");

        if (toast) {
            toast.textContent = message;
            toast.classList.add("show");

            window.setTimeout(() => {
                toast.classList.remove("show");
            }, 4000);
        } else {
            console.warn(message);
        }
    }

})();