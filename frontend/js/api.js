const API_BASE_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "orbit_token";
const USER_KEY = "orbit_user";

// =========================================================
// AUTHENTICATION HELPERS
// =========================================================

function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function setAuthToken(token) {
    if (!token || typeof token !== "string") {
        throw new Error("Cannot save an empty authentication token.");
    }

    localStorage.setItem(TOKEN_KEY, token);
}

function clearAuthToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function getAuthHeaders(customHeaders = {}) {
    const headers = {
        Accept: "application/json",
        ...customHeaders
    };

    const token = getAuthToken();

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

// =========================================================
// READABLE ERROR MESSAGES
// =========================================================

function getReadableErrorMessage(error) {
    if (typeof error === "string") return error;

    if (error === null || error === undefined) {
        return "An unexpected error occurred.";
    }

    if (Array.isArray(error)) {
        return error.map(getReadableErrorMessage).join(", ");
    }

    if (typeof error === "object") {
        if (error.message) return error.message;
        if (error.msg) return error.msg;

        if (error.detail !== undefined) {
            return getReadableErrorMessage(error.detail);
        }

        if (error.error !== undefined) {
            return getReadableErrorMessage(error.error);
        }

        try {
            return JSON.stringify(error);
        } catch {
            return "An unexpected error occurred.";
        }
    }

    return String(error);
}

// =========================================================
// MAIN API REQUEST
// =========================================================

async function apiRequest(path, options = {}) {
    const {
        headers: customHeaders = {},
        ...fetchOptions
    } = options;

    const headers = getAuthHeaders(customHeaders);

    // Let the browser set multipart/form-data boundaries.
    const isFormData =
        typeof FormData !== "undefined" &&
        fetchOptions.body instanceof FormData;

    if (
        fetchOptions.body !== undefined &&
        fetchOptions.body !== null &&
        !isFormData &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] = "application/json";
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...fetchOptions,
            headers
        });
    } catch (error) {
        console.error("Orbit API connection error:", error);

        throw new Error(
            "Cannot connect to Orbit API. Start FastAPI at " +
            API_BASE_URL
        );
    }

    const contentType = response.headers.get("content-type") || "";
    let result = null;

    try {
        if (contentType.includes("application/json")) {
            result = await response.json();
        } else {
            const text = await response.text();
            result = text || null;
        }
    } catch (error) {
        console.error("Unable to read API response:", error);
    }

    if (response.status === 401) {
        // Do not redirect login requests when credentials are incorrect.
        if (path !== "/api/auth/login") {
            clearAuthToken();
        }

        throw new Error(
            path === "/api/auth/login"
                ? getReadableErrorMessage(
                    result?.detail || "Invalid email or password."
                )
                : "Your session is missing or expired. Please sign in again."
        );
    }

    if (response.status === 403) {
        throw new Error(
            getReadableErrorMessage(
                result?.detail || "You do not have permission."
            )
        );
    }

    if (!response.ok) {
        const message =
            result?.detail ??
            result?.message ??
            result?.error ??
            result ??
            `Request failed with status ${response.status}.`;

        console.error("Orbit API request failed:", {
            path,
            status: response.status,
            response: result
        });

        throw new Error(getReadableErrorMessage(message));
    }

    return result;
}

// =========================================================
// HTTP HELPERS
// =========================================================

async function apiGet(path) {
    return apiRequest(path, { method: "GET" });
}

async function apiPost(path, data) {
    return apiRequest(path, {
        method: "POST",
        body: JSON.stringify(data)
    });
}

async function apiPut(path, data) {
    return apiRequest(path, {
        method: "PUT",
        body: JSON.stringify(data)
    });
}

async function apiPatch(path, data) {
    return apiRequest(path, {
        method: "PATCH",
        body: JSON.stringify(data)
    });
}

async function apiDelete(path) {
    return apiRequest(path, { method: "DELETE" });
}

async function apiUpload(path, formData, method = "POST") {
    if (!(formData instanceof FormData)) {
        throw new Error("File upload requires FormData.");
    }

    return apiRequest(path, {
        method,
        body: formData
    });
}

// =========================================================
// LOGIN
// =========================================================

async function apiLogin(email, password) {
    const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
            email: email.trim(),
            password
        })
    });

    if (!response?.access_token) {
        throw new Error("Login response did not contain an access token.");
    }

    setAuthToken(response.access_token);

    try {
        const user = await apiGetCurrentUser();
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        return { ...response, user };
    } catch (error) {
        clearAuthToken();
        throw error;
    }
}

// =========================================================
// CURRENT USER
// =========================================================

async function apiGetCurrentUser() {
    return apiGet("/api/auth/me");
}

// =========================================================
// REQUIRE AUTHENTICATION
// Dashboard and other protected pages can use this function.
// =========================================================

async function requireAuth() {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "login.html";
        return null;
    }

    try {
        const user = await apiGetCurrentUser();

        localStorage.setItem(USER_KEY, JSON.stringify(user));

        return user;
    } catch (error) {
        console.error("Authentication check failed:", error);

        clearAuthToken();
        window.location.href = "login.html";

        return null;
    }
}

// =========================================================
// LOGOUT
// =========================================================

async function apiLogout() {
    try {
        if (getAuthToken()) {
            await apiPost("/api/auth/logout", {});
        }
    } catch (error) {
        console.warn("Logout request failed:", error);
    } finally {
        clearAuthToken();
        window.location.href = "login.html";
    }
}

// =========================================================
// STATUS HELPERS
// =========================================================

function isAuthenticated() {
    return Boolean(getAuthToken());
}

function getApiBaseUrl() {
    return API_BASE_URL;
}

// =========================================================
// EXPOSE HELPERS FOR OTHER FRONTEND SCRIPTS
// =========================================================

Object.assign(window, {
    getAuthToken,
    setAuthToken,
    clearAuthToken,
    getAuthHeaders,
    getReadableErrorMessage,
    apiRequest,
    apiGet,
    apiPost,
    apiPut,
    apiPatch,
    apiDelete,
    apiUpload,
    apiLogin,
    apiGetCurrentUser,
    requireAuth,
    apiLogout,
    isAuthenticated,
    getApiBaseUrl
});