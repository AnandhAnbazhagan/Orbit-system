
(() => {
    "use strict";

    // =========================================================
    // ORBIT SYSTEM — INVENTORY MANAGEMENT
    // =========================================================

    let inventoryItems = [];
    let editingItemId = null;
    let isSaving = false;

    const $ = (id) => document.getElementById(id);

    const modal = $("inventoryModal");
    const form = $("inventoryForm");
    const tableBody = $("tableBody");
    const addButton = $("addItemButton");
    const closeButton = $("closeInventoryModal");
    const cancelButton = $("cancelInventoryButton");
    const saveButton = $("saveInventoryButton");
    const searchInput = $("inventorySearch");
    const statusFilter = $("inventoryStatusFilter");
    const exportButton = $("exportInventoryButton");

    if (!form || !modal || !tableBody || !addButton || !saveButton) {
        console.error(
            "Inventory initialization failed. Check the HTML element IDs."
        );
        return;
    }

    // =========================================================
    // API CONFIGURATION
    // =========================================================

    function getApiBase() {
        const configured =
            window.API_BASE_URL ||
            window.API_URL ||
            window.API_BASE ||
            window.BASE_URL;

        let base =
            typeof configured === "string" && configured.trim()
                ? configured.trim().replace(/\/+$/, "")
                : "http://127.0.0.1:8000/api";

        if (!/\/api$/i.test(base)) {
            base += "/api";
        }

        return base;
    }

    function getToken() {
        return (
            localStorage.getItem("orbit_token") ||
            localStorage.getItem("access_token") ||
            localStorage.getItem("token") ||
            ""
        );
    }

    async function apiRequest(path, options = {}) {
        const token = getToken();

        const headers = {
            Accept: "application/json",
            ...(options.headers || {})
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        if (
            options.body !== undefined &&
            !(options.body instanceof FormData)
        ) {
            headers["Content-Type"] = "application/json";
        }

        let response;

        try {
            response = await fetch(`${getApiBase()}${path}`, {
                ...options,
                headers
            });
        } catch (error) {
            console.error("Inventory API connection failed:", error);

            throw new Error(
                "Cannot connect to FastAPI. Check that the backend is running on port 8000."
            );
        }

        const responseText = await response.text();
        let data = null;

        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch {
                data = { detail: responseText };
            }
        }

        if (!response.ok) {
            const detail = data?.detail;

            const message = Array.isArray(detail)
                ? detail
                    .map((item) => item.msg || JSON.stringify(item))
                    .join(", ")
                : typeof detail === "string"
                    ? detail
                    : data?.message ||
                      `Request failed (${response.status})`;

            if (response.status === 401) {
                throw new Error(
                    "Authentication required. Please log in again."
                );
            }

            if (response.status === 403) {
                throw new Error(
                    "You do not have permission to manage inventory."
                );
            }

            throw new Error(message);
        }

        return data;
    }

    // =========================================================
    // NOTIFICATIONS
    // =========================================================

    function notify(message, isError = false) {
        let container = $("inventoryToastContainer");

        if (!container) {
            container = document.createElement("div");
            container.id = "inventoryToastContainer";
            container.className = "inventory-toast-container";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className =
            "inventory-toast" + (isError ? " error" : "");
        toast.textContent = message;

        container.appendChild(toast);

        window.setTimeout(() => toast.remove(), 4000);
    }

    // =========================================================
    // NORMALIZE BACKEND DATA
    // =========================================================

    function normalizeItem(item) {
        return {
            ...item,
            id: item.id ?? item.item_id ?? item.inventory_id,
            name: item.name ?? item.item_name ?? "",
            sku: item.sku ?? item.item_code ?? "",
            category: item.category ?? "",
            quantity: Number(
                item.quantity ?? item.stock_quantity ?? 0
            ),
            minimum_stock: Number(
                item.minimum_stock ??
                item.min_stock ??
                item.reorder_level ??
                0
            ),
            unit: item.unit ?? "pcs",
            status: String(item.status ?? "AVAILABLE").toUpperCase(),
            description: item.description ?? ""
        };
    }

    function normalizeList(data) {
        const list = Array.isArray(data)
            ? data
            : data?.items ??
              data?.inventory ??
              data?.results ??
              data?.data;

        if (!Array.isArray(list)) {
            throw new Error(
                "Invalid inventory response. Check GET /api/inventory."
            );
        }

        return list.map(normalizeItem);
    }

    // =========================================================
    // INVENTORY STATUS
    // =========================================================

    function getStatus(item) {
        const savedStatus = String(
            item.status || ""
        ).toUpperCase();

        // INACTIVE is a manually controlled state.
        if (savedStatus === "INACTIVE") {
            return "INACTIVE";
        }

        // All active stock statuses derive from quantity.
        if (item.quantity <= 0) {
            return "OUT_OF_STOCK";
        }

        if (item.quantity <= item.minimum_stock) {
            return "LOW_STOCK";
        }

        return "AVAILABLE";
    }

    function statusLabel(status) {
        return status.replace(/_/g, " ");
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    // =========================================================
    // MODAL
    // =========================================================

    function openModal(item = null) {
        if (isSaving) return;

        editingItemId = item ? item.id : null;

        form.reset();

        $("inventoryModalTitle").textContent = item
            ? "Edit Inventory Item"
            : "Add Inventory Item";

        saveButton.textContent = item
            ? "Update Item"
            : "Save Item";

        $("itemName").value = item?.name ?? "";
        $("itemSku").value = item?.sku ?? "";
        $("itemCategory").value = item?.category ?? "";
        $("itemQuantity").value = item?.quantity ?? 0;
        $("itemMinimum").value = item?.minimum_stock ?? 0;
        $("itemUnit").value = item?.unit ?? "pcs";
        $("itemDescription").value = item?.description ?? "";

        // Status is controlled by the status action, not the edit form.
        const statusInput = $("itemStatus");
        if (statusInput) {
            statusInput.value = item
                ? getStatus(item)
                : "AVAILABLE";
        }

        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        window.setTimeout(() => $("itemName")?.focus(), 50);
    }

    function closeModal(force = false) {
        if (isSaving && !force) return;

        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";

        editingItemId = null;
    }

    addButton.addEventListener("click", () => openModal());
    closeButton?.addEventListener("click", () => closeModal());
    cancelButton?.addEventListener("click", () => closeModal());

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape" &&
            modal.classList.contains("show")
        ) {
            closeModal();
        }
    });

    // =========================================================
    // RENDER INVENTORY TABLE
    // =========================================================

    function renderTable() {
        const search = (searchInput?.value || "")
            .trim()
            .toLowerCase();

        const selectedStatus = (
            statusFilter?.value || ""
        ).toUpperCase();

        const filtered = inventoryItems.filter((item) => {
            const matchesSearch = [
                item.id,
                item.name,
                item.sku,
                item.category
            ].some((value) =>
                String(value ?? "").toLowerCase().includes(search)
            );

            const matchesStatus =
                !selectedStatus ||
                getStatus(item) === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        if (!filtered.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="inventory-empty">
                        No inventory items found.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = filtered.map((item) => {
            const status = getStatus(item);
            const statusClass = status
                .toLowerCase()
                .replace(/_/g, "-");

            const isInactive = status === "INACTIVE";

            return `
                <tr>
                    <td>${escapeHtml(item.id ?? "—")}</td>

                    <td>
                        <strong>${escapeHtml(item.name)}</strong>
                    </td>

                    <td>${escapeHtml(item.sku || "—")}</td>
                    <td>${escapeHtml(item.category || "—")}</td>
                    <td>${escapeHtml(item.quantity)}</td>
                    <td>${escapeHtml(item.minimum_stock)}</td>
                    <td>${escapeHtml(item.unit)}</td>

                    <td>
                        <span class="inventory-status ${statusClass}">
                            ${escapeHtml(statusLabel(status))}
                        </span>
                    </td>

                    <td>
                        <div class="inventory-actions">
                            <button
                                type="button"
                                class="inventory-action"
                                data-action="edit"
                                data-id="${escapeHtml(item.id)}"
                                title="Edit item"
                                aria-label="Edit ${escapeHtml(item.name)}">
                                ✎
                            </button>
                            <button
                                type="button"
                                class="inventory-action delete"
                                data-action="delete"
                                data-id="${escapeHtml(item.id)}"
                                title="Delete item"
                                aria-label="Delete ${escapeHtml(item.name)}">
                                🗑
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // =========================================================
    // UPDATE STATUS ON BACKEND
    // PATCH /api/inventory/{id}/status
    // =========================================================

    async function updateInventoryStatus(id, newStatus, button) {
        if (!["AVAILABLE", "INACTIVE"].includes(newStatus)) {
            notify("Invalid inventory status.", true);
            return;
        }

        if (button) {
            button.disabled = true;
        }

        try {
            await apiRequest(
                `/inventory/${encodeURIComponent(id)}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );

            // The backend has saved the change.
            await loadInventory();

            notify(
                newStatus === "INACTIVE"
                    ? "Inventory item deactivated successfully."
                    : "Inventory item activated successfully."
            );
        } catch (error) {
            console.error("Status update failed:", error);
            notify(
                error.message || "Unable to update inventory status.",
                true
            );
        } finally {
            if (button) {
                button.disabled = false;
            }
        }
    }

    // =========================================================
    // EDIT, STATUS AND DELETE ACTIONS
    // =========================================================

    tableBody.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button || button.disabled) return;

        const id = button.dataset.id;

        const item = inventoryItems.find(
            (entry) => String(entry.id) === String(id)
        );

        if (!item) {
            notify("Item not found. Refresh the inventory.", true);
            return;
        }

        const action = button.dataset.action;

        if (action === "edit") {
            openModal(item);
            return;
        }

        if (action === "toggle-status") {
            const newStatus =
                getStatus(item) === "INACTIVE"
                    ? "AVAILABLE"
                    : "INACTIVE";

            const actionLabel =
                newStatus === "INACTIVE"
                    ? "Deactivate"
                    : "Activate";

            if (!confirm(`${actionLabel} "${item.name}"?`)) {
                return;
            }

            await updateInventoryStatus(id, newStatus, button);
            return;
        }

        if (action === "delete") {
            if (!confirm(
                `Delete "${item.name}"? This cannot be undone.`
            )) {
                return;
            }

            button.disabled = true;

            try {
                await apiRequest(
                    `/inventory/${encodeURIComponent(id)}`,
                    { method: "DELETE" }
                );

                await loadInventory();
                notify("Inventory item deleted successfully.");
            } catch (error) {
                console.error("Inventory delete failed:", error);
                notify(error.message, true);
                button.disabled = false;
            }
        }
    });

    // =========================================================
    // ADD AND EDIT INVENTORY ITEM
    // =========================================================

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (isSaving) return;

        const itemName = $("itemName").value.trim();
        const enteredSku = $("itemSku").value.trim();
        const quantity = Number($("itemQuantity").value);
        const minimumStock = Number($("itemMinimum").value);

        if (!itemName) {
            notify("Please enter an item name.", true);
            $("itemName").focus();
            return;
        }

        if (
            !Number.isInteger(quantity) ||
            quantity < 0 ||
            !Number.isInteger(minimumStock) ||
            minimumStock < 0
        ) {
            notify(
                "Quantity and minimum stock must be non-negative integers.",
                true
            );
            return;
        }

        const payload = {
            item_name: itemName,
            sku: enteredSku || `ORB-${Date.now()}`,
            category: $("itemCategory").value.trim() || null,
            description: $("itemDescription").value.trim() || null,
            quantity,
            minimum_stock: minimumStock,
            unit: $("itemUnit").value.trim() || "pcs"
        };

        const isEditing =
            editingItemId !== null &&
            editingItemId !== undefined;

        const itemId = editingItemId;

        const path = isEditing
            ? `/inventory/${encodeURIComponent(itemId)}`
            : "/inventory";

        isSaving = true;
        saveButton.disabled = true;
        saveButton.textContent = isEditing
            ? "Updating..."
            : "Saving...";

        try {
            await apiRequest(path, {
                method: isEditing ? "PUT" : "POST",
                body: JSON.stringify(payload)
            });

            closeModal(true);
            await loadInventory();

            notify(
                isEditing
                    ? "Inventory item updated successfully."
                    : "Inventory item added successfully."
            );
        } catch (error) {
            console.error("Inventory save failed:", error);
            notify(error.message || "Unable to save inventory item.", true);
        } finally {
            isSaving = false;
            saveButton.disabled = false;
            saveButton.textContent = "Save Item";
        }
    });

    // =========================================================
    // LOAD INVENTORY
    // =========================================================

    async function loadInventory() {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="inventory-empty">
                    Loading inventory...
                </td>
            </tr>
        `;

        try {
            const data = await apiRequest("/inventory");
            inventoryItems = normalizeList(data);
            renderTable();
        } catch (error) {
            console.error("Inventory load failed:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="inventory-empty">
                        ${escapeHtml(error.message)}
                        <br><br>
                        <button
                            type="button"
                            class="btn secondary"
                            id="retryInventoryButton">
                            Retry
                        </button>
                    </td>
                </tr>
            `;

            $("retryInventoryButton")?.addEventListener(
                "click",
                loadInventory
            );
        }
    }

    // =========================================================
    // SEARCH AND FILTER
    // =========================================================

    searchInput?.addEventListener("input", renderTable);
    statusFilter?.addEventListener("change", renderTable);

    // =========================================================
    // EXPORT CSV
    // =========================================================

    exportButton?.addEventListener("click", () => {
        const rows = [
            [
                "ID",
                "Name",
                "SKU",
                "Category",
                "Quantity",
                "Minimum Stock",
                "Unit",
                "Status",
                "Description"
            ],
            ...inventoryItems.map((item) => [
                item.id,
                item.name,
                item.sku,
                item.category,
                item.quantity,
                item.minimum_stock,
                item.unit,
                getStatus(item),
                item.description
            ])
        ];

        const csv = rows.map((row) =>
            row.map((value) => {
                let text = String(value ?? "");

                // Avoid exporting values as spreadsheet formulas.
                if (/^[\s]*[=+\-@]/.test(text)) {
                    text = "'" + text;
                }

                return `"${text.replace(/"/g, '""')}"`;
            }).join(",")
        ).join("\r\n");

        const url = URL.createObjectURL(
            new Blob(["\uFEFF" + csv], {
                type: "text/csv;charset=utf-8;"
            })
        );

        const link = document.createElement("a");
        link.href = url;
        link.download = "orbit-inventory.csv";

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // =========================================================
    // INITIALIZE
    // =========================================================

    loadInventory();
})();
