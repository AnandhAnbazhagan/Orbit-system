(() => {
    const API_BASE = (
        window.API_URL ||
        window.API_BASE_URL ||
        "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");

    const POLL_INTERVAL = 5000;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    const $ = id => document.getElementById(id);

    const state = {
        user: null,
        employees: [],
        conversations: [],
        messages: [],
        activeId: null,
        activeConversation: null,
        filter: "ALL",
        mode: "DIRECT",
        file: null,
        sending: false,
        polling: null,
        toastTimer: null,
        loadingMessages: false
    };

    const ui = {
        shell: $("chatShell"),
        sidebar: $("sidebar"),
        headerAvatar: $("headerAvatar"),
        headerName: $("headerEmployeeName"),
        conversationList: $("conversationList"),
        search: $("conversationSearch"),
        filters: [...document.querySelectorAll("[data-filter]")],
        messages: $("messages"),
        chatTitle: $("chatTitle"),
        chatStatus: $("chatStatus"),
        chatAvatar: $("activeChatAvatar"),
        refresh: $("refreshChatsButton"),
        back: $("backToChatsButton"),
        form: $("messageForm"),
        input: $("messageInput"),
        send: $("sendButton"),
        fileInput: $("attachmentInput"),
        attachmentPreview: $("attachmentPreview"),
        attachmentName: $("attachmentPreviewName"),
        removeAttachment: $("removeAttachmentButton"),
        newChat: $("newChatButton"),
        newGroup: $("newGroupButton"),
        dialog: $("newChatDialog"),
        dialogForm: $("newChatForm"),
        dialogHeading: $("newChatHeading"),
        groupNameField: $("groupNameField"),
        groupName: $("newChatTitle"),
        employeeSearch: $("employeeSearch"),
        employeePicker: $("employeePicker"),
        selectionHint: $("chatSelectionHint"),
        cancelDialog: $("cancelChatDialogButton"),
        closeDialog: $("closeChatDialogButton"),
        createButton: $("createChatButton"),
        toast: $("toast")
    };

    /* -------------------- HELPERS -------------------- */

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function first(...values) {
        return values.find(value =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
        ) ?? "";
    }

    function getToken() {
        return localStorage.getItem("orbit_token") ||
            localStorage.getItem("access_token") ||
            localStorage.getItem("token") ||
            "";
    }

    function personId(person) {
        return person?.user_id ??
            person?.account_id ??
            person?.user?.id ??
            person?.user?.user_id ??
            person?.id ??
            null;
    }

    function employeeAccountId(employee) {
        // The account ID is required to create private chats.
        // Do not assume employee.id is a user/account ID.
        return employee?.user_id ??
            employee?.account_id ??
            employee?.user?.id ??
            employee?.user?.user_id ??
            null;
    }

    function personName(person) {
        if (!person) return "";

        const full = first(
            person.employee_name,
            person.display_name,
            person.full_name,
            person.name,
            person.sender_name,
            person.employee?.full_name,
            person.employee?.name,
            person.user?.full_name,
            person.user?.name,
            [person.first_name, person.last_name]
                .filter(Boolean).join(" "),
            person.username
        );

        // Never display an email address as an employee's name.
        return full && !String(full).includes("@")
            ? String(full).trim()
            : "";
    }

    function listFrom(data, key) {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.[key])) return data[key];
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.results)) return data.results;
        if (Array.isArray(data?.data)) return data.data;
        return [];
    }

    function conversationId(conversation) {
        return conversation?.id ??
            conversation?.conversation_id ??
            conversation?.chat_id ??
            null;
    }

    function messageId(message) {
        return message?.id ?? message?.message_id ?? 0;
    }

    function senderId(message) {
        return message?.sender_id ??
            message?.user_id ??
            message?.sender?.id ??
            message?.user?.id ??
            null;
    }

    function messageText(message) {
        return first(
            message?.message,
            message?.content,
            message?.text,
            ""
        );
    }

    function conversationType(conversation) {
        const type = String(
            conversation?.conversation_type ??
            conversation?.type ??
            "DIRECT"
        ).toUpperCase();

        return ["GROUP", "TEAM", "PROJECT"].includes(type)
            ? "GROUP"
            : "DIRECT";
    }

    function lastMessage(conversation) {
        return conversation?.last_message ??
            conversation?.latest_message ??
            conversation?.lastMessage ??
            null;
    }

    function timeText(value) {
        if (!value) return "";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";

        const today = new Date().toDateString() === date.toDateString();

        return today
            ? date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit"
            })
            : date.toLocaleDateString([], {
                month: "short",
                day: "numeric"
            });
    }

    function toast(message, error = false) {
        if (!ui.toast) return;

        ui.toast.textContent = message;
        ui.toast.classList.toggle("error", error);
        ui.toast.hidden = false;

        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => {
            ui.toast.hidden = true;
        }, 4000);
    }

    function showError(message) {
        console.error("[Orbit Chat]", message);
        toast(message, true);
    }

    function showMessageArea(message) {
        if (!ui.messages) return;

        ui.messages.innerHTML = `
            <div class="chat-empty">${escapeHTML(message)}</div>
        `;
    }

    /* -------------------- API -------------------- */

    async function apiRequest(path, options = {}) {
        const headers = new Headers(options.headers || {});
        const token = getToken();

        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        if (
            options.body &&
            !(options.body instanceof FormData) &&
            !headers.has("Content-Type")
        ) {
            headers.set("Content-Type", "application/json");
        }

        let response;

        try {
            response = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers
            });
        } catch (error) {
            throw new Error(
                `Cannot connect to ${API_BASE}. Make sure the FastAPI backend is running.`
            );
        }

        const contentType = response.headers.get("content-type") || "";
        let data;

        if (contentType.includes("application/json")) {
            data = await response.json().catch(() => null);
        } else {
            data = await response.text().catch(() => "");
        }

        if (!response.ok) {
            const detail = data?.detail || data?.message ||
                (typeof data === "string" ? data : "");

            throw new Error(
                `${response.status}: ${typeof detail === "string"
                    ? detail
                    : JSON.stringify(detail || response.statusText)}`
            );
        }

        return data;
    }

    /* -------------------- CURRENT USER -------------------- */

    async function loadCurrentUser() {
        try {
            const data = await apiRequest("/api/auth/me");
            state.user = data?.user || data?.data || data;

            const name = personName(state.user);

            if (ui.headerName) {
                ui.headerName.textContent = name || "Orbit User";
            }

            if (ui.headerAvatar) {
                ui.headerAvatar.textContent =
                    (name || "O").charAt(0).toUpperCase();
            }
        } catch (error) {
            console.warn("Current user endpoint failed:", error.message);

            if (ui.headerName) {
                ui.headerName.textContent = "Orbit User";
            }
        }
    }

    
async function createConversation() {
    const createButton = document.getElementById("createChatButton");
    const hint = document.getElementById("chatSelectionHint");
    const groupNameInput = document.getElementById("groupNameField");

    if (createButton) createButton.disabled = true;

    try {
        // Get selected employees from the existing picker.
        const checked = Array.from(
            document.querySelectorAll(
                '#employeePicker input[type="checkbox"]:checked'
            )
        );
        const userId = employee.user_id ?? employee.user?.id;

if (!userId) {
    // This employee has no linked user account.
    return;
}

// The checkbox value must be users.id, not employees.id.
checkbox.value = String(userId);

        const selectedUserIds = [
            ...new Set(
                checked
                    .map(input => input.value)
                    .filter(Boolean)
                    .map(value => Number(value))
                    .filter(Number.isInteger)
                    .filter(id => id > 0)
            )
        ];

        if (selectedUserIds.length === 0) {
            throw new Error("Select at least one employee.");
        }

        const isGroup = state.mode === "GROUP";

        if (!isGroup && selectedUserIds.length !== 1) {
            throw new Error(
                "Private chat requires exactly one other employee."
            );
        }

        const groupName = groupNameInput?.value.trim() || "";

        if (isGroup && !groupName) {
            throw new Error("Enter a name for the group.");
        }

        const payload = {
            conversation_type: isGroup ? "GROUP" : "DIRECT",
            name: isGroup ? groupName : null,
            member_user_ids: selectedUserIds
        };

        // Create the conversation through the backend API.
        const result = await apiRequest("/api/chat/conversations", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        // Support common response formats.
        const conversation =
            result?.conversation ||
            result?.data ||
            result;

        const conversationId =
            conversation?.id ??
            conversation?.conversation_id;

        if (!conversationId) {
            throw new Error(
                "The server did not return a conversation ID. Check the API response."
            );
        }

        // Close the dialog only after the server successfully creates it.
        const dialog = document.getElementById("newChatDialog");
        if (dialog?.open) dialog.close();

        if (hint) hint.textContent = "";

        // Refresh the sidebar and open the new private chat.
        await loadConversations();
        await openConversation(conversationId);

        showToast(
            isGroup
                ? "Group chat created."
                : "Private chat opened.",
            "success"
        );

    } catch (error) {
        console.error("Create conversation failed:", error);

        if (hint) {
            hint.textContent =
                error.message || "Could not create the conversation.";
        }

        showToast(
            error.message || "Could not create the conversation.",
            "error"
        );

    } finally {
        if (createButton) createButton.disabled = false;
    }
}

    /* -------------------- LOAD CONVERSATIONS -------------------- */

    async function loadConversations() {
        try {
            const data = await apiRequest("/api/chat/conversations");
            state.conversations = listFrom(data, "conversations");

            renderConversations();

            if (state.activeId) {
                const current = state.conversations.find(
                    item => String(conversationId(item)) ===
                        String(state.activeId)
                );

                if (current) {
                    state.activeConversation = current;
                    updateChatHeader(current);
                }
            }
        } catch (error) {
            console.error("Conversation loading failed:", error);

            if (!state.conversations.length) {
                ui.conversationList.innerHTML = `
                    <div class="chat-empty">
                        <strong>Unable to load chats</strong>
                        <p>${escapeHTML(error.message)}</p>
                        <button type="button"
                            class="chat-btn-primary"
                            id="retryChatsButton">
                            Try again
                        </button>
                    </div>
                `;

                $("retryChatsButton")?.addEventListener(
                    "click", loadConversations
                );
            }
        }
    }

    function conversationName(conversation) {
        const explicitName = first(
            conversation?.display_name,
            conversation?.conversation_name,
            conversation?.name,
            conversation?.title
        );

        if (explicitName) return String(explicitName);

        const members = conversation?.members ||
            conversation?.participants || [];

        const currentId = personId(state.user);

        const other = members.find(member => {
            const id = personId(member);
            return id != null &&
                (currentId == null || String(id) !== String(currentId));
        });

        return personName(other) || "Private conversation";
    }

    function renderConversations() {
        if (!ui.conversationList) return;

        const query = (ui.search?.value || "").trim().toLowerCase();

        const conversations = state.conversations.filter(conversation => {
            const type = conversationType(conversation);
            const name = conversationName(conversation).toLowerCase();
            const last = lastMessage(conversation);
            const preview = messageText(last).toLowerCase();

            const matchesFilter =
                state.filter === "ALL" || state.filter === type;

            return matchesFilter &&
                (!query || name.includes(query) || preview.includes(query));
        });

        if (!conversations.length) {
            ui.conversationList.innerHTML = `
                <div class="chat-empty">
                    ${state.conversations.length
                        ? "No conversations match your search."
                        : "No chats yet. Use + to start a conversation."}
                </div>
            `;
            return;
        }

        ui.conversationList.innerHTML = conversations.map(conversation => {
            const id = conversationId(conversation);
            const name = conversationName(conversation);
            const last = lastMessage(conversation);
            const preview = last
                ? (messageText(last) || "Attachment")
                : "Start a conversation";
            const type = conversationType(conversation);
            const active = String(id) === String(state.activeId);

            return `
                <button
                    type="button"
                    class="chat-conversation-item ${active ? "active" : ""}"
                    data-conversation-id="${escapeHTML(id)}">

                    <span class="chat-avatar ${type === "GROUP" ? "group" : ""}">
                        ${escapeHTML(name.charAt(0).toUpperCase() || "C")}
                    </span>

                    <span class="chat-conversation-details">
                        <span class="chat-conversation-top">
                            <span class="chat-conversation-name">
                                ${escapeHTML(name)}
                            </span>
                            <span class="chat-conversation-time">
                                ${escapeHTML(timeText(
                                    last?.created_at ||
                                    conversation.updated_at ||
                                    conversation.created_at
                                ))}
                            </span>
                        </span>

                        <span class="chat-conversation-preview">
                            ${escapeHTML(preview)}
                        </span>
                    </span>
                </button>
            `;
        }).join("");

        ui.conversationList
            .querySelectorAll("[data-conversation-id]")
            .forEach(button => {
                button.addEventListener("click", () => {
                    openConversation(button.dataset.conversationId);
                });
            });
    }

    /* -------------------- OPEN CONVERSATION -------------------- */

    function updateChatHeader(conversation) {
        const name = conversationName(conversation);

        if (ui.chatTitle) ui.chatTitle.textContent = name;

        if (ui.chatAvatar) {
            ui.chatAvatar.textContent =
                name.charAt(0).toUpperCase() || "C";

            ui.chatAvatar.classList.toggle(
                "group",
                conversationType(conversation) === "GROUP"
            );
        }

        if (ui.chatStatus) {
            ui.chatStatus.textContent =
                conversationType(conversation) === "GROUP"
                    ? "Group conversation"
                    : "Private conversation";
        }
    }

    async function openConversation(id) {
        if (!id) return;

        stopPolling();

        state.activeId = id;
        state.activeConversation = state.conversations.find(
            item => String(conversationId(item)) === String(id)
        ) || { id, name: "Conversation" };

        if (ui.shell) {
            ui.shell.dataset.activeConversation = String(id);
            ui.shell.classList.add("mobile-chat-open");
        }

        state.messages = [];

        updateChatHeader(state.activeConversation);
        renderConversations();
        updateComposer();

        showMessageArea("Loading messages...");

        await loadMessages(id);
        startPolling();
    }

    /* -------------------- LOAD MESSAGES -------------------- */

    async function loadMessages(id, quiet = false) {
        if (!id || state.loadingMessages) return;

        state.loadingMessages = true;

        try {
            const data = await apiRequest(
                `/api/chat/${encodeURIComponent(id)}/messages`
            );

            if (String(state.activeId) !== String(id)) return;

            const messages = listFrom(data, "messages");

            messages.sort((a, b) => {
                const aTime = new Date(
                    a.created_at || a.timestamp || 0
                ).getTime();

                const bTime = new Date(
                    b.created_at || b.timestamp || 0
                ).getTime();

                return aTime - bTime;
            });

            const previousLast = state.messages.length
                ? messageId(state.messages[state.messages.length - 1])
                : 0;

            state.messages = messages;
            renderMessages();

            const newLast = messages.length
                ? messageId(messages[messages.length - 1])
                : 0;

            if (!quiet || String(previousLast) !== String(newLast)) {
                scrollToBottom();
            }
        } catch (error) {
            console.error("Message loading failed:", error);

            if (!quiet) {
                showMessageArea(`Unable to load messages: ${error.message}`);
            }
        } finally {
            state.loadingMessages = false;
        }
    }

    /* -------------------- RENDER MESSAGES -------------------- */

    function getSenderName(message) {
        const name = personName(message.sender) ||
            personName(message.user) ||
            first(
                message.sender_name,
                message.employee_name,
                message.display_name
            );

        if (name && !String(name).includes("@")) return String(name);

        const id = senderId(message);
        const employee = state.employees.find(item =>
            String(employeeAccountId(item)) === String(id)
        );

        if (employee) return personName(employee) || "Employee";

        if (
            id != null &&
            personId(state.user) != null &&
            String(id) === String(personId(state.user))
        ) {
            return personName(state.user) || "You";
        }

        return "Employee";
    }

    function isMine(message) {
        const from = senderId(message);
        const me = personId(state.user);

        return from != null && me != null &&
            String(from) === String(me);
    }

    function renderMessages() {
        if (!ui.messages) return;

        if (!state.activeId) {
            showMessageArea("Select a conversation or start a new chat.");
            return;
        }

        if (!state.messages.length) {
            showMessageArea("No messages yet. Send the first message.");
            return;
        }

        ui.messages.innerHTML = state.messages.map(message => {
            const mine = isMine(message);
            const text = messageText(message);
            const sender = getSenderName(message);
            const time = timeText(
                message.created_at || message.timestamp
            );

            const path = first(
                message.file_path,
                message.file_url,
                message.attachment_url
            );

            const fileName = first(message.file_name, "Attachment");
            const type = String(
                message.message_type || message.type || ""
            ).toUpperCase();

            let attachment = "";

            if (path) {
                const isImage = type === "IMAGE" ||
                    /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);

                const href = getFileUrl(path);

                if (isImage) {
                    attachment = `
                        <a class="chat-attachment-link"
                           href="${escapeHTML(href)}"
                           target="_blank"
                           rel="noopener">
                            ${escapeHTML(fileName)}
                        </a>
                        <img class="chat-attachment-image"
                             src="${escapeHTML(href)}"
                             alt="${escapeHTML(fileName)}"
                             loading="lazy"
                             onerror="this.style.display='none'">
                    `;
                } else {
                    attachment = `
                        <a class="chat-attachment-link"
                           href="${escapeHTML(href)}"
                           target="_blank"
                           rel="noopener">
                            📎 ${escapeHTML(fileName)}
                        </a>
                    `;
                }
            }

            return `
                <div class="chat-message ${mine ? "mine" : "other"}">
                    <div class="chat-bubble">
                        ${!mine && conversationType(
                            state.activeConversation || {}
                        ) === "GROUP"
                            ? `<span class="chat-sender-name">${escapeHTML(sender)}</span>`
                            : ""}

                        ${text
                            ? `<div class="chat-message-text">${escapeHTML(text)}</div>`
                            : ""}

                        ${attachment}

                        <div class="chat-message-meta">
                            ${escapeHTML(time)}
                        </div>
                    </div>
                </div>
            `;
        }).join("");
    }

    function getFileUrl(path) {
        const value = String(path || "");

        if (/^https?:\/\//i.test(value)) return value;

        if (value.startsWith("/")) return `${API_BASE}${value}`;

        return `${API_BASE}/${value}`;
    }

    function scrollToBottom() {
        if (ui.messages) {
            ui.messages.scrollTop = ui.messages.scrollHeight;
        }
    }

    /* -------------------- COMPOSER -------------------- */

    function updateComposer() {
        const hasConversation = Boolean(state.activeId);
        const hasText = Boolean(ui.input?.value.trim());
        const hasFile = Boolean(state.file);

        if (ui.input) {
            ui.input.disabled = !hasConversation || state.sending;
        }

        if (ui.send) {
            ui.send.disabled = !hasConversation ||
                (!hasText && !hasFile) ||
                state.sending;

            ui.send.textContent = state.sending ? "…" : "➤";
        }
    }

    function selectFile(file) {
        if (!file) {
            state.file = null;

            if (ui.fileInput) ui.fileInput.value = "";
            if (ui.attachmentPreview) {
                ui.attachmentPreview.hidden = true;
            }

            updateComposer();
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showError("Files must be 10 MB or smaller.");
            if (ui.fileInput) ui.fileInput.value = "";
            return;
        }

        state.file = file;

        if (ui.attachmentName) {
            ui.attachmentName.textContent = file.name;
        }

        if (ui.attachmentPreview) {
            ui.attachmentPreview.hidden = false;
        }

        updateComposer();
    }

    async function sendMessage(event) {
        event?.preventDefault();

        if (state.sending || !state.activeId) return;

        const text = ui.input?.value.trim() || "";
        const file = state.file;

        if (!text && !file) return;

        state.sending = true;
        updateComposer();

        try {
            const id = state.activeId;

            if (text) {
                await apiRequest(
                    `/api/chat/${encodeURIComponent(id)}/messages`,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            message: text,
                            message_type: "TEXT"
                        })
                    }
                );
            }

            if (file) {
                await uploadFile(file, id);
            }

            if (ui.input) ui.input.value = "";
            selectFile(null);

            await loadMessages(id);
            await loadConversations();
            scrollToBottom();
        } catch (error) {
            console.error("Send failed:", error);
            showError(`Could not send message: ${error.message}`);
        } finally {
            state.sending = false;
            updateComposer();
        }
    }

    async function uploadFile(file, conversationIdValue) {
        const formData = new FormData();
        formData.append("file", file);

        const result = await apiRequest(
            `/api/chat/upload?conversation_id=${encodeURIComponent(
                conversationIdValue
            )}`,
            {
                method: "POST",
                body: formData
            }
        );

        const path = first(
            result?.file_path,
            result?.file_url,
            result?.url
        );

        if (!path) {
            throw new Error(
                "The upload response did not include a file path."
            );
        }

        await apiRequest(
            `/api/chat/${encodeURIComponent(conversationIdValue)}/messages`,
            {
                method: "POST",
                body: JSON.stringify({
                    message: "",
                    message_type: first(
                        result?.message_type,
                        file.type.startsWith("image/") ? "IMAGE" : "FILE"
                    ),
                    file_name: first(result?.file_name, file.name),
                    file_path: path
                })
            }
        );
    }

    /* -------------------- CREATE CONVERSATION -------------------- */

    async function loadEmployees() {
        const data = await apiRequest("/api/employees");
        state.employees = listFrom(data, "employees");
        return state.employees;
    }

    function renderEmployeePicker() {
        if (!ui.employeePicker) return;

        const query = (ui.employeeSearch?.value || "")
            .trim().toLowerCase();

        const myId = personId(state.user);

        const employees = state.employees.filter(employee => {
            const id = employeeAccountId(employee);
            const name = personName(employee);

            if (id == null || !name) return false;
            if (myId != null && String(id) === String(myId)) return false;

            return name.toLowerCase().includes(query);
        });

        if (!employees.length) {
            ui.employeePicker.innerHTML = `
                <div class="chat-empty">
                    No employees available to select.
                    <br><br>
                    The employee API must return a user_id or nested user.id.
                </div>
            `;
            return;
        }

        ui.employeePicker.innerHTML = employees.map(employee => {
            const id = employeeAccountId(employee);
            const name = personName(employee);
            const department = first(
                employee.department_name,
                employee.department?.name,
                employee.department
            );

            return `
                <label class="employee-option">
                    <input type="checkbox"
                           name="chatEmployee"
                           value="${escapeHTML(id)}">

                    <span class="employee-option-details">
                        <span class="employee-option-name">
                            ${escapeHTML(name)}
                        </span>
                        ${department
                            ? `<span class="employee-option-email">${escapeHTML(department)}</span>`
                            : ""}
                    </span>
                </label>
            `;
        }).join("");
    }

    async function openNewChat(mode) {
        state.mode = mode;

        if (!ui.dialog) {
            showError("The new chat dialog is missing in chat.html.");
            return;
        }

        if (ui.dialogHeading) {
            ui.dialogHeading.textContent = mode === "GROUP"
                ? "Create a group conversation"
                : "Start a private conversation";
        }

        if (ui.groupNameField) {
            ui.groupNameField.hidden = mode !== "GROUP";
        }

        if (ui.groupName) ui.groupName.value = "";

        if (ui.selectionHint) {
            ui.selectionHint.textContent = mode === "GROUP"
                ? "Select at least two other employees for a group."
                : "Select one employee for a private chat.";
        }

        if (ui.employeeSearch) ui.employeeSearch.value = "";

        ui.employeePicker.innerHTML =
            '<div class="chat-empty">Loading employees...</div>';

        try {
            await loadEmployees();
            renderEmployeePicker();
        } catch (error) {
            console.error("Employee loading failed:", error);
            ui.employeePicker.innerHTML = `
                <div class="chat-empty">
                    Could not load employees.<br>
                    ${escapeHTML(error.message)}
                </div>
            `;
        }

        if (!ui.dialog.open) ui.dialog.showModal();
    }

    async function createConversation(event) {
        event.preventDefault();

        const selectedIds = [
            ...document.querySelectorAll(
                'input[name="chatEmployee"]:checked'
            )
        ].map(input => input.value);

        const minimum = state.mode === "GROUP" ? 2 : 1;

        if (selectedIds.length < minimum) {
            toast(
                state.mode === "GROUP"
                    ? "Select at least two employees for a group."
                    : "Select one employee for a private chat.",
                true
            );
            return;
        }

        if (ui.createButton) {
            ui.createButton.disabled = true;
            ui.createButton.textContent = "Creating...";
        }

        try {
            const result = await apiRequest(
                "/api/chat/conversations",
                {
                    method: "POST",
                    body: JSON.stringify({
                        name: state.mode === "GROUP"
                            ? (ui.groupName?.value.trim() || null)
                            : null,
                        conversation_type: state.mode,
                        member_user_ids: selectedIds
                    })
                }
            );

            const conversation = result?.conversation ||
                result?.data || result;

            const newId = conversationId(conversation);

            if (ui.dialog.open) ui.dialog.close();

            await loadConversations();

            if (newId != null) {
                await openConversation(newId);
            } else {
                const found = state.conversations.find(item => {
                    const members = item.members || item.participants || [];
                    return members.some(member =>
                        selectedIds.includes(String(personId(member)))
                    );
                });

                if (found) {
                    await openConversation(conversationId(found));
                } else {
                    toast("Chat created. Refresh the conversation list.");
                }
            }
        } catch (error) {
            console.error("Create chat failed:", error);
            showError(`Could not create chat: ${error.message}`);
        } finally {
            if (ui.createButton) {
                ui.createButton.disabled = false;
                ui.createButton.textContent = "Start Chat";
            }
        }
    }

    /* -------------------- POLLING -------------------- */

    function stopPolling() {
        if (state.polling) clearInterval(state.polling);
        state.polling = null;
    }

    function startPolling() {
        stopPolling();

        state.polling = setInterval(() => {
            if (document.hidden || !state.activeId) return;

            loadMessages(state.activeId, true);
            loadConversations();
        }, POLL_INTERVAL);
    }

    /* -------------------- EVENT HANDLERS -------------------- */

    function bindEvents() {
        ui.search?.addEventListener("input", renderConversations);

        ui.filters.forEach(button => {
            button.addEventListener("click", () => {
                state.filter = button.dataset.filter || "ALL";

                ui.filters.forEach(filter => {
                    filter.classList.toggle("active", filter === button);
                });

                renderConversations();
            });
        });

        ui.form?.addEventListener("submit", sendMessage);

        ui.input?.addEventListener("input", updateComposer);

        ui.input?.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();

                if (ui.send && !ui.send.disabled) {
                    sendMessage(event);
                }
            }
        });

        ui.fileInput?.addEventListener("change", () => {
            selectFile(ui.fileInput.files?.[0] || null);
        });

        ui.removeAttachment?.addEventListener("click", () => {
            selectFile(null);
        });

        ui.newChat?.addEventListener("click", () => {
            openNewChat("DIRECT");
        });

        ui.newGroup?.addEventListener("click", () => {
            openNewChat("GROUP");
        });

        ui.dialogForm?.addEventListener("submit", createConversation);

        ui.cancelDialog?.addEventListener("click", () => {
            if (ui.dialog?.open) ui.dialog.close();
        });

        ui.closeDialog?.addEventListener("click", () => {
            if (ui.dialog?.open) ui.dialog.close();
        });

        ui.employeeSearch?.addEventListener("input", renderEmployeePicker);

        ui.refresh?.addEventListener("click", async () => {
            await loadConversations();

            if (state.activeId) {
                await loadMessages(state.activeId);
            }
        });

        ui.back?.addEventListener("click", () => {
            ui.shell?.classList.remove("mobile-chat-open");
        });

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stopPolling();
            } else if (state.activeId) {
                loadMessages(state.activeId, true);
                startPolling();
            }
        });
    }

    /* -------------------- INITIALIZE -------------------- */

    async function init() {
        console.info("Orbit System chat initialized.");

        if (!ui.shell || !ui.conversationList || !ui.messages) {
            console.error("Required chat HTML elements are missing.", {
                chatShell: Boolean(ui.shell),
                conversationList: Boolean(ui.conversationList),
                messages: Boolean(ui.messages)
            });
            return;
        }

        bindEvents();
        updateComposer();

        ui.conversationList.innerHTML =
            '<div class="chat-empty">Connecting to chat service...</div>';

        showMessageArea("Select a conversation or start a new chat.");

        await loadCurrentUser();
        await loadConversations();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
