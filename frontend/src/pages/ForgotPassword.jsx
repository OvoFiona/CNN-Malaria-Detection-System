import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import AuthCard from "../components/AuthCard.jsx";
import { api } from "../api.js";
import "./auth.css";

// "Forgot password?" - the person types their email and we send them a reset link.
// The server gives the SAME answer whether or not the email exists, so nobody
// can use this page to find out who has an account.
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const from = params.get("from");                         // the profile they came from, e.g. "nurse"
  const backTo = from ? "/signin/" + from : "/";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/auth/password-reset/", { method: "POST", body: { email: email.trim() } });
      setSent(true);
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
      subtitle="Enter your email and we will send you a link to choose a new one."
      backTo={backTo}
      backLabel="Back to sign in"
    >
      {sent ? (
        <>
          <Alert variant="success">
            If that email is registered, a reset link has been sent. Open it to choose a new password. The link
            can be used once and stops working after a short time.
          </Alert>
          <Link to={backTo} className="btn btn-primary w-100">Back to sign in</Link>
        </>
      ) : (
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