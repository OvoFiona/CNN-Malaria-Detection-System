import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Button, Form, Modal, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import "./patients.css";

// The Patients screen (nurse): find a patient by name or number,
// and register a new one. All data comes from the Django backend.
export default function Patients() {
  const { token } = useAuth();

  // ----- the list -----
  const [patients, setPatients] = useState([]);   // the rows on this page
  const [count, setCount] = useState(0);          // how many patients match in total
  const [page, setPage] = useState(1);            // which page we are on (20 per page)
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ----- search -----
  const [search, setSearch] = useState("");        // what is typed in the box
  const [term, setTerm] = useState("");            // what we actually search for (after a short pause)

  // ----- view / edit one patient -----
  const [selected, setSelected] = useState(null);      // the patient whose window is open
  const [mode, setMode] = useState("view");            // "view" or "edit"
  const [history, setHistory] = useState([]);          // this patient's visits (the ones this nurse recorded)
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAge, setEditAge] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ----- register form -----
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");        // green message after registering
  const [reload, setReload] = useState(0);         // add 1 to ask for the list again

  // Wait 0.4 seconds after the person stops typing, then search from page 1.
  // (Otherwise we would ask the server after every single letter.)
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Load the list whenever the search, the page or "reload" changes
  useEffect(() => {
    let cancelled = false;                         // ignore answers that arrive too late
    setLoading(true);
    setError("");
    const url = "/patients/?page=" + page + (term ? "&search=" + encodeURIComponent(term) : "");
    api(url, { token })
      .then((data) => {
        if (cancelled) return;
        setPatients(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrev(Boolean(data.previous));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [term, page, reload, token]);

  // Open the window for one patient, in "view" or "edit" mode
  function openPatient(p, startMode) {
    setSelected(p);
    setMode(startMode);
    setEditName(p.name);
    setEditAge(String(p.age));
    setEditError("");
    setHistory([]);
    setHistoryLoading(true);
    api("/visits/?patient=" + p.id, { token })
      .then((data) => setHistory(data.results))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }

  // Save the corrected name / age
  async function handleEdit(event) {
    event.preventDefault();
    setEditError("");
    setEditSaving(true);
    try {
      const updated = await api("/patients/" + selected.id + "/", {
        method: "PATCH",
        token,
        body: { name: editName.trim(), age: Number(editAge) },
      });
      setSelected(updated);
      setMode("view");
      setNotice("Saved changes for " + updated.name + " (" + updated.patient_number + ").");
      setReload((n) => n + 1);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  }

  // The pill for a visit in the history: the diagnosis once there is one, otherwise where it is now
  function visitPill(v) {
    if (v.diagnosis_result === "positive") return { label: "Malaria positive", css: "status-positive" };
    if (v.diagnosis_result === "negative") return { label: "Malaria negative", css: "status-done" };
    if (v.status === "sent_to_doctor") return { label: "With doctor", css: "status-doctor" };
    return { label: "Waiting for lab", css: "status-lab" };
  }

  function vitalsText(v) {
    const parts = [];
    if (v.temperature) parts.push(Number(v.temperature) + " °C");
    if (v.heart_rate) parts.push(v.heart_rate + " bpm");
    if (v.blood_pressure) parts.push(v.blood_pressure);
    return parts.length ? parts.join(" · ") : "no vitals";
  }

  function openForm() {
    setName("");
    setAge("");
    setFormError("");
    setShowForm(true);
  }

  // Send the new patient to the server
  async function handleRegister(event) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const created = await api("/patients/", {
        method: "POST",
        token,
        body: { name: name.trim(), age: Number(age) },
      });
      setShowForm(false);
      setNotice("Registered " + created.name + " (" + created.patient_number + ").");
      setSearch("");                               // show the full list again
      setTerm("");
      setPage(1);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // "2 Mar 2026" style date
  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="mb-1">Patients</h1>
          <p className="text-secondary mb-0">
            {loading ? "Loading..." : count + (count === 1 ? " patient" : " patients") + (term ? " found" : " registered")}
          </p>
        </div>
        <Button variant="primary" onClick={openForm}>
          <i className="bi bi-plus-lg me-2"></i> Register patient
        </Button>
      </div>

      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      {/* search box */}
      <div className="patient-search mb-3">
        <i className="bi bi-search"></i>
        <Form.Control
          type="search"
          placeholder="Search by name or patient number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search patients"
        />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="patient-table">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Age</th>
              <th>Registered</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading patients...
                </td>
              </tr>
            )}

            {/* nothing found */}
            {!loading && !error && patients.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-secondary py-5">
                  {term ? "No patient matches “" + term + "”." : "No patients yet. Register the first one."}
                </td>
              </tr>
            )}

            {!loading &&
              patients.map((p) => (
                <tr key={p.id}>
                  <td className="text-secondary">{p.patient_number}</td>
                  <td className="fw-semibold">{p.name}</td>
                  <td>{p.age}</td>
                  <td className="text-secondary">{niceDate(p.created_at)}</td>
                  <td className="text-end text-nowrap">
                    <Button size="sm" variant="outline-primary" className="me-2" onClick={() => openPatient(p, "view")}>
                      View
                    </Button>
                    <Button size="sm" variant="outline-secondary" className="me-2" onClick={() => openPatient(p, "edit")}>
                      Edit
                    </Button>
                    <Link to={"/visits?patient=" + p.id} className="btn btn-outline-secondary btn-sm">
                      Record visit
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </Table>
      </div>

      {/* Previous / Next, shown only when there is more than one page */}
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

      {/* the window for one patient: details + visit history, or the edit form */}
      <Modal show={Boolean(selected)} onHide={() => !editSaving && setSelected(null)} centered scrollable>
        {selected && mode === "view" && (
          <>
            <Modal.Header closeButton>
              <Modal.Title as="h4">{selected.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="d-flex flex-wrap gap-4 mb-4">
                <div><div className="small text-secondary">Patient no.</div><div className="fw-semibold">{selected.patient_number}</div></div>
                <div><div className="small text-secondary">Age</div><div className="fw-semibold">{selected.age}</div></div>
                <div><div className="small text-secondary">Registered</div><div className="fw-semibold">{niceDate(selected.created_at)}</div></div>
              </div>
              <h3 className="h6 fw-bold mb-2">Visits you recorded</h3>
              {historyLoading && (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading...
                </div>
              )}
              {!historyLoading && history.length === 0 && <p className="text-secondary mb-0">No visits recorded yet.</p>}
              {!historyLoading &&
                history.map((v) => {
                  const pill = visitPill(v);
                  return (
                    <div className="patient-visit" key={v.id}>
                      <div>
                        <div className="fw-semibold">{niceDate(v.visit_date)} · {v.lab_name}</div>
                        <div className="small text-secondary">{vitalsText(v)}</div>
                        {v.symptoms && <div className="small">{v.symptoms}</div>}
                      </div>
                      <span className={"status-badge " + pill.css}>{pill.label}</span>
                    </div>
                  );
                })}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setSelected(null)}>Close</Button>
              <Button variant="outline-secondary" onClick={() => setMode("edit")}>
                <i className="bi bi-pencil me-2"></i> Edit
              </Button>
              <Link to={"/visits?patient=" + selected.id} className="btn btn-primary">Record visit</Link>
            </Modal.Footer>
          </>
        )}
        {selected && mode === "edit" && (
          <Form onSubmit={handleEdit}>
            <Modal.Header closeButton>
              <Modal.Title as="h4">Edit {selected.patient_number}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Form.Group className="mb-3" controlId="edit-patient-name">
                <Form.Label>Full name</Form.Label>
                <Form.Control value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
              </Form.Group>
              <Form.Group className="mb-3" controlId="edit-patient-age">
                <Form.Label>Age (years)</Form.Label>
                <Form.Control type="number" min="0" max="120" value={editAge} onChange={(e) => setEditAge(e.target.value)} required />
              </Form.Group>
              <div className="form-text mb-3">The patient number stays {selected.patient_number}. Every change is recorded in the activity log.</div>
              {editError && <Alert variant="danger" className="py-2 mb-0">{editError}</Alert>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" type="button" onClick={() => setMode("view")} disabled={editSaving}>
                Back
              </Button>
              <Button variant="primary" type="submit" disabled={editSaving}>
                {editSaving ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>

      {/* the register form pops up over the page */}
      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Form onSubmit={handleRegister}>
          <Modal.Header closeButton>
            <Modal.Title as="h4">Register patient</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3" controlId="patient-name">
              <Form.Label>Full name</Form.Label>
              <Form.Control
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Achieng Otieno"
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="patient-age">
              <Form.Label>Age (years)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                max="120"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
              />
            </Form.Group>
            {formError && <Alert variant="danger" className="py-2 mb-0">{formError}</Alert>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" /> Saving...
                </>
              ) : (
                "Register"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}