import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Col, Form, Modal, Row, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import "./visits.css";

// How each status is written and which colour pill it gets (colours live in theme.css)
const STATUS = {
  sent_to_lab: { label: "Waiting for lab", css: "status-lab" },
  sent_to_doctor: { label: "With doctor", css: "status-doctor" },
  diagnosed: { label: "Diagnosed", css: "status-done" },
};

// The Visits screen (nurse): see the visits you recorded, and record a new one.
// Recording a visit also sends the patient to the lab.
export default function Visits() {
  const { user, token } = useAuth();
  const [params, setParams] = useSearchParams();   // lets Patients open this page with ?patient=3

  // ----- the list -----
  const [visits, setVisits] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");

  // ----- the form -----
  const [showForm, setShowForm] = useState(false);
  const [patient, setPatient] = useState(null);     // the chosen patient: { id, name, patient_number }
  const [patientSearch, setPatientSearch] = useState("");
  const [matches, setMatches] = useState([]);       // patients found while typing
  const [temperature, setTemperature] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [bloodPressure, setBloodPressure] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Load my visits
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api("/visits/?page=" + page, { token })
      .then((data) => {
        if (cancelled) return;
        setVisits(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrev(Boolean(data.previous));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, reload, token]);

  // Search patients while typing in the form (after a short pause)
  useEffect(() => {
    if (!showForm || patient || patientSearch.trim().length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api("/patients/?search=" + encodeURIComponent(patientSearch.trim()), { token })
        .then((data) => !cancelled && setMatches(data.results.slice(0, 6)))
        .catch(() => !cancelled && setMatches([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientSearch, patient, showForm, token]);

  // If we arrived from the Patients page (?patient=3), open the form with that patient chosen
  useEffect(() => {
    const id = params.get("patient");
    if (!id) return;
    api("/patients/" + id + "/", { token })
      .then((p) => openForm(p))
      .catch((err) => setError(err.message))
      .finally(() => setParams({}, { replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openForm(chosen = null) {
    setPatient(chosen);
    setPatientSearch("");
    setMatches([]);
    setTemperature("");
    setHeartRate("");
    setBloodPressure("");
    setSymptoms("");
    setFormError("");
    setShowForm(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setFormError("");
    if (!patient) {
      setFormError("Choose a patient first.");
      return;
    }
    setSaving(true);
    try {
      await api("/visits/", {
        method: "POST",
        token,
        body: {
          patient: patient.id,
          lab: user.lab,                                  // the lab this nurse works in
          temperature: temperature === "" ? null : Number(temperature),
          heart_rate: heartRate === "" ? null : Number(heartRate),
          blood_pressure: bloodPressure.trim(),
          symptoms: symptoms.trim(),
        },
      });
      setShowForm(false);
      setNotice("Visit recorded for " + patient.name + ". They are now waiting for the lab.");
      setPage(1);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  // "37.5 °C · 80 bpm · 120/80", skipping whatever was left empty
  function vitalsText(v) {
    const parts = [];
    if (v.temperature) parts.push(Number(v.temperature) + " °C");
    if (v.heart_rate) parts.push(v.heart_rate + " bpm");
    if (v.blood_pressure) parts.push(v.blood_pressure);
    return parts.length ? parts.join(" · ") : "-";
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="mb-1">Visits</h1>
          <p className="text-secondary mb-0">
            {loading ? "Loading..." : count + (count === 1 ? " visit" : " visits") + " recorded by you"}
          </p>
        </div>
        <Button variant="primary" onClick={() => openForm()} disabled={!user.lab}>
          <i className="bi bi-plus-lg me-2"></i> Record visit
        </Button>
      </div>

      {/* a nurse needs a lab to send patients to */}
      {!user.lab && (
        <Alert variant="warning">
          Your account is not linked to a lab yet, so you cannot record visits. Please ask the admin to set your lab.
        </Alert>
      )}

      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {error && <Alert variant="danger">{error}</Alert>}

      <div className="visit-table">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>Vitals</th>
              <th>Lab</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading visits...
                </td>
              </tr>
            )}

            {!loading && !error && visits.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-secondary py-5">
                  No visits yet. Click “Record visit” to start.
                </td>
              </tr>
            )}

            {!loading &&
              visits.map((v) => {
                const st = STATUS[v.status] || { label: v.status, css: "" };
                return (
                  <tr key={v.id}>
                    <td className="text-secondary text-nowrap">{niceDate(v.visit_date)}</td>
                    <td>
                      <div className="fw-semibold">{v.patient.name}</div>
                      <div className="small text-secondary">No. {v.patient.patient_number}</div>
                    </td>
                    <td className="text-nowrap">{vitalsText(v)}</td>
                    <td>{v.lab_name}</td>
                    <td>
                      {/* a plain span, because react-bootstrap's Badge forces teal */}
                      <span className={"status-badge " + st.css}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
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

      {/* the record-visit form pops up over the page */}
      <Modal show={showForm} onHide={() => setShowForm(false)} centered>
        <Form onSubmit={handleSave}>
          <Modal.Header closeButton>
            <Modal.Title as="h4">Record visit</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {/* 1. who is the patient? */}
            <Form.Group className="mb-3">
              <Form.Label>Patient</Form.Label>
              {patient ? (
                <div className="chosen-patient">
                  <span>
                    <strong>{patient.name}</strong>
                    <span className="text-secondary"> · No. {patient.patient_number}</span>
                  </span>
                  <Button variant="link" size="sm" type="button" className="p-0" onClick={() => setPatient(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <Form.Control
                    placeholder="Type a name or number to search"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    autoFocus
                  />
                  {matches.length > 0 && (
                    <div className="patient-matches">
                      {matches.map((p) => (
                        <button type="button" key={p.id} onClick={() => setPatient(p)}>
                          {p.name} <span className="text-secondary">· No. {p.patient_number}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {patientSearch.trim().length >= 2 && matches.length === 0 && (
                    <div className="form-text">No match yet. Register the patient on the Patients page first.</div>
                  )}
                </>
              )}
            </Form.Group>

            {/* 2. the vitals (all optional) */}
            <Row className="g-3 mb-3">
              <Col sm={4}>
                <Form.Label>Temp (°C)</Form.Label>
                <Form.Control
                  type="number"
                  step="0.1"
                  min="30"
                  max="45"
                  placeholder="37.5"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </Col>
              <Col sm={4}>
                <Form.Label>Heart rate</Form.Label>
                <Form.Control
                  type="number"
                  min="20"
                  max="250"
                  placeholder="80"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                />
              </Col>
              <Col sm={4}>
                <Form.Label>Blood pressure</Form.Label>
                <Form.Control
                  placeholder="120/80"
                  maxLength={20}
                  value={bloodPressure}
                  onChange={(e) => setBloodPressure(e.target.value)}
                />
              </Col>
            </Row>

            {/* 3. symptoms */}
            <Form.Group className="mb-3">
              <Form.Label>Symptoms</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder="e.g. fever for 3 days, headache, chills"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
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
                "Save and send to lab"
              )}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}