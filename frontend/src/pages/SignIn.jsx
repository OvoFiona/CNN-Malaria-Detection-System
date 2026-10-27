import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Form, InputGroup, Spinner } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import ProfileRail from "../components/ProfileRail.jsx";
import RoleAvatar from "../components/RoleAvatar.jsx";
import { ROLES } from "../roles.js";
import "./auth.css";

// The sign-in page for one profile. The address is /signin/nurse, /signin/doctor, ...
export default function SignIn() {
  const { roleKey } = useParams();                       // the part of the address after /signin/
  const role = ROLES.find((r) => r.key === roleKey);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);       // "Keep me signed in"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");                // red message under the form

  const { login } = useAuth();
  const navigate = useNavigate();

  // Someone typed a profile that does not exist: send them to the welcome page
  if (!role) return <Navigate to="/" replace />;

  // Runs when the form is submitted: ask Django to sign the person in
  async function handleSubmit(event) {
    event.preventDefault();                              // stop the page reloading
    setError("");
    setLoading(true);
    try {
      // login() also checks that the account really belongs to the chosen profile
      await login(email, password, remember, role.key);
      navigate("/dashboard");                            // success!
    } catch (err) {
      setError(err.message);                             // e.g. "Invalid email or password."
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <span className="cell cell-1"></span>
      <span className="cell cell-2"></span>
      <span className="cell cell-3"></span>

      <ProfileRail activeKey={role.key} />

      <main className="auth-main justify-content-center">
        {/* key={role.key} makes the card reset and fade in again when you switch profile */}
        <div className="signin-card fade-in" key={role.key}>
          {/* soft gradient top with the picture and title */}
          <div className="signin-top">
            <Link to="/" className="signin-back">
              <i className="bi bi-arrow-left me-1"></i> Back
            </Link>
            <RoleAvatar role={role.key} size={76} />
            <h4 className="fw-bold mt-3 mb-1">Sign in as {role.label}</h4>
            <p className="text-secondary small mb-0">{role.hint}</p>
          </div>

          <div className="p-4">
            <Form onSubmit={handleSubmit}>
              <Form.Group className="mb-3" controlId="email">
                <Form.Label className="fw-semibold">Email</Form.Label>
                <InputGroup>
                  <InputGroup.Text><i className="bi bi-envelope"></i></InputGroup.Text>
                  <Form.Control
                    type="email"
                    placeholder={role.placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </InputGroup>
              </Form.Group>

              <Form.Group className="mb-3" controlId="password">
                <Form.Label className="fw-semibold">Password</Form.Label>
                <InputGroup>
                  <InputGroup.Text><i className="bi bi-lock"></i></InputGroup.Text>
                  <Form.Control
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    variant="outline-secondary"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <i className={"bi " + (showPassword ? "bi-eye-slash" : "bi-eye")}></i>
                  </Button>
                </InputGroup>
              </Form.Group>

              <div className="d-flex justify-content-between align-items-center mb-3">
                <Form.Check
                  type="checkbox"
                  id="remember"
                  label="Keep me signed in"
                  className="small"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <a href="#" className="small text-decoration-none">Forgot password?</a>
              </div>

              {error && <Alert variant="danger" className="py-2">{error}</Alert>}

              <Button type="submit" variant="primary" size="lg" className="w-100" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Signing in...
                  </>
                ) : (
                  <>
                    Sign in <i className="bi bi-arrow-right ms-1"></i>
                  </>
                )}
              </Button>
            </Form>

            <p className="text-center text-secondary small mt-3 mb-0">
              <i className="bi bi-shield-lock me-1"></i>
              Secure sign-in · Your patients' data stays protected
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}