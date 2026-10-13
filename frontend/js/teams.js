let teams = [];
let editingTeamId = null;

const TEAMS_API_ENDPOINT = "/api/teams";

// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (typeof requireAuth === "function") {
            const me = await requireAuth();
            if (!me) return;
        }

        document.getElementById("addTeamButton")
            ?.addEventListener("click", () => openTeamModal());

        document.getElementById("closeTeamModal")
            ?.addEventListener("click", closeTeamModal);

        document.getElementById("cancelTeamButton")
            ?.addEventListener("click", closeTeamModal);

        document.getElementById("teamForm")
            ?.addEventListener("submit", saveTeam);

        document.getElementById("teamSearch")
            ?.addEventListener("input", renderTeams);

        document.getElementById("teamStatusFilter")
            ?.addEventListener("change", renderTeams);

        document.getElementById("exportTeamsButton")
            ?.addEventListener("click", exportTeams);

        document.getElementById("teamModal")
            ?.addEventListener("click", event => {
                if (event.target.id === "teamModal") {
                    closeTeamModal();
                }
            });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeTeamModal();
        });

        await loadTeams();
    } catch (error) {
        console.error("Team page initialization error:", error);
        notify(error.message || "Unable to initialize Teams page.", "error");
    }
});

// ============================================================
// API HELPER CHECK
// ============================================================

function ensureTeamApi() {
    if (
        typeof apiGet !== "function" ||
        typeof apiPost !== "function" ||
        typeof apiPut !== "function" ||
        typeof apiDelete !== "function"
    ) {
        throw new Error(
            "API functions are missing. Load ../js/api.js before teams.js."
        );
    }
}

// ============================================================
// LOAD TEAMS
// ============================================================

async function loadTeams() {
    const body = document.getElementById("tableBody");

    if (body) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="team-empty">Loading teams...</td>
            </tr>
        `;
    }

    try {
        ensureTeamApi();

        const data = await apiGet(TEAMS_API_ENDPOINT);

        if (Array.isArray(data)) {
            teams = data;
        } else if (Array.isArray(data?.items)) {
            teams = data.items;
        } else if (Array.isArray(data?.teams)) {
            teams = data.teams;
        } else {
            throw new Error("Unexpected response from the Teams API.");
        }

        renderTeams();
    } catch (error) {
        console.error("Load teams error:", error);

        if (body) {
            body.innerHTML = `
                <tr>
                    <td colspan="7" class="team-empty">
                        Unable to load teams.<br>
                        ${escapeHtml(error.message || "")}
                    </td>
                </tr>
            `;
        }

        notify(error.message || "Unable to load teams.", "error");
    }
}

// ============================================================
// RENDER TEAMS
// ============================================================

function renderTeams() {
    const body = document.getElementById("tableBody");
    if (!body) return;

    const search = (
        document.getElementById("teamSearch")?.value || ""
    ).trim().toLowerCase();

    const selectedStatus = (
        document.getElementById("teamStatusFilter")?.value || ""
    ).toUpperCase();

    const filtered = teams.filter(team => {
        const searchable = [
            team.id,
            team.name,
            team.team_name,
            team.department,
            team.department_name,
            team.leader,
            team.leader_name,
            team.leader_id,
            team.description,
            team.status
        ].join(" ").toLowerCase();

        const status = String(team.status || "ACTIVE").toUpperCase();

        return searchable.includes(search) &&
            (!selectedStatus || status === selectedStatus);
    });

    if (!filtered.length) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="team-empty">
                    ${teams.length
                        ? "No teams match your search or filters."
                        : "No teams found. Click Add Team to create one."}
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = filtered.map(team => {
        const id = Number(team.id);
        const name = team.name ?? team.team_name ?? "—";
        const department = team.department_name ?? team.department ?? "—";
        const leader = team.leader_name ?? team.leader ?? team.leader_id ?? "—";
        const description = team.description ?? "—";
        const status = String(team.status ?? "ACTIVE").toUpperCase();

        return `
            <tr>
                <td>${escapeHtml(team.id ?? "—")}</td>

                <td>
                    <span class="team-name">${escapeHtml(name)}</span>
                </td>

                <td>${escapeHtml(department)}</td>

                <td>${escapeHtml(leader)}</td>

                <td>
                    <div class="team-description">
                        ${escapeHtml(description)}
                    </div>
                </td>

                <td>
                    <span class="team-status ${status === "INACTIVE" ? "inactive" : ""}">
                        ${escapeHtml(status)}
                    </span>
                </td>

                <td>
                    <div class="team-actions">
                        <button
                            class="team-action"
                            type="button"
                            data-action="edit"
                            data-id="${Number.isFinite(id) ? id : ""}"
                            title="Edit team"
                            aria-label="Edit ${escapeHtml(name)}">
                            ✎
                        </button>

                        <button
                            class="team-action"
                            type="button"
                            data-action="delete"
                            data-id="${Number.isFinite(id) ? id : ""}"
                            title="Delete team"
                            aria-label="Delete ${escapeHtml(name)}">
                            🗑
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // Attach handlers safely after rendering.
    body.querySelectorAll("[data-action='edit']").forEach(button => {
        button.addEventListener("click", () => {
            editTeam(Number(button.dataset.id));
        });
    });

    body.querySelectorAll("[data-action='delete']").forEach(button => {
        button.addEventListener("click", () => {
            deleteTeam(Number(button.dataset.id));
        });
    });
}

// ============================================================
// OPEN ADD / EDIT MODAL
// ============================================================

function openTeamModal(team = null) {
    editingTeamId = team ? Number(team.id) : null;

    const title = document.getElementById("teamModalTitle");
    if (title) {
        title.textContent = team ? "Edit Team" : "Add Team";
    }

    setField("teamName", team?.name ?? team?.team_name ?? "");
    setField("teamDepartment", team?.department ?? team?.department_name ?? "");
    setField("teamLeader", team?.leader_id ?? team?.leader_employee_id ?? "");
    setField("teamDescription", team?.description ?? "");
    setField("teamStatus", team?.status ?? "ACTIVE");

    const modal = document.getElementById("teamModal");

    if (!modal) {
        notify("Team modal was not found in the HTML.", "error");
        return;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    document.getElementById("teamName")?.focus();
}

// ============================================================
// CLOSE MODAL
// ============================================================

function closeTeamModal() {
    const modal = document.getElementById("teamModal");

    modal?.classList.remove("show");
    modal?.setAttribute("aria-hidden", "true");

    document.getElementById("teamForm")?.reset();

    editingTeamId = null;
}

// ============================================================
// EDIT TEAM
// ============================================================

function editTeam(id) {
    const team = teams.find(item => Number(item.id) === Number(id));

    if (!team) {
        notify("Team not found.", "error");
        return;
    }

    openTeamModal(team);
}

// ============================================================
// SAVE TEAM — CREATE OR UPDATE
// ============================================================

async function saveTeam(event) {
    event.preventDefault();

    const name = getField("teamName").trim();

    if (!name) {
        notify("Team name is required.", "error");
        document.getElementById("teamName")?.focus();
        return;
    }

    // IMPORTANT:
    // These fields must match backend/app/schemas/common.py TeamCreate.
    const payload = {
        name: name,
        department: getField("teamDepartment").trim() || null,
        leader_id: getField("teamLeader").trim()
            ? Number(getField("teamLeader"))
            : null,
        description: getField("teamDescription").trim() || null,
        status: getField("teamStatus") || "ACTIVE"
    };

    if (
        payload.leader_id !== null &&
        !Number.isInteger(payload.leader_id)
    ) {
        notify("Team leader ID must be a valid number.", "error");
        return;
    }

    const isEditing = editingTeamId !== null;
    const teamId = editingTeamId;

    const button = document.getElementById("saveTeamButton");
    const originalText = button?.textContent || "Save Team";

    if (button) {
        button.disabled = true;
        button.textContent = "Saving...";
    }

    try {
        ensureTeamApi();

        if (isEditing) {
            await apiPut(`${TEAMS_API_ENDPOINT}/${teamId}`, payload);
        } else {
            await apiPost(TEAMS_API_ENDPOINT, payload);
        }

        closeTeamModal();

        notify(
            isEditing
                ? "Team updated successfully."
                : "Team created successfully.",
            "success"
        );

        await loadTeams();
    } catch (error) {
        console.error("Save team error:", error);
        notify(error.message || "Unable to save team.", "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// ============================================================
// DELETE TEAM
// ============================================================

async function deleteTeam(id) {
    const team = teams.find(item => Number(item.id) === Number(id));

    if (!team) {
        notify("Team not found.", "error");
        return;
    }

    const name = team.name ?? team.team_name ?? `#${id}`;

    if (!window.confirm(`Delete team "${name}"? This cannot be undone.`)) {
        return;
    }

    try {
        ensureTeamApi();

        await apiDelete(`${TEAMS_API_ENDPOINT}/${id}`);

        notify("Team deleted successfully.", "success");
        await loadTeams();
    } catch (error) {
        console.error("Delete team error:", error);
        notify(error.message || "Unable to delete team.", "error");
    }
}

// ============================================================
// EXPORT TEAMS TO CSV
// ============================================================

function exportTeams() {
    if (!teams.length) {
        notify("There are no teams to export.", "error");
        return;
    }

    const headers = [
        "ID",
        "Team Name",
        "Department",
        "Leader",
        "Description",
        "Status"
    ];

    const rows = teams.map(team => [
        team.id,
        team.name ?? team.team_name,
        team.department_name ?? team.department,
        team.leader_name ?? team.leader ?? team.leader_id,
        team.description,
        team.status
    ]);

    const csv = [headers, ...rows]
        .map(row =>
            row.map(value =>
                `"${String(value ?? "").replace(/"/g, '""')}"`
            ).join(",")
        )
        .join("\r\n");

    const blob = new Blob(
        ["\uFEFF", csv],
        { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "orbit-teams.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    notify("Teams exported successfully.", "success");
}

// ============================================================
// FIELD HELPERS
// ============================================================

function getField(id) {
    return document.getElementById(id)?.value ?? "";
}

function setField(id, value) {
    const element = document.getElementById(id);
    if (element) element.value = value ?? "";
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
// NOTIFICATIONS
// ============================================================

function notify(message, type = "success") {
    if (typeof window.toast === "function") {
        window.toast(message);
        return;
    }

    const element = document.getElementById("toast");

    if (!element) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }

    element.textContent = message;
    element.dataset.type = type;
    element.classList.add("show");
    element.style.display = "block";

    window.setTimeout(() => {
        element.classList.remove("show");
        element.style.display = "none";
    }, 3000);
}

// ============================================================
// GLOBAL FUNCTIONS
// ============================================================

window.loadTeams = loadTeams;
window.renderTeams = renderTeams;
window.openTeamModal = openTeamModal;
window.closeTeamModal = closeTeamModal;
window.editTeam = editTeam;
window.deleteTeam = deleteTeam;
window.saveTeam = saveTeam;
window.exportTeams = exportTeams;