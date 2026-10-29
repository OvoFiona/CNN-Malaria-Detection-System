import { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api, downloadFile } from "../api.js";
import TimeFrame from "../components/TimeFrame.jsx";
import { ALL_TIME, rangeQuery } from "../timeframe.js";
import "./staff.css";

// The four roles, in the order shown in the drop-downs (the value is what the server stores)
const ROLES = [
  { value: "nurse", label: "Nurse" },
  { value: "lab_technician", label: "Lab technician" },
  { value: "doctor", label: "Doctor" },
  { value: "admin", label: "System admin" },
];

// An empty form, used when adding a new staff member
const EMPTY = { name: "", email: "", role: "nurse", lab: "", password: "", is_active: true };

// The Staff screen (admin): see everyone, add a person, change their role or lab,
// switch an account off (or on again) and set a new password.
// Accounts are never deleted, so the history of who did what stays correct.
export default function Staff() {
  const { token, user: me } = useAuth();

  // ----- the list -----
  const [people, setPeople] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);          // add 1 to ask for the list again
  const [notice, setNotice] = useState("");

  // ----- search and filter -----
  const [search, setSearch] = useState("");         // what is typed
  const [term, setTerm] = useState("");             // what we really search for (after a pause)
  const [roleFilter, setRoleFilter] = useState("");
  const [range, setRange] = useState(ALL_TIME);      // the "account created" period
  const [downloading, setDownloading] = useState(false);

  // ----- labs (for the drop-down) -----
  const [labs, setLabs] = useState([]);
  const [labsReload, setLabsReload] = useState(0);

  // ----- the staff form -----
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);     // the person being edited (null = adding)
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // ----- the "add lab" form -----
  const [showLab, setShowLab] = useState(false);
  const [labName, setLabName] = useState("");
  const [labPlace, setLabPlace] = useState("");
  const [labError, setLabError] = useState("");
  const [labSaving, setLabSaving] = useState(false);

  // Wait 0.4 s after typing stops, then search from page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // The filters as part of a web address (used by the list AND by the Excel download)
  const filters =
    (term ? "&search=" + encodeURIComponent(term) : "") + (roleFilter ? "&role=" + roleFilter : "") + rangeQuery(range);
  const hasFilters = filters !== "";

  // Load the staff list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api("/users/?page=" + page + filters, { token })
      .then((data) => {
        if (cancelled) return;
        setPeople(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrev(Boolean(data.previous));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page, reload, token]);

  // Load the labs
  useEffect(() => {
    api("/labs/", { token })
      .then(setLabs)
      .catch((err) => setError(err.message));
  }, [labsReload, token]);

  // Download what the filters show as an Excel file
  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      const day = new Date().toLocaleDateString("en-CA")      // 2026-10-28, in local time;
      await downloadFile("/users/export/?" + filters.slice(1), "staff-accounts-" + day + ".xlsx", token);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(p) {
    setEditing(p);
    setForm({ name: p.name, email: p.email, role: p.role, lab: p.lab ? String(p.lab) : "", password: "", is_active: p.is_active });
    setFormError("");
    setShowForm(true);
  }

  // Nurses and lab technicians must belong to a lab
  const needsLab = form.role === "nurse" || form.role === "lab_technician";
  const isMe = editing && editing.id === me.id;     // an admin cannot switch themselves off

  // Save: create a new account, or change an existing one
  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    if (needsLab && !form.lab) {
      setFormError("Choose the lab this person works in.");
      return;
    }
    const body = {
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      lab: form.lab ? Number(form.lab) : null,
      is_active: form.is_active,
    };
    if (form.password) body.password = form.password;       // blank = keep the old password
    setSaving(true);
    try {
      if (editing) {
        await api("/users/" + editing.id + "/", { method: "PATCH", token, body });
        setNotice("Saved changes for " + body.name + ".");
      } else {
        await api("/users/", { method: "POST", token, body });
        setNotice("Account created for " + body.name + ".");
      }
      setShowForm(false);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Quick switch on the row: deactivate or activate
  async function toggleActive(p) {
    setError("");
    try {
      await api("/users/" + p.id + "/", { method: "PATCH", token, body: { is_active: !p.is_active } });
      setNotice(p.name + (p.is_active ? " has been deactivated and signed out." : " can sign in again."));
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  // Add a lab
  async function handleAddLab(event) {
    event.preventDefault();
    setLabError("");
    setLabSaving(true);
    try {
      const lab = await api("/labs/", { method: "POST", token, body: { name: labName.trim(), location: labPlace.trim() } });
      setShowLab(false);
      setLabName("");
      setLabPlace("");
      setNotice("Lab added: " + lab.name + ".");
      setLabsReload((n) => n + 1);
    } catch (err) {
      setLabError(err.message);
    } finally {
      setLabSaving(false);
    }
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="mb-1">Staff</h1>
          <p className="text-secondary mb-0">
            {loading ? "Loading..." : count + (count === 1 ? " account" : " accounts") + (hasFilters ? " found" : "")}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-success" onClick={handleDownload} disabled={downloading || loading}>
            {downloading ? <Spinner animation="border" size="sm" className="me-2" /> : <i className="bi bi-file-earmark-excel me-2"></i>}
            Download Excel
          </Button>
          <Button variant="outline-secondary" onClick={() => setShowLab(true)}>
            <i className="bi bi-hospital me-2"></i> Add lab
          </Button>
          <Button variant="primary" onClick={openAdd}>
            <i className="bi bi-plus-lg me-2"></i> Add staff
          </Button>
        </div>
      </div>

      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      {/* search + role filter */}
      <div className="admin-filters mb-3">
        <div className="admin-search">
          <i className="bi bi-search"></i>
          <Form.Control
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search staff"
          />
        </div>
        <Form.Select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by role"
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Form.Select>
        <TimeFrame
          label="Created"
          value={range}
          onChange={(r) => {
            setRange(r);
            setPage(1);
          }}
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="admin-table">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Lab</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading staff...
                </td>
              </tr>
            )}
            {!loading && !error && people.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-secondary py-5">No accounts match.</td>
              </tr>
            )}
            {!loading &&
              people.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="fw-semibold">
                      {p.name} {p.id === me.id && <span className="text-secondary fw-normal">(you)</span>}
                    </div>
                    <div className="small text-secondary">{p.email}</div>
                  </td>
                  <td><span className="status-badge role-pill">{p.role_display}</span></td>
                  <td>{p.lab_name || <span className="text-secondary">-</span>}</td>
                  <td>
                    <span className={"status-badge " + (p.is_active ? "status-done" : "status-off")}>
                      {p.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="text-end text-nowrap">
                    <Button size="sm" variant="outline-secondary" className="me-2" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    {p.id !== me.id && (
                      <Button size="sm" variant={p.is_active ? "outline-danger" : "outline-primary"} onClick={() => toggleActive(p)}>
                        {p.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </div>

      {(hasPrev || hasNext) && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <Button variant="outline-secondary" size="sm" disabled={!hasPrev || loading} onClick={() => setPage(page - 1)}>
            <i className="bi bi-arrow-left me-1"></i> Previous
          </Button>
          <span className="text-secondary small">Page {page}</span>
          <Button variant="outline-secondary" size="sm" disabled={!hasNext || loading} onClick={() => setPage(page + 1)}>
            Next <i className="bi bi-arrow-right ms-1"></i>
          </Button>
        </div>
      )}

      {/* ---------- add / edit a staff member ---------- */}
      <Modal show={showForm} onHide={() => !saving && setShowForm(false)} centered scrollable>
        <Form onSubmit={handleSave}>
          <Modal.Header closeButton>
            <Modal.Title as="h4">{editing ? "Edit " + editing.name : "Add staff"}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="staff-name">
              <Form.Label>Full name</Form.Label>
              <Form.Control value={form.name} onChange={(e) => setField("name", e.target.value)} required autoFocus />
            </Form.Group>
            <Form.Group className="mb-3" controlId="staff-email">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3" controlId="staff-role">
              <Form.Label>Role</Form.Label>
              <Form.Select value={form.role} onChange={(e) => setField("role", e.target.value)} disabled={isMe}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Form.Select>
              {isMe && <div className="form-text">You cannot change your own role.</div>}
            </Form.Group>
            <Form.Group className="mb-3" controlId="staff-lab">
              <Form.Label>Lab {needsLab ? "" : "(optional)"}</Form.Label>
              <Form.Select value={form.lab} onChange={(e) => setField("lab", e.target.value)}>
                <option value="">{needsLab ? "Choose a lab..." : "No lab"}</option>
                {labs.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.location})</option>
                ))}
              </Form.Select>
              {labs.length === 0 && <div className="form-text">No labs yet. Use “Add lab” first.</div>}
            </Form.Group>
            <Form.Group className="mb-3" controlId="staff-password">
              <Form.Label>{editing ? "New password (leave blank to keep the current one)" : "Password"}</Form.Label>
              <Form.Control
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setField("password", e.target.value)}
                required={!editing}
              />
              <div className="form-text">At least 8 characters, not too common, not only numbers. Tell the person to change it after signing in.</div>
            </Form.Group>
            {editing && (
              <Form.Check
                type="switch"
                id="staff-active"
                label={form.is_active ? "Account is active" : "Account is deactivated (cannot sign in)"}
                checked={form.is_active}
                onChange={(e) => setField("is_active", e.target.checked)}
                disabled={isMe}
              />
            )}
            {formError && <Alert variant="danger" className="py-2 mt-3 mb-0">{formError}</Alert>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" type="button" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" /> Saving...
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Create account"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* ---------- add a lab ---------- */}
      <Modal show={showLab} onHide={() => !labSaving && setShowLab(false)} centered>
        <Form onSubmit={handleAddLab}>
          <Modal.Header closeButton>
            <Modal.Title as="h4">Add lab</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="lab-name">
              <Form.Label>Lab name</Form.Label>
              <Form.Control value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="e.g. Kisumu Central Lab" required autoFocus />
            </Form.Group>
            <Form.Group className="mb-3" controlId="lab-place">
              <Form.Label>Location</Form.Label>
              <Form.Control value={labPlace} onChange={(e) => setLabPlace(e.target.value)} placeholder="e.g. Kisumu" required />
            </Form.Group>
            {labError && <Alert variant="danger" className="py-2 mb-0">{labError}</Alert>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" type="button" onClick={() => setShowLab(false)} disabled={labSaving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={labSaving}>
              {labSaving ? "Saving..." : "Add lab"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}