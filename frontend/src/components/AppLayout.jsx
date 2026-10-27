import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Container, Dropdown, Nav, Navbar, Spinner } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { NAV } from "../navigation.js";
import "./app.css";

// The frame around every page you see AFTER signing in:
// a top bar with the menu for your role, and your name on the right.
export default function AppLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

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

  const items = NAV[user.role] || [];

  // Initials for the round picture, e.g. "Jane Achieng" -> "JA"
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <Navbar expand="md" className="app-navbar">
        <Container fluid className="px-3 px-lg-4">
          <Navbar.Brand as={NavLink} to="/dashboard">
            <i className="bi bi-heart-pulse-fill text-primary me-2"></i>
            MalariaScan
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="main-nav" />

          <Navbar.Collapse id="main-nav">
            {/* the menu for this role */}
            <Nav className="me-auto ms-md-3 my-2 my-md-0">
              {items.map((item) => (
                <Nav.Link as={NavLink} key={item.to} to={item.to} end={item.to === "/dashboard"}>
                  <i className={"bi " + item.icon + " me-2"}></i>
                  {item.label}
                </Nav.Link>
              ))}
            </Nav>

            {/* your name, with a menu to sign out */}
            <Dropdown align="end">
              <Dropdown.Toggle as="button" className="user-chip" id="user-menu">
                <span className="user-initials">{initials}</span>
                <span className="text-start">
                  <span className="d-block fw-semibold lh-sm">{user.name}</span>
                  <span className="d-block small text-secondary lh-sm">{user.role_display}</span>
                </span>
              </Dropdown.Toggle>
              <Dropdown.Menu className="user-menu">
                <Dropdown.ItemText className="small text-secondary">{user.email}</Dropdown.ItemText>
                <Dropdown.Divider />
                <Dropdown.Item onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right me-2"></i> Sign out
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* the current page appears here */}
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

// Wrap a page in this to allow only some roles to open it.
// (The server checks too, this just keeps people out of screens that are not theirs.)
//   <RequireRole roles={["nurse"]}> ... </RequireRole>
export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}