import { Navigate } from "react-router-dom";
import { Button, Spinner } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";

// TEMPORARY page shown after signing in. Next we replace it with the real
// screens for each role (nurse, lab technician, doctor, admin).
export default function Dashboard() {
  const { user, loading, logout } = useAuth();

  // Still checking a saved login: show a spinner
  if (loading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  // Not signed in: back to the welcome page
  if (!user) return <Navigate to="/" replace />;

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center text-center p-4">
      <div>
        <i className="bi bi-check-circle-fill text-primary" style={{ fontSize: "3rem" }}></i>
        <h2 className="fw-bold mt-3">Welcome, {user.name}</h2>
        <p className="text-secondary">
          You are signed in as <strong>{user.role_display}</strong>.
          <br />
          Your screens are coming next.
        </p>
        <Button variant="primary" onClick={logout}>
          <i className="bi bi-box-arrow-right me-1"></i> Sign out
        </Button>
      </div>
    </div>
  );
}