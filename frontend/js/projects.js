
"use strict";

// ======================================================
// ORBIT SYSTEM — PROJECT MANAGEMENT
// File: frontend/js/projects.js
// ======================================================

const PROJECT_API = "/api/projects";
const TASK_API = "/api/tasks";
const PROJECT_REFRESH_INTERVAL = 5000;

let projects = [];
let editingProjectId = null;
let toastTimer = null;
let isSavingProject = false;
let isLoadingProjects = false;
let projectRefreshTimer = null;

// ======================================================
// DOM HELPERS
// ======================================================

function byId(id) {
    return document.getElementById(id);
}

function valueOf(id) {
    return byId(id)?.value?.trim() ?? "";
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function normalizeStatus(value) {
    value = value?.value ?? value ?? "";

    return String(value)
        .split(".")
        .pop()
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

// Accept either a project object or a progress number.
// Completed projects always display 100%.
function normalizeProgress(value) {
    if (value !== null && typeof value === "object") {
        const status = normalizeStatus(value.status);

        if (["COMPLETED", "COMPLETE", "DONE", "FINISHED"].includes(status)) {
            return 100;
        }

        value =
            value.progress ??
            value.progress_percent ??
            value.completion_percentage ??
            0;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) return 0;

    return Math.max(0, Math.min(100, Math.round(number)));
}

function formatDate(value) {
    if (!value) return "—";

    const dateText = String(value).slice(0, 10);
    const date = new Date(`${dateText}T12:00:00`);

    if (Number.isNaN(date.getTime())) return dateText;

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) return "—";

    return number.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    });
}

function showProjectMessage(message, type = "success") {
    const toast = byId("toast");

    if (!toast) {
        console.log(message);
        return;
    }

    window.clearTimeout(toastTimer);

    toast.textContent = String(message);
    toast.className = "toast";
    toast.classList.add(type, "show");

    toastTimer = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}

// ======================================================
// API HELPERS
// api.js must load before projects.js
// ======================================================

async function projectRequest(path, options = {}) {
    if (typeof window.apiRequest !== "function") {
        throw new Error(
            "API helper not loaded. Load api.js before projects.js."
        );
    }

    return window.apiRequest(path, options);
}

function unwrapArray(response, keys, depth = 0) {
    if (Array.isArray(response)) return response;

    if (!response || typeof response !== "object" || depth > 5) {
        return [];
    }

    for (const key of keys) {
        if (Array.isArray(response[key])) {
            return response[key];
        }
    }

    for (const key of ["data", "result", "results", "payload"]) {
        const nested = response[key];

        if (nested && typeof nested === "object") {
            const result = unwrapArray(nested, keys, depth + 1);

            if (result.length > 0 || Array.isArray(nested)) {
                return result;
            }
        }
    }

    return [];
}

function getResponseProjects(response) {
    return unwrapArray(response, [
        "items",
        "projects",
        "data",
        "results"
    ]);
}

function getResponseTasks(response) {
    return unwrapArray(response, [
        "items",
        "tasks",
        "data",
        "results"
    ]);
}

// ======================================================
// TASK PROGRESS CALCULATION
// ======================================================

function getTaskProjectId(task) {
    let projectId =
        task?.project_id ??
        task?.projectId ??
        task?.project?.id ??
        task?.project?.project_id ??
        task?.project?.projectId ??
        null;

    if (projectId && typeof projectId === "object") {
        projectId = projectId.id ?? projectId.project_id ?? null;
    }

    return projectId;
}

function isTaskCompleted(task) {
    const status = normalizeStatus(
        task?.status ??
        task?.task_status ??
        task?.state
    );

    return [
        "DONE",
        "COMPLETED",
        "COMPLETE",
        "FINISHED",
        "CLOSED"
    ].includes(status);
}

function calculateProgressFromTasks(projectList, taskList) {
    return projectList.map(project => {
        const projectStatus = normalizeStatus(project.status);

        // Completed project always shows 100%, regardless of API progress.
        if ([
            "COMPLETED",
            "COMPLETE",
            "DONE",
            "FINISHED"
        ].includes(projectStatus)) {
            return {
                ...project,
                progress: 100
            };
        }

        const projectId = Number(project.id);

        const projectTasks = taskList.filter(task => {
            const taskProjectId = getTaskProjectId(task);

            return taskProjectId !== null &&
                Number(taskProjectId) === projectId;
        });

        // If there are no linked tasks, retain the API's progress value.
        if (projectTasks.length === 0) {
            return {
                ...project,
                progress: normalizeProgress(project)
            };
        }

        const completedCount = projectTasks.filter(
            isTaskCompleted
        ).length;

        const progress = Math.round(
            (completedCount / projectTasks.length) * 100
        );

        console.log(
            `Project ${projectId}: ${completedCount}/${projectTasks.length} tasks completed = ${progress}%`
        );

        return {
            ...project,
            progress
        };
    });
}

// ======================================================
// LOAD PROJECTS AND TASKS
// ======================================================

async function loadProjects(options = {}) {
    const { silent = false } = options;
    const tableBody = byId("tableBody");

    if (isLoadingProjects) return;

    isLoadingProjects = true;

    if (!silent && projects.length === 0 && tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    Loading projects...
                </td>
            </tr>`;
    }

    try {
        const projectResponse = await projectRequest(PROJECT_API, {
            method: "GET",
            cache: "no-store"
        });

        const projectList = getResponseProjects(projectResponse);

        let taskList = null;

        try {
            const taskResponse = await projectRequest(TASK_API, {
                method: "GET",
                cache: "no-store"
            });

            taskList = getResponseTasks(taskResponse);

            console.log("Projects API response:", projectResponse);
            console.log("Tasks API response:", taskResponse);
            console.log("Tasks loaded:", taskList.length);
        } catch (taskError) {
            console.error(
                "Unable to load tasks for project progress:",
                taskError
            );
        }

        if (taskList !== null) {
            projects = calculateProgressFromTasks(
                projectList,
                taskList
            );
        } else {
            projects = projectList.map(project => ({
                ...project,
                progress: normalizeProgress(project)
            }));
        }

        console.table(projects.map(project => ({
            id: project.id,
            name: project.name,
            status: project.status,
            progress: normalizeProgress(project)
        })));

        renderProjects();
        updateProjectSummary();
        updateProjectCount();

    } catch (error) {
        console.error("Unable to load projects:", error);

        if (!silent) {
            showProjectMessage(
                error.message || "Unable to load projects.",
                "error"
            );

            if (projects.length === 0 && tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="empty-state">
                            ${escapeHTML(
                                error.message || "Unable to load projects."
                            )}
                        </td>
                    </tr>`;
            }
        }
    } finally {
        isLoadingProjects = false;
    }
}

// ======================================================
// PROJECT COUNT
// ======================================================

function updateProjectCount() {
    const count = byId("projectCount");

    if (count) {
        count.textContent =
            `Showing ${getFilteredProjects().length} of ${projects.length} projects`;
    }
}

// ======================================================
// AUTOMATIC REFRESH
// ======================================================

function startProjectAutoRefresh() {
    stopProjectAutoRefresh();

    projectRefreshTimer = window.setInterval(() => {
        if (!document.hidden) {
            loadProjects({ silent: true });
        }
    }, PROJECT_REFRESH_INTERVAL);
}

function stopProjectAutoRefresh() {
    if (projectRefreshTimer !== null) {
        window.clearInterval(projectRefreshTimer);
        projectRefreshTimer = null;
    }
}

// ======================================================
// PROJECT SUMMARY
// ======================================================

function updateProjectSummary() {
    const total = projects.length;

    const inProgress = projects.filter(project =>
        normalizeStatus(project.status) === "IN_PROGRESS"
    ).length;

    const completed = projects.filter(project =>
        normalizeStatus(project.status) === "COMPLETED"
    ).length;

    const onHold = projects.filter(project =>
        normalizeStatus(project.status) === "ON_HOLD"
    ).length;

    if (byId("totalProjects")) {
        byId("totalProjects").textContent = total;
    }

    if (byId("inProgressProjects")) {
        byId("inProgressProjects").textContent = inProgress;
    }

    if (byId("completedProjects")) {
        byId("completedProjects").textContent = completed;
    }

    if (byId("onHoldProjects")) {
        byId("onHoldProjects").textContent = onHold;
    }
}

// ======================================================
// FILTER PROJECTS
// ======================================================

function getFilteredProjects() {
    const search = valueOf("projectSearch").toLowerCase();
    const statusFilter = valueOf("statusFilter").toUpperCase();

    return projects.filter(project => {
        const searchableText = [
            project.project_code,
            project.name,
            project.client,
            project.description,
            project.manager_id,
            project.team_id
        ].join(" ").toLowerCase();

        const matchesSearch =
            !search || searchableText.includes(search);

        const matchesStatus =
            !statusFilter ||
            normalizeStatus(project.status) === statusFilter;

        return matchesSearch && matchesStatus;
    });
}

// ======================================================
// RENDER PROJECT TABLE
// ======================================================

function renderProjects() {
    const tableBody = byId("tableBody");

    if (!tableBody) {
        console.error("Missing table body: #tableBody");
        return;
    }

    const filteredProjects = getFilteredProjects();

    if (filteredProjects.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="empty-state">
                    No projects found. Try changing your search or filters.
                </td>
            </tr>`;

        updateProjectCount();
        return;
    }

    tableBody.innerHTML = filteredProjects.map(project => {
        const id = Number(project.id);
        const status = normalizeStatus(project.status) || "PLANNED";
        const priority = normalizeStatus(project.priority) || "MEDIUM";

        // Pass the full project object to check its status.
        const progress = normalizeProgress(project);

        const statusClass = status.toLowerCase().replaceAll("_", "-");
        const priorityClass = priority.toLowerCase();

        return `
            <tr data-project-id="${id}">
                <td>
                    <span class="project-code">
                        ${escapeHTML(project.project_code || "—")}
                    </span>
                </td>

                <td>
                    <div class="project-name">
                        ${escapeHTML(project.name || "Untitled project")}
                    </div>
                    <span class="project-description">
                        ${escapeHTML(project.description || "")}
                    </span>
                </td>

                <td>${escapeHTML(project.client || "—")}</td>

                <td>
                    ${project.manager_id
                        ? `Employee #${escapeHTML(project.manager_id)}`
                        : "—"}
                </td>

                <td>${escapeHTML(formatDate(project.deadline))}</td>

                <td>
                    <span class="status-badge status-${statusClass}">
                        ${escapeHTML(status.replaceAll("_", " "))}
                    </span>
                </td>

                <td>
                    <span class="priority-badge priority-${priorityClass}">
                        ${escapeHTML(priority)}
                    </span>
                </td>

                <td>
                    <div class="project-progress">
                        <div class="project-progress-header">
                            <span>Progress</span>
                            <strong class="project-progress-value">
                                ${progress}%
                            </strong>
                        </div>

                        <div
                            class="progress-track"
                            role="progressbar"
                            aria-label="Project progress"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow="${progress}">
                            <div
                                class="progress-fill"
                                style="width: ${progress}%">
                            </div>
                        </div>
                    </div>
                </td>

                

                <td>
                    <div class="action-buttons">
                        <button
                            type="button"
                            class="action-button"
                            data-action="view"
                            data-id="${id}"
                            title="View project"
                            aria-label="View project">⌕</button>

                        <button
                            type="button"
                            class="action-button"
                            data-action="edit"
                            data-id="${id}"
                            title="Edit project"
                            aria-label="Edit project">✎</button>

                        <button
                            type="button"
                            class="action-button delete"
                            data-action="delete"
                            data-id="${id}"
                            title="Delete project"
                            aria-label="Delete project">×</button>
                    </div>
                </td>
            </tr>`;
    }).join("");

    updateProjectCount();
}

// ======================================================
// PROJECT FORM PAYLOAD
// ======================================================

function getProjectPayload() {
    return {
        project_code: valueOf("projectCode"),
        name: valueOf("projectName"),
        description: valueOf("projectDescription") || null,
        client: valueOf("projectClient") || null,

        manager_id: valueOf("projectManager")
            ? Number(valueOf("projectManager"))
            : null,

        team_id: valueOf("projectTeam")
            ? Number(valueOf("projectTeam"))
            : null,

        start_date: valueOf("projectStartDate") || null,
        deadline: valueOf("projectDeadline") || null,
        status: valueOf("projectStatus") || "PLANNED",
        priority: valueOf("projectPriority") || "MEDIUM",

        budget: valueOf("projectBudget") !== ""
            ? Number(valueOf("projectBudget"))
            : null
    };
}

function validateProject(payload) {
    if (!payload.project_code) {
        throw new Error("Please enter a project code.");
    }

    if (!payload.name) {
        throw new Error("Please enter a project name.");
    }

    if (
        payload.manager_id !== null &&
        (!Number.isInteger(payload.manager_id) ||
            payload.manager_id <= 0)
    ) {
        throw new Error("Manager ID must be a positive whole number.");
    }

    if (
        payload.team_id !== null &&
        (!Number.isInteger(payload.team_id) ||
            payload.team_id <= 0)
    ) {
        throw new Error("Team ID must be a positive whole number.");
    }

    if (
        payload.budget !== null &&
        (!Number.isFinite(payload.budget) || payload.budget < 0)
    ) {
        throw new Error("Budget must be zero or greater.");
    }

    if (
        payload.start_date &&
        payload.deadline &&
        payload.deadline < payload.start_date
    ) {
        throw new Error("Deadline cannot be before the start date.");
    }

    if (![
        "PLANNED",
        "IN_PROGRESS",
        "ON_HOLD",
        "COMPLETED",
        "CANCELLED"
    ].includes(payload.status)) {
        throw new Error("Please select a valid project status.");
    }

    if (![
        "LOW",
        "MEDIUM",
        "HIGH",
        "URGENT"
    ].includes(payload.priority)) {
        throw new Error("Please select a valid project priority.");
    }
}

// ======================================================
// PROJECT MODAL
// ======================================================

function openProjectModal() {
    const modal = byId("projectModal");

    if (!modal) {
        console.error("Missing #projectModal in projects.html");
        return;
    }

    modal.classList.add("show");
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
        byId("projectName")?.focus();
    }, 50);
}

function closeProjectModal() {
    byId("projectModal")?.classList.remove("show");
    document.body.style.overflow = "";
}

function prepareNewProject() {
    editingProjectId = null;

    byId("projectForm")?.reset();

    if (byId("projectModalTitle")) {
        byId("projectModalTitle").textContent = "Create New Project";
    }

    if (byId("createProjectButton")) {
        byId("createProjectButton").textContent = "Create Project";
    }

    if (byId("projectStatus")) {
        byId("projectStatus").value = "PLANNED";
    }

    if (byId("projectPriority")) {
        byId("projectPriority").value = "MEDIUM";
    }

    if (byId("progress")) {
        byId("progress").value = "0";
        byId("progress").disabled = true;
    }

    if (byId("progressValue")) {
        byId("progressValue").textContent = "Calculated from tasks";
    }

    openProjectModal();
}

// ======================================================
// SAVE PROJECT
// ======================================================

async function saveProject(event) {
    event.preventDefault();

    if (isSavingProject) return;

    const form = byId("projectForm");
    const saveButton = byId("createProjectButton");

    if (form && !form.reportValidity()) return;

    let payload;

    try {
        payload = getProjectPayload();
        validateProject(payload);
    } catch (error) {
        showProjectMessage(error.message, "error");
        return;
    }

    const isEditing = editingProjectId !== null;
    const projectId = editingProjectId;

    isSavingProject = true;

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = isEditing ? "Updating..." : "Creating...";
    }

    try {
        if (isEditing) {
            await projectRequest(`${PROJECT_API}/${projectId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            await projectRequest(PROJECT_API, {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }

        closeProjectModal();

        showProjectMessage(
            isEditing
                ? "Project updated successfully."
                : "Project created successfully."
        );

        editingProjectId = null;
        form?.reset();

        await loadProjects();
    } catch (error) {
        console.error("Unable to save project:", error);

        showProjectMessage(
            error.message || "Unable to save the project.",
            "error"
        );
    } finally {
        isSavingProject = false;

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent =
                editingProjectId !== null
                    ? "Update Project"
                    : "Create Project";
        }
    }
}

// ======================================================
// EDIT PROJECT
// ======================================================

function editProject(projectId) {
    const project = projects.find(
        item => Number(item.id) === Number(projectId)
    );

    if (!project) {
        showProjectMessage("Project not found.", "error");
        return;
    }

    editingProjectId = Number(project.id);

    if (byId("projectModalTitle")) {
        byId("projectModalTitle").textContent = "Edit Project";
    }

    if (byId("createProjectButton")) {
        byId("createProjectButton").textContent = "Update Project";
    }

    const fields = {
        projectCode: project.project_code,
        projectName: project.name,
        projectClient: project.client,
        projectDescription: project.description,
        projectManager: project.manager_id,
        projectTeam: project.team_id,

        projectStartDate: project.start_date
            ? String(project.start_date).slice(0, 10)
            : "",

        projectDeadline: project.deadline
            ? String(project.deadline).slice(0, 10)
            : "",

        projectStatus: normalizeStatus(project.status),
        projectPriority: normalizeStatus(project.priority),
        projectBudget: project.budget
    };

    Object.entries(fields).forEach(([id, value]) => {
        if (byId(id)) {
            byId(id).value = value ?? "";
        }
    });

    if (byId("progress")) {
        byId("progress").value = normalizeProgress(project);
        byId("progress").disabled = true;
    }

    if (byId("progressValue")) {
        byId("progressValue").textContent =
            `${normalizeProgress(project)}% calculated from tasks`;
    }

    openProjectModal();
}

// ======================================================
// VIEW PROJECT
// ======================================================

function viewProject(projectId) {
    const project = projects.find(
        item => Number(item.id) === Number(projectId)
    );

    if (!project) {
        showProjectMessage("Project not found.", "error");
        return;
    }

    window.alert([
        `Project code: ${project.project_code || "—"}`,
        `Name: ${project.name || "—"}`,
        `Client: ${project.client || "—"}`,
        `Manager ID: ${project.manager_id ?? "—"}`,
        `Team ID: ${project.team_id ?? "—"}`,
        `Start date: ${formatDate(project.start_date)}`,
        `Deadline: ${formatDate(project.deadline)}`,
        `Status: ${normalizeStatus(project.status)}`,
        `Priority: ${normalizeStatus(project.priority)}`,
        `Budget: ${formatCurrency(project.budget)}`,
        `Task progress: ${normalizeProgress(project)}%`,
        `Description: ${project.description || "—"}`
    ].join("\n"));
}

// ======================================================
// DELETE PROJECT
// ======================================================

async function deleteProject(projectId) {
    const project = projects.find(
        item => Number(item.id) === Number(projectId)
    );

    if (!project) {
        showProjectMessage("Project not found.", "error");
        return;
    }

    if (!window.confirm(
        `Are you sure you want to delete "${project.name}"?`
    )) {
        return;
    }

    try {
        await projectRequest(`${PROJECT_API}/${Number(projectId)}`, {
            method: "DELETE"
        });

        showProjectMessage("Project deleted successfully.");
        await loadProjects();
    } catch (error) {
        console.error("Unable to delete project:", error);

        showProjectMessage(
            error.message || "Unable to delete the project.",
            "error"
        );
    }
}

// ======================================================
// EXPORT PROJECTS CSV
// ======================================================

function exportProjectsCSV() {
    const filteredProjects = getFilteredProjects();

    if (filteredProjects.length === 0) {
        showProjectMessage("There are no projects to export.", "error");
        return;
    }

    const rows = [[
        "Project Code",
        "Project Name",
        "Client",
        "Manager ID",
        "Team ID",
        "Start Date",
        "Deadline",
        "Status",
        "Priority",
        "Budget",
        "Progress"
    ]];

    filteredProjects.forEach(project => {
        rows.push([
            project.project_code ?? "",
            project.name ?? "",
            project.client ?? "",
            project.manager_id ?? "",
            project.team_id ?? "",
            project.start_date ?? "",
            project.deadline ?? "",
            normalizeStatus(project.status),
            normalizeStatus(project.priority),
            project.budget ?? "",
            `${normalizeProgress(project)}%`
        ]);
    });

    const csv = rows.map(row =>
        row.map(value =>
            `"${String(value).replace(/"/g, '""')}"`
        ).join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "orbit-projects.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showProjectMessage("Projects exported successfully.");
}

// ======================================================
// EVENT LISTENERS
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
    byId("openProjectButton")?.addEventListener("click", event => {
        event.preventDefault();
        prepareNewProject();
    });

    byId("projectForm")?.addEventListener("submit", saveProject);

    byId("closeProjectButton")?.addEventListener(
        "click",
        closeProjectModal
    );

    byId("cancelProjectButton")?.addEventListener(
        "click",
        closeProjectModal
    );

    byId("projectModal")?.addEventListener("click", event => {
        if (event.target === byId("projectModal")) {
            closeProjectModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (
            event.key === "Escape" &&
            byId("projectModal")?.classList.contains("show")
        ) {
            closeProjectModal();
        }
    });

    byId("projectSearch")?.addEventListener("input", renderProjects);
    byId("statusFilter")?.addEventListener("change", renderProjects);

    byId("exportProjectsButton")?.addEventListener(
        "click",
        exportProjectsCSV
    );

    byId("tableBody")?.addEventListener("click", event => {
        const button = event.target.closest("[data-action]");

        if (!button) return;

        const id = Number(button.dataset.id);

        if (!Number.isInteger(id) || id <= 0) return;

        switch (button.dataset.action) {
            case "view":
                viewProject(id);
                break;

            case "edit":
                editProject(id);
                break;

            case "delete":
                deleteProject(id);
                break;
        }
    });

    loadProjects();
    startProjectAutoRefresh();

    window.addEventListener("focus", () => {
        loadProjects({ silent: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            loadProjects({ silent: true });
        }
    });
});

// ======================================================
// EXPOSE FUNCTIONS
// ======================================================

Object.assign(window, {
    loadProjects,
    renderProjects,
    updateProjectSummary,
    openProjectModal,
    closeProjectModal,
    prepareNewProject,
    editProject,
    viewProject,
    deleteProject,
    exportProjectsCSV
});
