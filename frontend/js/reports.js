
document.addEventListener("DOMContentLoaded", () => {
    loadReports();
});

// ============================================================
// LOAD ALL REPORTS
// ============================================================

async function loadReports() {
    setLoading();

    try {
        if (
            typeof apiGet !== "function"
        ) {
            throw new Error(
                "apiGet() is not defined. Load ../js/api.js before reports.js."
            );
        }

        const [
            employeesResponse,
            projectsResponse,
            tasksResponse,
            inventoryResponse
        ] = await Promise.all([
            apiGet("/api/employees"),
            apiGet("/api/reports/projects"),
            apiGet("/api/reports/tasks"),
            apiGet("/api/reports/inventory")
        ]);

        const employees = normalizeList(employeesResponse);

        // These three endpoints return aggregated counts, not entity lists.
        const projects = normalizeCounts(
            projectsResponse?.by_status
        );

        const tasks = normalizeCounts(
            tasksResponse?.by_status
        );

        const inventory = normalizeCounts(
            inventoryResponse?.by_status
        );

        renderEmployees(employees);
        renderProjects(projects);
        renderTasks(tasks);
        renderInventory(inventory);

        updateKPIs(employees, projects, tasks, inventory);

        const lastUpdated = document.getElementById("lastUpdated");

        if (lastUpdated) {
            lastUpdated.textContent = new Date().toLocaleString("en-IN");
        }

    } catch (error) {
        console.error("Reports loading error:", error);

        const message = error.message || "Unable to load reports.";

        showError("employeeReport", 5, message);
        showError("projectReport", 3, message);
        showError("taskReport", 3, message);
        showError("inventoryReport", 5, message);
    }
}

// ============================================================
// NORMALIZE LIST RESPONSES
// ============================================================

function normalizeList(response) {
    if (Array.isArray(response)) return response;

    if (Array.isArray(response?.items)) return response.items;

    if (Array.isArray(response?.employees)) return response.employees;

    if (Array.isArray(response?.data)) return response.data;

    if (Array.isArray(response?.results)) return response.results;

    return [];
}

// ============================================================
// NORMALIZE AGGREGATED COUNTS
// Example: { IN_PROGRESS: 4, COMPLETED: 7 }
// ============================================================

function normalizeCounts(counts) {
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
        return [];
    }

    return Object.entries(counts).map(([status, count]) => ({
        status: status || "UNKNOWN",
        count: Number(count) || 0
    }));
}

// ============================================================
// EMPLOYEES
// ============================================================

function renderEmployees(employees) {
    const tbody = document.getElementById("employeeReport");
    if (!tbody) return;

    if (!employees.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="report-empty">
                    No employee data available.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = employees.map(employee => {
        const name = employee.name ||
            [employee.first_name, employee.last_name]
                .filter(Boolean).join(" ") ||
            employee.full_name || "—";

        const email = employee.email || "—";
        const role = employee.role || employee.role_name ||
            employee.designation || "—";
        const department = employee.department || "—";
        const status = employee.status || "ACTIVE";

        return `
            <tr>
                <td><strong>${escapeHtml(name)}</strong></td>
                <td>${escapeHtml(email)}</td>
                <td>${escapeHtml(role)}</td>
                <td>${escapeHtml(department)}</td>
                <td>
                    <span class="status ${statusClass(status)}">
                        ${escapeHtml(status)}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

// ============================================================
// PROJECT STATUS SUMMARY
// ============================================================

function renderProjects(projects) {
    const tbody = document.getElementById("projectReport");
    if (!tbody) return;

    if (!projects.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="report-empty">
                    No project report data available.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = projects.map(item => `
        <tr>
            <td><strong>${escapeHtml(formatStatus(item.status))}</strong></td>
            <td>
                <span class="status ${statusClass(item.status)}">
                    ${escapeHtml(item.status)}
                </span>
            </td>
            <td><strong>${item.count}</strong></td>
        </tr>
    `).join("");
}

// ============================================================
// TASK STATUS SUMMARY
// ============================================================

function renderTasks(tasks) {
    const tbody = document.getElementById("taskReport");
    if (!tbody) return;

    if (!tasks.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="report-empty">
                    No task report data available.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tasks.map(item => `
        <tr>
            <td><strong>${escapeHtml(formatStatus(item.status))}</strong></td>
            <td>
                <span class="status ${statusClass(item.status)}">
                    ${escapeHtml(item.status)}
                </span>
            </td>
            <td><strong>${item.count}</strong></td>
        </tr>
    `).join("");
}

// ============================================================
// INVENTORY STATUS SUMMARY
// ============================================================

function renderInventory(inventory) {
    const tbody = document.getElementById("inventoryReport");
    if (!tbody) return;

    if (!inventory.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="report-empty">
                    No inventory report data available.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = inventory.map(item => `
        <tr>
            <td><strong>${escapeHtml(formatStatus(item.status))}</strong></td>
            <td>—</td>
            <td>${item.count}</td>
            <td>—</td>
            <td>
                <span class="status ${statusClass(item.status)}">
                    ${escapeHtml(item.status)}
                </span>
            </td>
        </tr>
    `).join("");
}

// ============================================================
// DASHBOARD KPIs
// ============================================================

function updateKPIs(employees, projects, tasks, inventory) {
    setText("totalEmployees", employees.length);

    setText(
        "activeProjects",
        sumCounts(projects, [
            "IN_PROGRESS",
            "ACTIVE"
        ])
    );

    setText(
        "pendingTasks",
        sumCounts(tasks, [
            "TODO",
            "PENDING",
            "IN_PROGRESS",
            "BLOCKED"
        ])
    );

    setText(
        "lowStock",
        sumCounts(inventory, [
            "LOW_STOCK",
            "OUT_OF_STOCK"
        ])
    );
}

function sumCounts(items, statuses) {
    const allowed = new Set(statuses.map(value => value.toUpperCase()));

    return items.reduce((total, item) => {
        return allowed.has(String(item.status).toUpperCase())
            ? total + item.count
            : total;
    }, 0);
}

function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = String(value);
    }
}

// ============================================================
// LOADING STATES
// ============================================================

function setLoading() {
    const tables = [
        ["employeeReport", 5],
        ["projectReport", 3],
        ["taskReport", 3],
        ["inventoryReport", 5]
    ];

    tables.forEach(([id, colspan]) => {
        const tbody = document.getElementById(id);
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="report-empty">
                    Loading report...
                </td>
            </tr>
        `;
    });
}

// ============================================================
// ERROR DISPLAY
// ============================================================

function showError(id, colspan, message) {
    const tbody = document.getElementById(id);
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="${colspan}" class="report-error">
                ${escapeHtml(message)}
            </td>
        </tr>
    `;
}

// ============================================================
// FORMAT STATUS
// ============================================================

function formatStatus(value) {
    return String(value || "UNKNOWN")
        .toLowerCase()
        .split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// ============================================================
// STATUS BADGES
// ============================================================

function statusClass(status) {
    const value = String(status || "").toUpperCase();

    if ([
        "ACTIVE",
        "AVAILABLE",
        "DONE",
        "COMPLETED"
    ].includes(value)) {
        return "active";
    }

    if ([
        "PENDING",
        "TODO",
        "PLANNED",
        "IN_PROGRESS",
        "ON_HOLD",
        "BLOCKED"
    ].includes(value)) {
        return "pending";
    }

    if ([
        "LOW_STOCK",
        "OUT_OF_STOCK",
        "CANCELLED",
        "INACTIVE"
    ].includes(value)) {
        return "low";
    }

    return "normal";
}

// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// OPTIONAL MANUAL REFRESH
// ============================================================

window.loadReports = loadReports;