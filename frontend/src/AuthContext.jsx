import { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api.js";

// AuthContext remembers WHO is signed in and lets every page ask about it.
// Any page can write:  const { user, login, logout } = useAuth();

const AuthContext = createContext(null);
const TOKEN_KEY = "malariascan_token";

// Where the token is kept. localStorage survives closing the browser
// ("Keep me signed in"); sessionStorage is forgotten when the tab closes.
// Each access is wrapped in try/catch because browsers can block storage.
function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(token, remember) {
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked: the user just stays signed in until they refresh */
  }
}
function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to do */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // the signed-in person (or null)
  const [token, setToken] = useState(readToken); // their login token (or null)
  const [loading, setLoading] = useState(!!readToken()); // true while we check a saved token

  // When the site opens and a token is saved, ask the server who it belongs to
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api("/auth/me/", { token })
      .then((me) => setUser(me))
      .catch(() => {
        // token is old or invalid: forget it
        clearToken();
        setToken(null);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sign in. Returns the user, or throws an ApiError with a friendly message.
  //   expectedRole - the profile chosen on the welcome page (e.g. "nurse")
  async function login(email, password, remember, expectedRole) {
    const data = await api("/auth/login/", { method: "POST", body: { email, password } });

    // The server decides the REAL role. If it is not the profile that was chosen,
    // cancel this login on the server and explain what to do.
    if (expectedRole && data.user.role !== expectedRole) {
      try {
        await api("/auth/logout/", { method: "POST", token: data.token });
      } catch {
        /* nothing more we can do */
      }
      throw new ApiError(
        "This is a " + data.user.role_display + " account. Please choose the " +
          data.user.role_display + " profile on the right to sign in.",
        0
      );
    }

    saveToken(data.token, remember);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  // Sign out: tell the server, then forget everything here
  async function logout() {
    try {
      await api("/auth/logout/", { method: "POST", token });
    } catch {
      /* even if the server is unreachable, we still sign out here */
    }
    clearToken();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}