import { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api.js";

// AuthContext remembers WHO is signed in and lets every page ask about it.
// Any page can write:  const { user, login, logout } = useAuth();

const AuthContext = createContext(null);
const TOKEN_KEY = "malariascan_token";

// Where the token is kept.
//   sessionStorage = THIS browser tab only. Every tab remembers its own person, so you can
//                    have a nurse in one tab and a doctor in another, and refreshing keeps each one.
//   localStorage   = shared by all tabs and survives closing the browser ("Keep me signed in").
//                    It is only used to sign a NEW tab in as the person who last chose to be remembered.
// Each access is wrapped in try/catch because browsers can block storage.
function readToken() {
  try {
    const own = sessionStorage.getItem(TOKEN_KEY);           // this tab's own sign-in comes first
    if (own) return own;
    const remembered = localStorage.getItem(TOKEN_KEY);      // a new tab: use the remembered person
    if (remembered) sessionStorage.setItem(TOKEN_KEY, remembered);   // and from now on this tab keeps it
    return remembered;
  } catch {
    return null;
  }
}
function saveToken(token, remember) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);                // always: this tab
    if (remember) localStorage.setItem(TOKEN_KEY, token);    // also for new tabs and after closing the browser
  } catch {
    /* storage blocked: the user just stays signed in until they refresh */
  }
}
// Forget this tab's sign-in. The shared "remembered" copy is only removed if it is the SAME person,
// so signing out in one tab does not sign out a different person in another tab.
function clearToken() {
  try {
    const own = sessionStorage.getItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (!own || localStorage.getItem(TOKEN_KEY) === own) localStorage.removeItem(TOKEN_KEY);
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