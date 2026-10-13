(() => {
    "use strict";

    const API_ROOT = (() => {
        if (typeof API_BASE_URL !== "undefined") {
            return String(API_BASE_URL).replace(/\/+$/, "");
        }

        if (typeof API_BASE !== "undefined") {
            return String(API_BASE).replace(/\/+$/, "");
        }

        if (typeof API_URL !== "undefined") {
            return String(API_URL).replace(/\/+$/, "");
        }

        return "http://127.0.0.1:8000";
    })();

    const ENDPOINT = `${API_ROOT}/api/notifications`;
    const PAGE_SIZE = 20;

    const state = {
        filter: "all",
        search: "",
        offset: 0,
        total: 0,
        unreadCount: 0,
        items: [],
        loading: false
    };

    const el = {};
    let toastTimeout;

    document.addEventListener("DOMContentLoaded", init);

    function init() {
        el.list = document.getElementById("notifications");
        el.total = document.getElementById("totalCount");
        el.unread = document.getElementById("unreadCount");
        el.read = document.getElementById("readCount");
        el.sidebarUnread = document.getElementById("sidebarUnread");
        el.status = document.getElementById("notificationStatus");
        el.pagination = document.getElementById("paginationInfo");
        el.previous = document.getElementById("previousButton");
        el.next = document.getElementById("nextButton");
        el.markAll = document.getElementById("markAllButton");
        el.refresh = document.getElementById("refreshButton");
        el.searches = [
            document.getElementById("workspaceSearch"),
            document.getElementById("notificationSearch")
        ].filter(Boolean);

        if (!el.list) {
            console.error("Orbit Notifications: #notifications element was not found.");
            return;
        }

        bindEvents();

        if (!getToken()) {
            showState(
                "Login required",
                "Please log in to view your notifications.",
                "🔐"
            );
            setStatus("No login token was found.");

            return;
        }

        loadNotifications();
    }

    // ---------------------------------------------------------
    // EVENTS
    // ---------------------------------------------------------

    function bindEvents() {
        document.querySelectorAll("[data-filter]").forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.filter || "all";
                state.offset = 0;

                document.querySelectorAll("[data-filter]").forEach(item => {
                    item.classList.toggle("active", item === button);
                    item.setAttribute(
                        "aria-pressed",
                        item === button ? "true" : "false"
                    );
                });

                loadNotifications();
            });
        });

        el.refresh?.addEventListener("click", loadNotifications);
        el.markAll?.addEventListener("click", markAllAsRead);

        el.previous?.addEventListener("click", () => {
            state.offset = Math.max(0, state.offset - PAGE_SIZE);
            loadNotifications();
        });

        el.next?.addEventListener("click", () => {
            if (state.offset + PAGE_SIZE < state.total) {
                state.offset += PAGE_SIZE;
                loadNotifications();
            }
        });

        // Keep both search fields synchronized.
        el.searches.forEach(searchInput => {
            searchInput.addEventListener("input", event => {
                state.search = event.target.value.trim().toLowerCase();

                el.searches.forEach(otherInput => {
                    if (otherInput !== event.target) {
                        otherInput.value = event.target.value;
                    }
                });

                renderNotifications();
            });
        });

        // Event delegation for notification actions.
        el.list.addEventListener("click", async event => {
            const button = event.target.closest("[data-action]");

            if (!button || !el.list.contains(button)) {
                return;
            }

            const id = Number(button.dataset.id);
            const action = button.dataset.action;

            if (!Number.isInteger(id) || id <= 0) {
                return;
            }

            if (button.disabled) {
                return;
            }

            if (action === "read") {
                await markAsRead(id);
            }

            if (action === "delete") {
                await deleteNotification(id);
            }
        });

        document.getElementById("menuToggle")?.addEventListener("click", () => {
            document.getElementById("sidebar")?.classList.toggle("open");
        });

        document.getElementById("logoutButton")?.addEventListener("click", event => {
            event.preventDefault();

            localStorage.removeItem("orbit_token");
            window.location.href = "../login.html";
        });
    }

    // ---------------------------------------------------------
    // AUTHENTICATION AND API
    // ---------------------------------------------------------

    function getToken() {
        return localStorage.getItem("orbit_token");
    }

    async function apiRequest(path = "", options = {}) {
        const token = getToken();

        if (!token) {
            throw new Error("Your session has expired. Please log in again.");
        }

        const headers = {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        const response = await fetch(`${ENDPOINT}${path}`, {
            ...options,
            headers
        });

        let data = null;

        try {
            data = await response.json();
        } catch {
            // The response may have no JSON body.
        }

        if (response.status === 401) {
            localStorage.removeItem("orbit_token");
            throw new Error("Your session has expired. Please log in again.");
        }

        if (!response.ok) {
            throw new Error(
                data?.detail ||
                data?.message ||
                `Request failed (${response.status})`
            );
        }

        return data;
    }

    // ---------------------------------------------------------
    // LOAD NOTIFICATIONS
    // ---------------------------------------------------------

    async function loadNotifications() {
        if (state.loading) {
            return;
        }

        state.loading = true;

        setStatus("Loading notifications...");

        if (el.refresh) el.refresh.disabled = true;

        el.list.innerHTML = `
            <div class="notification-state">
                <div class="notification-state-icon">⏳</div>
                <h3>Loading notifications</h3>
                <p>Please wait while we retrieve your notifications.</p>
            </div>
        `;

        try {
            const params = new URLSearchParams({
                filter: state.filter,
                limit: String(PAGE_SIZE),
                offset: String(state.offset)
            });

            const result = await apiRequest(`?${params.toString()}`);

            state.items = Array.isArray(result.items)
                ? result.items
                : Array.isArray(result)
                    ? result
                    : [];

            state.total = Number(result.total ?? state.items.length);

            state.unreadCount = Number(
                result.unread_count ??
                state.items.filter(item => !item.is_read).length
            );

            updateSummary();
            renderNotifications();
            updatePagination();

            setStatus(
                state.total
                    ? `${state.total} notification(s) in this filter.`
                    : "No notifications found."
            );

        } catch (error) {
            showState(
                "Unable to load notifications",
                error.message || "Check your backend connection.",
                "⚠️"
            );

            setStatus("Could not load notifications.");
            showToast(error.message, true);

        } finally {
            state.loading = false;

            if (el.refresh) {
                el.refresh.disabled = false;
            }
        }
    }

    async function refreshUnreadCount() {
        try {
            const result = await apiRequest("/unread-count");

            state.unreadCount = Number(result.unread_count || 0);

            updateSummary();
        } catch (error) {
            console.warn("Could not refresh unread count:", error.message);
        }
    }

    // ---------------------------------------------------------
    // SUMMARY CARDS AND BADGES
    // ---------------------------------------------------------

    function updateSummary() {
        if (el.total) {
            el.total.textContent = String(state.total);
        }

        if (el.unread) {
            el.unread.textContent = String(state.unreadCount);
        }

        if (el.read) {
            el.read.textContent = String(
                Math.max(0, state.total - state.unreadCount)
            );
        }

        if (el.sidebarUnread) {
            el.sidebarUnread.textContent =
                state.unreadCount > 99
                    ? "99+"
                    : state.unreadCount > 0
                        ? String(state.unreadCount)
                        : "";

            el.sidebarUnread.style.display =
                state.unreadCount > 0 ? "inline-flex" : "none";
        }

        if (el.markAll) {
            el.markAll.disabled = state.unreadCount === 0;
        }
    }

    // ---------------------------------------------------------
    // RENDER NOTIFICATIONS
    // ---------------------------------------------------------

    function renderNotifications() {
        const search = state.search;

        const items = state.items.filter(item => {
            if (!search) return true;

            const searchableText = [
                item.title,
                item.message,
                item.type
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return searchableText.includes(search);
        });

        if (!items.length) {
            showState(
                search
                    ? "No matching notifications"
                    : "You're all caught up",
                search
                    ? "Try a different search term."
                    : state.filter === "unread"
                        ? "There are no unread notifications."
                        : "Notifications will appear here when events occur.",
                "🔔"
            );

            return;
        }

        el.list.innerHTML = items.map(item => {
            const unread = !item.is_read;
            const type = normalizeType(item.type);
            const id = Number(item.id);

            return `
                <article class="notification-card ${unread ? "unread" : ""}">
                    <div class="notification-icon ${type.css}">
                        ${type.icon}
                    </div>

                    <div class="notification-body">
                        <div class="notification-title-row">
                            ${
                                unread
                                    ? '<span class="notification-unread-dot" aria-label="Unread"></span>'
                                    : ""
                            }

                            <h3 class="notification-title">
                                ${escapeHTML(item.title || "Notification")}
                            </h3>
                        </div>

                        <p class="notification-message">
                            ${escapeHTML(item.message || "")}
                        </p>

                        <span class="notification-meta">
                            ${escapeHTML(formatDate(item.created_at))}
                            · ${escapeHTML(type.label)}
                            · ${unread ? "Unread" : "Read"}
                        </span>
                    </div>

                    <div class="notification-actions">
                        ${
                            unread
                                ? `
                                    <button
                                        type="button"
                                        class="notification-action"
                                        data-action="read"
                                        data-id="${id}">
                                        ✓ Mark read
                                    </button>
                                `
                                : ""
                        }

                        <button
                            type="button"
                            class="notification-action delete"
                            data-action="delete"
                            data-id="${id}">
                            Delete
                        </button>
                    </div>
                </article>
            `;
        }).join("");
    }

    function normalizeType(value) {
        const raw = String(value || "system").toLowerCase();

        if (raw.includes("project")) {
            return {
                css: "project",
                icon: "📁",
                label: "Project"
            };
        }

        if (raw.includes("task") || raw.includes("deadline")) {
            return {
                css: "task",
                icon: "✓",
                label: "Task"
            };
        }

        if (raw.includes("inventory") || raw.includes("stock")) {
            return {
                css: "inventory",
                icon: "▤",
                label: "Inventory"
            };
        }

        if (raw.includes("chat") || raw.includes("message")) {
            return {
                css: "chat",
                icon: "💬",
                label: "Chat"
            };
        }

        if (raw.includes("employee") || raw.includes("team")) {
            return {
                css: "employee",
                icon: "♙",
                label: "Organization"
            };
        }

        return {
            css: "system",
            icon: "🔔",
            label: "System"
        };
    }

    // ---------------------------------------------------------
    // MARK ONE AS READ
    // ---------------------------------------------------------

    async function markAsRead(id) {
        try {
            await apiRequest(`/${id}/read`, {
                method: "PATCH"
            });

            showToast("Notification marked as read.");

            await loadNotifications();
            await refreshUnreadCount();

        } catch (error) {
            showToast(error.message, true);
        }
    }

    // ---------------------------------------------------------
    // MARK ALL AS READ
    // ---------------------------------------------------------

    async function markAllAsRead() {
        if (state.unreadCount === 0) {
            return;
        }

        if (el.markAll) {
            el.markAll.disabled = true;
        }

        try {
            const result = await apiRequest("/read-all", {
                method: "PATCH"
            });

            showToast(
                `${Number(result.updated_count || 0)} notification(s) marked as read.`
            );

            await loadNotifications();
            await refreshUnreadCount();

        } catch (error) {
            showToast(error.message, true);

        } finally {
            if (el.markAll) {
                el.markAll.disabled = state.unreadCount === 0;
            }
        }
    }

    // ---------------------------------------------------------
    // DELETE NOTIFICATION
    // ---------------------------------------------------------

    async function deleteNotification(id) {
        if (!window.confirm("Are you sure you want to delete this notification?")) {
            return;
        }

        try {
            await apiRequest(`/${id}`, {
                method: "DELETE"
            });

            showToast("Notification deleted.");

            if (state.offset > 0 && state.items.length === 1) {
                state.offset = Math.max(0, state.offset - PAGE_SIZE);
            }

            await loadNotifications();
            await refreshUnreadCount();

        } catch (error) {
            showToast(error.message, true);
        }
    }

    // ---------------------------------------------------------
    // PAGINATION
    // ---------------------------------------------------------

    function updatePagination() {
        const start = state.total === 0 ? 0 : state.offset + 1;
        const end = Math.min(state.offset + PAGE_SIZE, state.total);

        if (el.pagination) {
            el.pagination.textContent = state.total > 0
                ? `Showing ${start}–${end} of ${state.total}`
                : "No notifications";
        }

        if (el.previous) {
            el.previous.disabled = state.offset === 0;
        }

        if (el.next) {
            el.next.disabled =
                state.offset + PAGE_SIZE >= state.total;
        }
    }

    // ---------------------------------------------------------
    // EMPTY AND ERROR STATES
    // ---------------------------------------------------------

    function showState(title, message, icon = "🔔") {
        el.list.innerHTML = `
            <div class="notification-state">
                <div class="notification-state-icon">
                    ${icon}
                </div>

                <h3>${escapeHTML(title)}</h3>
                <p>${escapeHTML(message)}</p>
            </div>
        `;

        if (el.pagination) {
            el.pagination.textContent = "";
        }

        if (el.previous) {
            el.previous.disabled = true;
        }

        if (el.next) {
            el.next.disabled = true;
        }
    }

    function setStatus(message) {
        if (el.status) {
            el.status.textContent = message;
        }
    }

    // ---------------------------------------------------------
    // DATE AND HTML HELPERS
    // ---------------------------------------------------------

    function formatDate(value) {
        if (!value) {
            return "Date unavailable";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit"
        });
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    // ---------------------------------------------------------
    // TOAST MESSAGES
    // ---------------------------------------------------------

    function showToast(message, isError = false) {
        const toast = document.getElementById("toast");

        if (!toast) {
            console.log(message);
            return;
        }

        clearTimeout(toastTimeout);

        toast.textContent = message;
        toast.classList.remove("error", "show");

        if (isError) {
            toast.classList.add("error");
        }

        toast.classList.add("show");

        toastTimeout = setTimeout(() => {
            toast.classList.remove("show", "error");
        }, 3500);
    }
})();