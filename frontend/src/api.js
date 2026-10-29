// api.js - the ONE place that talks to the Django backend.
// Every page calls api(...) instead of using fetch() directly.

// Where the backend lives. (Later, for deployment, we change this one line.)
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

// A small error type that carries the message to show the user and the HTTP status
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Turn whatever the server sent back into one friendly sentence
function errorMessage(data, status) {
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (data && typeof data.detail === "string") return data.detail;
  if (Array.isArray(data) && data.length) return String(data[0]);
  if (data && typeof data === "object") {
    // field errors look like { "email": ["Enter a valid email."] }
    const first = Object.values(data)[0];
    if (Array.isArray(first) && first.length) return String(first[0]);
    if (typeof first === "string") return first;
  }
  return "Something went wrong (error " + status + "). Please try again.";
}

// Downloads a file the server builds (an Excel sheet). A normal link cannot send our login
// token, so we fetch the file ourselves and then hand it to the browser to save.
//   path     - e.g. "/users/export/?role=nurse"
//   filename - what the file is called on the person's computer
export async function downloadFile(path, filename, token) {
  let response;
  try {
    response = await fetch(API_URL + path, { headers: token ? { Authorization: "Token " + token } : {} });
  } catch {
    throw new ApiError("Cannot reach the server. Please check that it is running.", 0);
  }
  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    throw new ApiError(errorMessage(data, response.status), response.status);
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// api("/auth/login/", { method: "POST", body: { email, password } })
//   path   - the part after /api, e.g. "/patients/"
//   method - GET (default), POST, PATCH ...
//   body   - an object we send as JSON (or a FormData when uploading a file)
//   token  - the login token (added as a header so the server knows who we are)
export async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  const isFile = body instanceof FormData;               // an image upload, not JSON
  if (body !== undefined && !isFile) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Token " + token;

  let response;
  try {
    response = await fetch(API_URL + path, {
      method,
      headers,
      body: body === undefined ? undefined : isFile ? body : JSON.stringify(body),
    });
  } catch {
    // fetch only throws when the server cannot be reached at all
    throw new ApiError("Cannot reach the server. Please check that it is running.", 0);
  }

  // 204 means "done, nothing to send back"
  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) throw new ApiError(errorMessage(data, response.status), response.status);
  return data;
}