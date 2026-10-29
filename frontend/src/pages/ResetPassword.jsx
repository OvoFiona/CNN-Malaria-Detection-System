import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Form, InputGroup, Spinner } from "react-bootstrap";
import AuthCard from "../components/AuthCard.jsx";
import { api } from "../api.js";
import "./auth.css";

// The page the reset link in the email opens:  /reset-password?uid=...&token=...
// The person chooses a new password here.
export default function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password !== again) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/password-reset/confirm/", { method: "POST", body: { uid, token, new_password: password } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Someone opened /reset-password without the code from the email
  if (!uid || !token) {
    return (
      <AuthCard icon="bi-exclamation-triangle" title="This link is not complete" subtitle="Open the link from your email again, or ask for a new one." backTo="/" backLabel="Back to start">
        <Link to="/forgot-password" className="btn btn-primary w-100">Ask for a new link</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon="bi-shield-lock" title="Choose a new password" subtitle="Use at least 8 characters. Avoid common passwords and numbers only." backTo="/" backLabel="Back to start">
      {done ? (
        <>
          <Alert variant="success">Your password has been changed. You can sign in with it now.</Alert>
          <Link to="/" className="btn btn-primary w-100">Go to sign in</Link>
        </>
      ) : (
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="new-password">
            <Form.Label className="fw-semibold">New password</Form.Label>
            <InputGroup>
              <Form.Control
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <Button variant="outline-secondary" type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                <i className={"bi " + (show ? "bi-eye-slash" : "bi-eye")}></i>
              </Button>
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-3" controlId="new-password-again">
            <Form.Label className="fw-semibold">Type it again</Form.Label>
            <Form.Control
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              required
            />
          </Form.Group>
          {error && (
            <Alert variant="danger" className="py-2">
              {error}
              {error.includes("invalid or has expired") && (
                <div className="mt-1"><Link to="/forgot-password">Ask for a new link</Link></div>
              )}
            </Alert>
          )}
          <Button type="submit" variant="primary" size="lg" className="w-100" disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" /> Saving...
              </>
            ) : (
              "Change password"
            )}
          </Button>
        </Form>
      )}
    </AuthCard>
  );
}