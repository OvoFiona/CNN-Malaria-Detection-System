import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import AuthCard from "../components/AuthCard.jsx";
import { api } from "../api.js";
import "./auth.css";

// "Forgot password?" - the person types their email and we send them a reset link.
//
// Normal mode: the server gives the SAME answer whether or not the email exists, so nobody
// can use this page to find out who has an account.
//
// Demo mode (the server has DEMO_RESET_LINK_ON_SCREEN=true): there is no real inbox to receive
// the email, so the server hands the link straight back and this page offers a button to continue.
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const from = params.get("from");                         // the profile they came from, e.g. "nurse"
  const backTo = from ? "/signin/" + from : "/";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [demoPath, setDemoPath] = useState("");            // demo mode: where the reset page is
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/auth/password-reset/", { method: "POST", body: { email: email.trim() } });
      if (data.demo_mode) {
        if (!data.reset_url) {
          setError("No active account uses that email. Check the spelling and try again.");
        } else {
          // keep only the part after the site address, e.g. /reset-password?uid=...&token=...
          const url = new URL(data.reset_url);
          setDemoPath(url.pathname + url.search);
        }
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      icon="bi-key"
      title="Forgot your password?"
      subtitle="Enter the email you sign in with and we will help you set a new password."
      backTo={backTo}
      backLabel="Back to sign in"
    >
      {/* demo mode: no email is needed, carry on straight to the new password page */}
      {demoPath && (
        <>
          <Button variant="primary" size="lg" className="w-100" onClick={() => navigate(demoPath)}>
            Choose a new password <i className="bi bi-arrow-right ms-1"></i>
          </Button>
        </>
      )}

      {!demoPath && sent && (
        <>
          <Alert variant="success">
            If that email is registered, a reset link has been sent. Open it to choose a new password. The link
            can be used once and stops working after a short time.
          </Alert>
          <Link to={backTo} className="btn btn-primary w-100">Back to sign in</Link>
        </>
      )}

      {!demoPath && !sent && (
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="reset-email">
            <Form.Label className="fw-semibold">Email</Form.Label>
            <Form.Control
              type="email"
              placeholder="you@hospital.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Form.Group>
          {error && <Alert variant="danger" className="py-2">{error}</Alert>}
          <Button type="submit" variant="primary" size="lg" className="w-100" disabled={loading}>
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" /> Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </Form>
      )}
    </AuthCard>
  );
}