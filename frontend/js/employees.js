const EMPLOYEE_API_ENDPOINT = "/api/employees";

let employees = [];
let editingEmployeeId = null;

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("addEmployeeButton")
        ?.addEventListener("click", openAddEmployeeModal);

    document.getElementById("closeEmployeeModal")
        ?.addEventListener("click", closeEmployeeModal);

    document.getElementById("cancelEmployeeButton")
        ?.addEventListener("click", closeEmployeeModal);

    document.getElementById("employeeForm")
        ?.addEventListener("submit", handleEmployeeSubmit);

    document.getElementById("employeeSearch")
        ?.addEventListener("input", renderEmployees);

    document.getElementById("statusFilter")
        ?.addEventListener("change", renderEmployees);

    document.getElementById("exportButton")
        ?.addEventListener("click", exportEmployees);

    document.addEventListener("click", handleEmployeeAction);

    loadEmployees();
});

// ============================================================
// API HELPERS
// Uses api.js if available; otherwise makes requests directly.
// ============================================================

function employeeApiUrl(path) {
    const base = typeof getApiBaseUrl === "function"
        ? getApiBaseUrl()
        : (window.API_BASE_URL || "http://127.0.0.1:8000");

    return `${base.replace(/\/$/, "")}${path}`;
}

function employeeToken() {
    if (typeof getAuthToken === "function") {
        return getAuthToken();
    }

    return localStorage.getItem("orbit_token")
        || localStorage.getItem("access_token")
        || localStorage.getItem("token")
        || "";
}

async function employeeRequest(path, options = {}) {
    if (typeof apiRequest === "function") {
        return apiRequest(path, options);
    }

    const headers = {
        Accept: "application/json",
        ...(options.headers || {})
    };

    const token = employeeToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (
        options.body &&
        !(options.body instanceof FormData) &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] = "application/json";
    }

    let response;

    try {
        response = await fetch(employeeApiUrl(path), {
            ...options,
            headers
        });
    } catch {
        throw new Error(
            "Cannot connect to Orbit API. Start FastAPI on port 8000."
        );
    }

    const text = await response.text();
    let result = null;

    if (text) {
        try {
            result = JSON.parse(text);
        } catch {
            result = { detail: text };
        }
    }

    if (!response.ok) {
        const detail = result?.detail;

        const message = Array.isArray(detail)
            ? detail.map(item => item.msg || JSON.stringify(item)).join(", ")
            : typeof detail === "string"
                ? detail
                : detail
                    ? JSON.stringify(detail)
                    : `Request failed (${response.status}).`;

        throw new Error(message);
    }

    return result;
}

async function getEmployeesFromApi() {
    return employeeRequest(EMPLOYEE_API_ENDPOINT);
}

async function createEmployeeInApi(payload) {
    return employeeRequest(EMPLOYEE_API_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
    });
}

async function updateEmployeeAccountInApi(employeeId, payload) {
    return employeeRequest(
        `${EMPLOYEE_API_ENDPOINT}/${encodeURIComponent(employeeId)}/account`,
        {
            method: "PUT",
            body: JSON.stringify(payload)
        }
    );
}

// ============================================================
// LOAD EMPLOYEES
// ============================================================

async function loadEmployees() {
    const tableBody = document.getElementById("tableBody");

    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="table-message">
                    Loading employees...
                </td>
            </tr>`;
    }

    try {
        const response = await getEmployeesFromApi();

        employees = Array.isArray(response)
            ? response
            : response?.items || response?.employees || [];

        renderEmployees();
        updateEmployeeCounts();
    } catch (error) {
        console.error("Unable to load employees:", error);

        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="table-message">
                        ${escapeHtml(error.message)}
                    </td>
                </tr>`;
        }

        showToast(error.message);
    }
}

// ============================================================
// RENDER EMPLOYEE TABLE
// ============================================================

function renderEmployees() {
    const tableBody = document.getElementById("tableBody");
    if (!tableBody) return;

    const searchValue = (
        document.getElementById("employeeSearch")?.value || ""
    ).trim().toLowerCase();

    const selectedStatus = (
        document.getElementById("statusFilter")?.value || ""
    ).trim().toUpperCase();

    const filteredEmployees = employees.filter(employee => {
        const name = getEmployeeName(employee);

        const searchableText = [
            employee.id,
            employee.employee_id,
            name,
            employee.email,
            employee.department,
            employee.designation,
            employee.role_name,
            employee.role
        ].filter(Boolean).join(" ").toLowerCase();

        const status = String(employee.status || "ACTIVE").toUpperCase();

        return searchableText.includes(searchValue)
            && (!selectedStatus || status === selectedStatus);
    });

    if (!filteredEmployees.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="table-message">
                    No employees found.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filteredEmployees.map(employee => {
        const status = String(employee.status || "ACTIVE").toUpperCase();
        const role = employee.role_name || employee.role || "EMPLOYEE";

        return `
            <tr>
                <td>${escapeHtml(employee.employee_id ?? "—")}</td>
                <td>
                    <div class="employee-name-cell">
                        <span class="employee-avatar">
                            ${escapeHtml(getInitials(getEmployeeName(employee)))}
                        </span>
                        <span>${escapeHtml(getEmployeeName(employee))}</span>
                    </div>
                </td>
                <td>${escapeHtml(employee.email ?? "—")}</td>
                <td>${escapeHtml(employee.department ?? "—")}</td>
                <td>${escapeHtml(employee.designation ?? "—")}</td>
                <td>${escapeHtml(role)}</td>
                <td>
                    <span class="status-badge status-${escapeHtml(status.toLowerCase())}">
                        ${escapeHtml(status)}
                    </span>
                </td>
                <td>${escapeHtml(formatDate(employee.joining_date))}</td>
                <td>
                    <div class="employee-actions">
                        <button type="button"
                            class="action-btn view-btn"
                            data-action="view"
                            data-employee-id="${escapeHtml(employee.id)}"
                            title="View employee"
                            aria-label="View employee">
                            <span aria-hidden="true">👁</span>
                        </button>

                        <button type="button"
                            class="action-btn edit-btn"
                            data-action="edit"
                            data-employee-id="${escapeHtml(employee.id)}"
                            title="Edit account email/password"
                            aria-label="Edit account">
                            <span aria-hidden="true">✏️</span>
                        </button>

                        <button type="button"
                            class="action-btn status-btn"
                            data-action="toggle-status"
                            data-employee-id="${escapeHtml(employee.id)}"
                            title="${status === "ACTIVE" ? "Deactivate employee" : "Activate employee"}"
                            aria-label="${status === "ACTIVE" ? "Deactivate employee" : "Activate employee"}">
                            <span aria-hidden="true">${status === "ACTIVE" ? "⏸" : "▶"}</span>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join("");
}

// ============================================================
// EMPLOYEE ACTIONS
// ============================================================

async function handleEmployeeAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const employeeId = button.dataset.employeeId;
    const action = button.dataset.action;

    if (!employeeId) return;

    if (action === "view") {
        viewEmployee(employeeId);
    } else if (action === "edit") {
        await editEmployeeAccount(employeeId);
    } else if (action === "toggle-status") {
        await toggleEmployeeStatus(employeeId);
    }
}

// ============================================================
// VIEW EMPLOYEE
// ============================================================

function viewEmployee(employeeId) {
    const employee = employees.find(
        item => String(item.id) === String(employeeId)
    );

    if (!employee) {
        showToast("Employee not found.");
        return;
    }

    const details = [
        ["Employee ID", employee.employee_id || employee.id],
        ["Name", getEmployeeName(employee)],
        ["Email", employee.email],
        ["Phone", employee.phone],
        ["Department", employee.department],
        ["Designation", employee.designation],
        ["Role", employee.role_name || employee.role || "EMPLOYEE"],
        ["Status", employee.status || "ACTIVE"],
        ["Joining Date", formatDate(employee.joining_date)],
        ["Employment Type", employee.employment_type]
    ];

    let modal = document.getElementById("employeeViewModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "employeeViewModal";
        modal.className = "employee-view-overlay";

        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <section class="employee-view-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employeeViewTitle">

            <div class="employee-view-header">
                <div>
                    <h2 id="employeeViewTitle">Employee Details</h2>
                    <p>${escapeHtml(getEmployeeName(employee))}</p>
                </div>
                <button type="button"
                    class="employee-view-close"
                    aria-label="Close dialog">✕</button>
            </div>

            <div class="employee-view-details">
                ${details.map(([label, value]) => `
                    <div class="employee-detail">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(value || "—")}</strong>
                    </div>
                `).join("")}
            </div>

            <div class="employee-view-footer">
                <button type="button"
                    class="employee-view-close employee-view-done">
                    Close
                </button>
            </div>
        </section>`;

    modal.style.display = "flex";

    modal.querySelectorAll(".employee-view-close").forEach(button => {
        button.addEventListener("click", () => {
            modal.style.display = "none";
        });
    });

    modal.onclick = event => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    };
}

// ============================================================
// EDIT EMPLOYEE ACCOUNT
// ============================================================

async function editEmployeeAccount(employeeId) {
    const employee = employees.find(
        item => String(item.id) === String(employeeId)
    );

    if (!employee) {
        showToast("Employee not found.");
        return;
    }

    const emailInput = prompt(
        "Enter the new email address:",
        employee.email || ""
    );

    if (emailInput === null) return;

    const email = emailInput.trim().toLowerCase();

    if (!isValidEmail(email)) {
        showToast("Please enter a valid email address.");
        return;
    }

    const changePassword = confirm(
        "Do you also want to change this employee's password?"
    );

    const payload = { email };

    if (changePassword) {
        const password = prompt(
            "Enter the new password (minimum 8 characters):"
        );

        if (password === null) return;

        if (password.length < 8) {
            showToast("Password must contain at least 8 characters.");
            return;
        }

        if (new TextEncoder().encode(password).length > 72) {
            showToast("Password must not exceed 72 UTF-8 bytes.");
            return;
        }

        const confirmation = prompt("Confirm the new password:");

        if (confirmation === null) return;

        if (password !== confirmation) {
            showToast("Passwords do not match.");
            return;
        }

        payload.password = password;
    }

    if (!confirm(`Save account changes for ${getEmployeeName(employee)}?`)) {
        return;
    }

    try {
        await updateEmployeeAccountInApi(employee.id, payload);
        showToast("Employee account updated successfully.");
        await loadEmployees();
    } catch (error) {
        console.error("Account update failed:", error);
        showToast(error.message);
    }
}

// ============================================================
// ACTIVATE / DEACTIVATE EMPLOYEE
// Backend: POST /api/employees/{id}/activate
//          POST /api/employees/{id}/deactivate
// ============================================================

async function toggleEmployeeStatus(employeeId) {
    const employee = employees.find(
        item => String(item.id) === String(employeeId)
    );

    if (!employee) {
        showToast("Employee not found.");
        return;
    }

    const isActive =
        String(employee.status || "ACTIVE").toUpperCase() === "ACTIVE";

    const action = isActive ? "deactivate" : "activate";

    if (!confirm(
        `${action === "deactivate" ? "Deactivate" : "Activate"} ${getEmployeeName(employee)}?`
    )) {
        return;
    }

    try {
        await employeeRequest(
            `${EMPLOYEE_API_ENDPOINT}/${encodeURIComponent(employee.id)}/${action}`,
            { method: "POST" }
        );

        showToast(
            `Employee ${action === "activate" ? "activated" : "deactivated"} successfully.`
        );

        await loadEmployees();
    } catch (error) {
        console.error("Employee status update failed:", error);
        showToast(error.message);
    }
}

// ============================================================
// ADD EMPLOYEE MODAL
// ============================================================

function openAddEmployeeModal() {
    const modal = document.getElementById("employeeModal");
    const form = document.getElementById("employeeForm");

    if (!modal) {
        showToast("Employee form modal was not found.");
        return;
    }

    editingEmployeeId = null;
    form?.reset();
    setFormError("");

    const title = modal.querySelector(".modal-title, h2, h3");

    if (title) title.textContent = "Add Employee";

    modal.style.display = "flex";
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
}

function closeEmployeeModal() {
    const modal = document.getElementById("employeeModal");

    if (modal) {
        modal.style.display = "none";
        modal.classList.remove("active");
        modal.setAttribute("aria-hidden", "true");
    }

    editingEmployeeId = null;
    setFormError("");
}

// ============================================================
// CREATE EMPLOYEE
// ============================================================

async function handleEmployeeSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form) return;

    const formData = new FormData(form);

    const password = String(formData.get("password") || "");
    const confirmPassword = String(
        formData.get("confirm_password") || ""
    );

    if (password.length < 8) {
        setFormError("Password must contain at least 8 characters.");
        return;
    }

    if (new TextEncoder().encode(password).length > 72) {
        setFormError("Password must not exceed 72 UTF-8 bytes.");
        return;
    }

    if (password !== confirmPassword) {
        setFormError("Passwords do not match. Please confirm the password.");
        return;
    }

    const email = String(formData.get("email") || "")
        .trim().toLowerCase();

    if (!isValidEmail(email)) {
        setFormError("Please enter a valid email address.");
        return;
    }

    const fullName = String(formData.get("name") || "").trim();
    const nameParts = fullName.split(/\s+/).filter(Boolean);

    const payload = {
        employee_id: String(formData.get("employee_id") || "").trim(),
        first_name: nameParts.shift() || "",
        last_name: nameParts.join(" "),
        email,
        phone: optionalFormValue(formData, "phone"),
        department: optionalFormValue(formData, "department"),
        designation: optionalFormValue(formData, "designation"),
        joining_date: optionalFormValue(formData, "joining_date"),
        role_name: String(
            formData.get("role_name") ||
            formData.get("role") ||
            "EMPLOYEE"
        ).trim().toUpperCase(),
        reporting_manager_id: optionalInteger(
            formData.get("reporting_manager_id")
        ),
        employment_type: optionalFormValue(formData, "employment_type"),
        password,
        confirm_password: confirmPassword,
        profile_image: optionalFormValue(formData, "profile_image"),
        status: String(formData.get("status") || "ACTIVE")
            .trim().toUpperCase()
    };

    const saveButton = document.getElementById("saveEmployeeButton");

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";
    }

    try {
        await createEmployeeInApi(payload);

        showToast("Employee created successfully.");
        closeEmployeeModal();
        form.reset();

        await loadEmployees();
    } catch (error) {
        console.error("Unable to create employee:", error);
        setFormError(error.message);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "Save Employee";
        }
    }
}

// ============================================================
// EXPORT EMPLOYEES TO CSV
// ============================================================

function exportEmployees() {
    const rows = [
        [
            "Employee ID",
            "First Name",
            "Last Name",
            "Email",
            "Department",
            "Designation",
            "Role",
            "Status",
            "Joining Date"
        ],
        ...employees.map(employee => [
            employee.employee_id,
            employee.first_name,
            employee.last_name,
            employee.email,
            employee.department,
            employee.designation,
            employee.role_name || employee.role,
            employee.status,
            employee.joining_date
        ])
    ];

    const csv = rows.map(row =>
        row.map(value => {
            let safeValue = String(value ?? "");

            // Reduce the risk of spreadsheet formula injection.
            if (/^[=+\-@\t\r]/.test(safeValue)) {
                safeValue = "'" + safeValue;
            }

            return `"${safeValue.replace(/"/g, '""')}"`;
        }).join(",")
    ).join("\r\n");

    const blob = new Blob(
        ["\uFEFF", csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "orbit-employees.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

// ============================================================
// EMPLOYEE COUNTS
// Optional dashboard counters; ignored when elements are absent.
// ============================================================

function updateEmployeeCounts() {
    const total = employees.length;

    const active = employees.filter(
        employee =>
            String(employee.status || "ACTIVE").toUpperCase() === "ACTIVE"
    ).length;

    const inactive = total - active;

    const counters = {
        totalEmployees: total,
        activeEmployees: active,
        inactiveEmployees: inactive
    };

    Object.entries(counters).forEach(([id, value]) => {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = String(value);
        }
    });
}

// ============================================================
// UTILITIES
// ============================================================

function getEmployeeName(employee) {
    return [
        employee.first_name,
        employee.last_name
    ].filter(Boolean).join(" ") || employee.name || "Unnamed Employee";
}

function getInitials(name) {
    return String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("") || "?";
}

function formatDate(value) {
    if (!value) return "—";

    const date = String(value).split("T")[0];

    return date;
}

function optionalFormValue(formData, name) {
    const value = String(formData.get(name) || "").trim();
    return value || null;
}

function optionalInteger(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const number = Number(value);

    return Number.isInteger(number) ? number : null;
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function setFormError(message) {
    const errorElement = document.getElementById("employeeFormError");
    const passwordError = document.getElementById("passwordError");

    if (errorElement) {
        errorElement.textContent = message || "";
        errorElement.style.display = message ? "block" : "none";
    }

    if (passwordError) {
        const isPasswordError =
            Boolean(message) && message.toLowerCase().includes("password");

        passwordError.textContent = isPasswordError ? message : "";
        passwordError.style.display = isPasswordError ? "block" : "none";
    }
}

function showToast(message) {
    if (
        typeof window.showToast === "function" &&
        window.showToast !== showToast
    ) {
        window.showToast(message);
        return;
    }

    let toast = document.getElementById("employeeToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "employeeToast";
        toast.setAttribute("role", "status");

        Object.assign(toast.style, {
            position: "fixed",
            right: "24px",
            bottom: "24px",
            zIndex: "99999",
            maxWidth: "min(420px, calc(100vw - 32px))",
            padding: "14px 18px",
            borderRadius: "12px",
            background: "#191f3b",
            color: "#ffffff",
            boxShadow: "0 8px 28px rgba(0,0,0,.18)",
            fontSize: "14px"
        });

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.display = "block";

    clearTimeout(toast._hideTimer);

    toast._hideTimer = setTimeout(() => {
        toast.style.display = "none";
    }, 4000);
}

// ============================================================
// ACTION BUTTON AND VIEW MODAL STYLES
// Injected here so this remains a single JavaScript file.
// ============================================================

(function addEmployeeStyles() {
    if (document.getElementById("orbitEmployeeActionStyles")) return;

    const style = document.createElement("style");
    style.id = "orbitEmployeeActionStyles";

    style.textContent = `
        .employee-actions {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            white-space: nowrap;
        }

        .action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            padding: 0;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            background: #fff;
            color: #475569;
            font-size: 16px;
            cursor: pointer;
            transition: all .2s ease;
        }

        .action-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(15,23,42,.10);
        }

        .view-btn:hover {
            color: #2563eb;
            background: #eff6ff;
            border-color: #bfdbfe;
        }

        .edit-btn:hover {
            color: #7c3aed;
            background: #f5f3ff;
            border-color: #ddd6fe;
        }

        .status-btn:hover {
            color: #d97706;
            background: #fffbeb;
            border-color: #fde68a;
        }

        .action-btn:focus-visible {
            outline: 2px solid #6965f5;
            outline-offset: 3px;
        }

        .employee-name-cell {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .employee-avatar {
            display: inline-flex;
            flex-shrink: 0;
            align-items: center;
            justify-content: center;
            width: 34px;
            height: 34px;
            border-radius: 50%;
            background: #eeedff;
            color: #5b55d8;
            font-size: 12px;
            font-weight: 700;
        }

        .employee-view-overlay {
            position: fixed;
            inset: 0;
            z-index: 100000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(15,23,42,.55);
            backdrop-filter: blur(4px);
        }

        .employee-view-card {
            width: min(560px, 100%);
            max-height: 85vh;
            overflow-y: auto;
            border-radius: 18px;
            background: #fff;
            color: #172033;
            box-shadow: 0 24px 80px rgba(0,0,0,.2);
        }

        .employee-view-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
            padding: 24px;
            border-bottom: 1px solid #eef0f5;
        }

        .employee-view-header h2 {
            margin: 0 0 6px;
            font-size: 20px;
        }

        .employee-view-header p {
            margin: 0;
            color: #64748b;
        }

        .employee-view-close {
            border: 0;
            background: transparent;
            color: #64748b;
            cursor: pointer;
            font-size: 18px;
        }

        .employee-view-details {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0;
            padding: 8px 24px;
        }

        .employee-detail {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 15px 8px;
            border-bottom: 1px solid #f1f3f8;
            overflow-wrap: anywhere;
        }

        .employee-detail span {
            color: #64748b;
            font-size: 12px;
        }

        .employee-detail strong {
            font-size: 14px;
            font-weight: 600;
        }

        .employee-view-footer {
            display: flex;
            justify-content: flex-end;
            padding: 16px 24px 24px;
        }

        .employee-view-done {
            padding: 10px 18px;
            border-radius: 9px;
            background: #6965f5;
            color: #fff;
            font-size: 14px;
        }

        @media (max-width: 768px) {
            .employee-actions {
                gap: 5px;
            }

            .action-btn {
                width: 32px;
                height: 32px;
                font-size: 14px;
            }

            .employee-view-details {
                grid-template-columns: 1fr;
            }
        }
    `;

    document.head.appendChild(style);
})();
