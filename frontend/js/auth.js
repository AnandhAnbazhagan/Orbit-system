document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("loginForm");

    if (!form) {
        console.error("Login form #loginForm was not found.");
        return;
    }

    form.addEventListener("submit", handleLogin);
});

async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const button = document.getElementById("loginButton");
    const errorBox = document.getElementById("loginError");

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    clearLoginError();

    if (!email || !password) {
        showLoginError("Please enter your email and password.");
        return;
    }

    const originalButtonHTML = button?.innerHTML;

    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = "Signing in...";
        }

        let response = await sendLoginRequest(email, password);
        let data = await readResponse(response);

        /*
         * Some FastAPI login endpoints use OAuth2 form fields
         * (username/password) instead of JSON (email/password).
         * Retry with form data if the JSON format is rejected
         * with HTTP 422.
         */
        if (response.status === 422) {
            response = await fetch(
                "http://127.0.0.1:8000/api/auth/login",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        username: email,
                        password: password
                    })
                }
            );

            data = await readResponse(response);
        }

        console.log("Orbit login response:", {
            status: response.status,
            data: data
        });

        if (!response.ok) {
            throw new Error(getErrorMessage(data, response.status));
        }

        const result = data?.data || data;

        const accessToken =
            result?.access_token ||
            result?.token ||
            result?.accessToken;

        if (!accessToken) {
            throw new Error(
                "Login response did not contain an access token. " +
                "Check the response from your FastAPI login endpoint."
            );
        }

        // Save the token using the key expected by Orbit's API helper.
        localStorage.setItem("orbit_token", accessToken);

        // Store user information when the backend returns it.
        const user = result?.user || result?.employee;

        if (user && typeof user === "object") {
            localStorage.setItem("orbit_user", JSON.stringify(user));
        }

        const remember = document.getElementById("remember");

        if (remember?.checked) {
            localStorage.setItem("orbit_remember", "true");
        } else {
            localStorage.removeItem("orbit_remember");
        }

        // Redirect according to the returned role.
        const role = String(
            user?.role ||
            result?.role ||
            ""
        ).toUpperCase();

        let destination = "dashboard.html";

        if (role === "MANAGER") {
            destination = "manager-dashboard.html";
        } else if (role === "EMPLOYEE") {
            destination = "employee-dashboard.html";
        } else if (
            role === "EXECUTIVE" ||
            role === "CEO" ||
            role === "DIRECTOR" ||
            role === "ADMIN"
        ) {
            destination = "dashboard.html";
        }

        showLoginSuccess("Login successful. Opening your workspace...");

        // Allow the success message to be seen.
        window.setTimeout(() => {
            window.location.href = destination;
        }, 500);

    } catch (error) {
        console.error("Orbit login error:", error);

        showLoginError(
            error.message || "Unable to sign in. Please try again."
        );

    } finally {
        if (button) {
            button.disabled = false;

            if (originalButtonHTML) {
                button.innerHTML = originalButtonHTML;
            } else {
                button.textContent = "Sign in";
            }
        }
    }
}

/* =========================================================
   SEND JSON LOGIN REQUEST
========================================================= */

async function sendLoginRequest(email, password) {
    return fetch("http://127.0.0.1:8000/api/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            email: email,
            password: password
        })
    });
}

/* =========================================================
   READ SERVER RESPONSE SAFELY
========================================================= */

async function readResponse(response) {
    const text = await response.text();

    if (!text) {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch {
        return {
            detail: text
        };
    }
}

/* =========================================================
   ERROR MESSAGE HANDLING
========================================================= */

function getErrorMessage(data, status) {
    const detail = data?.detail || data?.message;

    if (Array.isArray(detail)) {
        return detail
            .map(item => item.msg || JSON.stringify(item))
            .join(", ");
    }

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (status === 401) {
        return "Incorrect email or password.";
    }

    if (status === 404) {
        return "Login endpoint not found. Check your backend route.";
    }

    if (status === 422) {
        return "The login fields do not match the backend requirements.";
    }

    if (status >= 500) {
        return "Backend server error. Check the FastAPI terminal.";
    }

    return `Sign-in failed (HTTP ${status}).`;
}

/* =========================================================
   DISPLAY MESSAGES IN login.html
========================================================= */

function clearLoginError() {
    const errorBox = document.getElementById("loginError");

    if (errorBox) {
        errorBox.textContent = "";
        errorBox.classList.remove("login-success");
    }
}

function showLoginError(message) {
    const errorBox = document.getElementById("loginError");

    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.remove("login-success");
        errorBox.style.display = "block";
    } else {
        alert(message);
    }
}

function showLoginSuccess(message) {
    const errorBox = document.getElementById("loginError");

    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.add("login-success");
        errorBox.style.display = "block";
    }
}