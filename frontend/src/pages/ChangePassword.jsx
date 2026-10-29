import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";

// Change password (for any signed-in person). It is reached from the name menu, top right.
// When it works the server signs the person out everywhere, so they sign in again.
export default function ChangePassword() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (newPassword !== again) {
      setError("The two new passwords do not match.");
      return;
    }
    if (newPassword === oldPassword) {
      setError("Choose a password that is different from your current one.");
      return;
    }
    setSaving(true);
    try {
      await api("/auth/change-password/", {
        method: "POST",
        token,
        body: { old_password: oldPassword, new_password: newPassword },
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // The old login no longer works, so clear it here and go to the start
  async function signInAgain() {
    await logout();
    navigate("/");
  }

  return (
    <div className="mx-auto" style={{ maxWidth: 520 }}>
      <h1 className="mb-1">Change password</h1>
      <p className="text-secondary mb-4">Choose a new password for your account.</p>

      <div className="bg-white border rounded p-4">
        {done ? (
          <>
            <Alert variant="success">Your password has been changed. For safety you have been signed out everywhere. Please sign in again.</Alert>
            <Button variant="primary" onClick={signInAgain}>Sign in again</Button>
          </>
        ) : (
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="old-password">
              <Form.Label>Current password</Form.Label>
              <Form.Control type="password" autoComplete="current-password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required autoFocus />
            </Form.Group>
            <Form.Group className="mb-3" controlId="new-password">
              <Form.Label>New password</Form.Label>
              <Form.Control type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <div className="form-text">At least 8 characters, not too common, not only numbers.</div>
            </Form.Group>
            <Form.Group className="mb-3" controlId="new-password-again">
              <Form.Label>Type the new password again</Form.Label>
              <Form.Control type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            </Form.Group>
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" /> Saving...
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </Form>
        )}
      </div>
    </div>
  );
}