
document.addEventListener("DOMContentLoaded", async () => {
    const settingsData = document.getElementById("settingsData");

    if (!settingsData) {
        console.error("Settings error: #settingsData element not found.");
        return;
    }

    await loadSettings();
});

async function loadSettings() {
    const settingsData = document.getElementById("settingsData");

    settingsData.innerHTML = `
        <div class="settings-loading">
            Loading account information...
        </div>
    `;

    try {
        if (typeof apiGet !== "function") {
            throw new Error(
                "API helper not loaded. Load api.js before settings.js."
            );
        }

        const user = await apiGet("/api/auth/me");

        if (!user) {
            settingsData.innerHTML = `
                <div class="settings-error">
                    No account information was returned.
                    Please log in again.
                </div>
            `;
            return;
        }

        renderSettings(user);

    } catch (error) {
        console.error("Settings error:", error);

        settingsData.innerHTML = `
            <div class="settings-error">
                <h3>Unable to load account information</h3>
                <p>${escapeHtml(
                    error.message || "An unexpected error occurred."
                )}</p>
                <button type="button"
                    class="btn btn-primary"
                    onclick="loadSettings()">
                    Try Again
                </button>
            </div>
        `;
    }
}

function renderSettings(user) {
    const settingsData = document.getElementById("settingsData");

    const fullName =
        `${user.first_name || ""} ${user.last_name || ""}`.trim()
        || user.name
        || user.email
        || "User";

    const avatarLetter = fullName.charAt(0).toUpperCase();

    settingsData.innerHTML = `
        <div class="settings-profile">

            <div class="settings-avatar">
                ${escapeHtml(avatarLetter)}
            </div>

            <div class="settings-main">
                <h2>${escapeHtml(fullName)}</h2>

                <span class="settings-role">
                    ${escapeHtml(
                        user.designation || user.role || "USER"
                    )}
                </span>

                <p>${escapeHtml(user.email || "No email available")}</p>
            </div>

        </div>

        <div class="settings-section">
            <h3>Account Information</h3>

            <div class="settings-grid">
                ${settingItem("User ID", user.id)}
                ${settingItem("Employee ID", user.employee_id)}
                ${settingItem("Email", user.email)}
                ${settingItem("Role", user.role)}
                ${settingItem("Designation", user.designation)}
                ${settingItem("Department", user.department)}
                ${settingItem("Account Status", user.status)}
                ${settingItem("Joining Date", user.joining_date)}
            </div>
        </div>
    `;
}

function settingItem(label, value) {
    const displayValue =
        value === null || value === undefined || value === ""
            ? "—"
            : String(value);

    return `
        <div class="setting-item">
            <span class="setting-label">
                ${escapeHtml(label)}
            </span>

            <strong>
                ${escapeHtml(displayValue)}
            </strong>
        </div>
    `;
}

function accessItem(name, allowed) {
    return `
        <div class="access-item">
            <span>${escapeHtml(name)}</span>

            <span class="${allowed ? "access-on" : "access-off"}">
                <span class="access-indicator"></span>
                ${allowed ? "Allowed" : "Restricted"}
            </span>
        </div>
    `;
}

function canAccess(user, permission) {
    if (!user) return false;

    const role = String(user.role || "").toUpperCase();

    // CEO and DIRECTOR are represented by EXECUTIVE.
    if (
        role === "EXECUTIVE" ||
        role === "CEO" ||
        role === "DIRECTOR" ||
        role === "ADMIN"
    ) {
        return true;
    }

    if (!Array.isArray(user.permissions)) {
        return false;
    }

    return user.permissions.includes(permission);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Make the retry function available to the HTML button.
window.loadSettings = loadSettings;
window.canAccess = canAccess;