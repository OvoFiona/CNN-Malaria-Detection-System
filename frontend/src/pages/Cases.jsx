import { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Nav, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import "./lab.css";     // the tabs, tables and result rows look the same as on the lab screen
import "./cases.css";

// How each visit status is written and which colour pill it gets (colours live in theme.css)
const STATUS = {
  sent_to_lab: { label: "Waiting for lab", css: "status-lab" },
  sent_to_doctor: { label: "Sent to doctor", css: "status-doctor" },
  diagnosed: { label: "Diagnosed", css: "status-done" },
};

// The Cases screen (doctor):
//   tab 1  "Waiting cases"  - cases the lab sent to you. Open one, read the lab result,
//                             look at the cell images, then record your diagnosis.
//   tab 2  "Recent cases"   - the latest cases and where each one is now. Open a diagnosed
//                             case to read it, see its correction history, or correct it.
export default function Cases() {
  const { token } = useAuth();
  const [tab, setTab] = useState("queue");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);          // add 1 to ask both lists again

  // ----- tab 1: cases waiting for a diagnosis -----
  const [queue, setQueue] = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");

  // ----- tab 2: recent cases -----
  const [recent, setRecent] = useState([]);
  const [recentPage, setRecentPage] = useState(1);
  const [recentNext, setRecentNext] = useState(false);
  const [recentPrev, setRecentPrev] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState("");

  // ----- the case window -----
  const [visit, setVisit] = useState(null);          // the case being read (null = window closed)
  const [report, setReport] = useState(null);        // its lab report with the scanned images
  const [loadingReport, setLoadingReport] = useState(false);
  const [result, setResult] = useState("");          // "positive" or "negative" (the doctor's choice)
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [caseError, setCaseError] = useState("");
  const [correcting, setCorrecting] = useState(false);   // is the correction form open?
  const [reason, setReason] = useState("");              // why the doctor is correcting

  // Load the cases waiting for a diagnosis
  useEffect(() => {
    let cancelled = false;
    setQueueLoading(true);
    setQueueError("");
    api("/visits/?status=sent_to_doctor", { token })
      .then((data) => {
        if (cancelled) return;
        setQueue(data.results);
        setQueueCount(data.count);
      })
      .catch((err) => !cancelled && setQueueError(err.message))
      .finally(() => !cancelled && setQueueLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reload, token]);

  // Load the recent cases
  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    setRecentError("");
    api("/visits/?page=" + recentPage, { token })
      .then((data) => {
        if (cancelled) return;
        setRecent(data.results);
        setRecentNext(Boolean(data.next));
        setRecentPrev(Boolean(data.previous));
      })
      .catch((err) => !cancelled && setRecentError(err.message))
      .finally(() => !cancelled && setRecentLoading(false));
    return () => {
      cancelled = true;
    };
  }, [recentPage, reload, token]);

  // Open one case: load its lab report (the scanned images and results)
  async function openCase(v) {
    setVisit(v);
    setReport(null);
    setResult("");
    setNotes("");
    setReason("");
    setCorrecting(false);
    setCaseError("");
    setLoadingReport(true);
    try {
      setReport(await api("/lab-reports/" + v.lab_report_id + "/", { token }));
    } catch (err) {
      setCaseError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }

  function closeCase() {
    if (saving) return;
    setVisit(null);
  }

  // What the scan suggests: positive if ANY image was flagged as parasitized
  const images = report ? report.images : [];
  const positives = images.filter((im) => im.predicted_label === "parasitized").length;
  const scanSays = positives > 0 ? "positive" : "negative";
  const agrees = result !== "" && result === scanSays;     // does the doctor agree with the scan?

  // Save the diagnosis
  async function handleSave(event) {
    event.preventDefault();
    setCaseError("");
    if (!result) {
      setCaseError("Choose Malaria positive or Malaria negative.");
      return;
    }
    if (!agrees && notes.trim() === "") {
      setCaseError("Your diagnosis is different from the scan, so please write a short note explaining why.");
      return;
    }
    setSaving(true);
    try {
      await api("/visits/" + visit.id + "/diagnosis/", {
        method: "POST",
        token,
        body: { result, agrees_with_prediction: agrees, notes: notes.trim() },
      });
      setNotice("Diagnosis saved for " + visit.patient.name + ": malaria " + result + ".");
      setVisit(null);
      setReload((n) => n + 1);
    } catch (err) {
      setCaseError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Open the correction form, starting from what is saved now
  function startCorrecting() {
    setResult(visit.diagnosis.result);
    setNotes(visit.diagnosis.notes || "");
    setReason("");
    setCaseError("");
    setCorrecting(true);
  }

  // Save a correction (the old diagnosis is kept in the history by the server)
  async function handleCorrect(event) {
    event.preventDefault();
    setCaseError("");
    if (!agrees && notes.trim() === "") {
      setCaseError("Your diagnosis is different from the scan, so please write a short note explaining why.");
      return;
    }
    if (reason.trim() === "") {
      setCaseError("Please say why you are correcting this diagnosis.");
      return;
    }
    setSaving(true);
    try {
      await api("/visits/" + visit.id + "/correct-diagnosis/", {
        method: "POST",
        token,
        body: { result, agrees_with_prediction: agrees, notes: notes.trim(), reason: reason.trim() },
      });
      setNotice("Diagnosis corrected for " + visit.patient.name + ": malaria " + result + ".");
      setVisit(null);
      setReload((n) => n + 1);
    } catch (err) {
      setCaseError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function niceDateTime(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function vitalsText(v) {
    const parts = [];
    if (v.temperature) parts.push(Number(v.temperature) + " °C");
    if (v.heart_rate) parts.push(v.heart_rate + " bpm");
    if (v.blood_pressure) parts.push(v.blood_pressure);
    return parts.length ? parts.join(" · ") : "-";
  }

  // The pill shown on a recent case: the diagnosis once there is one, otherwise the status
  function casePill(v) {
    if (v.diagnosis_result === "positive") return { label: "Malaria positive", css: "status-positive" };
    if (v.diagnosis_result === "negative") return { label: "Malaria negative", css: "status-done" };
    return STATUS[v.status] || { label: v.status, css: "" };
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="mb-1">Cases</h1>
        <p className="text-secondary mb-0">Review the lab results and record your diagnosis.</p>
      </div>

      {notice && (
        <Alert variant="success" dismissible onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}

      {/* the two tabs */}
      <Nav variant="tabs" className="lab-tabs mb-3" activeKey={tab} onSelect={(k) => setTab(k)}>
        <Nav.Item>
          <Nav.Link eventKey="queue">
            Waiting cases {!queueLoading && <span className="tab-count">{queueCount}</span>}
          </Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="recent">Recent cases</Nav.Link>
        </Nav.Item>
      </Nav>

      {/* ---------- tab 1: waiting cases ---------- */}
      {tab === "queue" && (
        <>
          {queueError && <Alert variant="danger">{queueError}</Alert>}
          <div className="lab-table">
            <Table hover responsive className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Vitals</th>
                  <th>Symptoms</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {queueLoading && (
                  <tr>
                    <td colSpan={5} className="text-center py-5">
                      <Spinner animation="border" size="sm" className="me-2" /> Loading...
                    </td>
                  </tr>
                )}
                {!queueLoading && !queueError && queue.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-secondary py-5">
                      No cases are waiting for you right now.
                    </td>
                  </tr>
                )}
                {!queueLoading &&
                  queue.map((v) => (
                    <tr key={v.id}>
                      <td className="text-secondary text-nowrap">{niceDate(v.visit_date)}</td>
                      <td>
                        <div className="fw-semibold">{v.patient.name}</div>
                        <div className="small text-secondary">No. {v.patient.patient_number}</div>
                      </td>
                      <td className="text-nowrap">{vitalsText(v)}</td>
                      <td className="symptoms-cell">{v.symptoms || "-"}</td>
                      <td className="text-end">
                        <Button size="sm" variant="primary" onClick={() => openCase(v)}>
                          Review case
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Table>
          </div>
        </>
      )}

      {/* ---------- tab 2: recent cases ---------- */}
      {tab === "recent" && (
        <>
          {recentError && <Alert variant="danger">{recentError}</Alert>}
          <h2 className="h5 fw-bold mb-2">Recent cases</h2>
          <div className="recent-list">
            {recentLoading && (
              <div className="text-center py-5">
                <Spinner animation="border" size="sm" className="me-2" /> Loading...
              </div>
            )}
            {!recentLoading && !recentError && recent.length === 0 && (
              <div className="text-center text-secondary py-5">No cases yet.</div>
            )}
            {!recentLoading &&
              recent.map((v) => {
                const pill = casePill(v);
                const d = v.diagnosis;                 // null until the doctor has diagnosed
                return (
                  <div className="recent-row" key={v.id}>
                    <div>
                      <span className="fw-semibold">Patient {v.patient.patient_number}</span> — {v.patient.name}
                      <div className="small text-secondary">{niceDate(v.visit_date)} · {v.lab_name}</div>
                    </div>
                    <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                      {d && d.overruled && <span className="status-badge status-overruled">Overruled scan</span>}
                      {d && d.corrections.length > 0 && <span className="status-badge status-corrected">Corrected</span>}
                      <span className={"status-badge " + pill.css}>{pill.label}</span>
                      {d && (
                        <Button size="sm" variant="outline-primary" onClick={() => openCase(v)}>
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          {(recentPrev || recentNext) && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <Button variant="outline-secondary" size="sm" disabled={!recentPrev || recentLoading} onClick={() => setRecentPage(recentPage - 1)}>
                <i className="bi bi-arrow-left me-1"></i> Previous
              </Button>
              <span className="text-secondary small">Page {recentPage}</span>
              <Button variant="outline-secondary" size="sm" disabled={!recentNext || recentLoading} onClick={() => setRecentPage(recentPage + 1)}>
                Next <i className="bi bi-arrow-right ms-1"></i>
              </Button>
            </div>
          )}
        </>
      )}

      {/* ---------- the case window ---------- */}
      <Modal show={Boolean(visit)} onHide={closeCase} size="lg" centered scrollable>
        {visit && (
          <Form onSubmit={visit.diagnosis ? handleCorrect : handleSave}>
            <Modal.Header closeButton>
              <Modal.Title as="h4">Case · {visit.patient.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {/* what the nurse recorded */}
              <div className="visit-summary mb-3">
                <div><span className="text-secondary">Patient no.</span> {visit.patient.patient_number}</div>
                <div><span className="text-secondary">Age</span> {visit.patient.age}</div>
                <div><span className="text-secondary">Vitals</span> {vitalsText(visit)}</div>
                <div className="w-100"><span className="text-secondary">Symptoms</span> {visit.symptoms || "-"}</div>
              </div>

              {loadingReport && (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading the lab report...
                </div>
              )}

              {report && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h3 className="h6 fw-bold mb-0">Lab scan results</h3>
                    <span className={"status-badge " + (positives > 0 ? "status-positive" : "status-done")}>
                      {positives} of {images.length} image{images.length === 1 ? "" : "s"} parasitized
                    </span>
                  </div>
                  {report.notes && (
                    <p className="small text-secondary mb-2">
                      Lab notes ({report.technician_name}): {report.notes}
                    </p>
                  )}
                  <div className="result-list mb-4">
                    {images.map((im) => {
                      const positive = im.predicted_label === "parasitized";
                      return (
                        <div className="result-row" key={im.id}>
                          {/* click the picture to open it full size in a new tab */}
                          <a href={im.image} target="_blank" rel="noreferrer" title="Open full size">
                            <img src={im.image} alt="Blood cell" className="result-thumb" />
                          </a>
                          <div className="flex-grow-1">
                            <span className={"status-badge " + (positive ? "status-positive" : "status-done")}>
                              {positive ? "Parasitized" : "Uninfected"}
                            </span>
                            <div className="prob">
                              <div className="prob-bar">
                                <div className={"prob-fill " + (positive ? "pos" : "neg")} style={{ width: im.probability * 100 + "%" }}></div>
                                <div className="prob-threshold" style={{ left: im.threshold * 100 + "%" }} title={"Threshold " + im.threshold}></div>
                              </div>
                              <div className="small text-secondary">
                                Probability {(im.probability * 100).toFixed(1)}% · threshold {(im.threshold * 100).toFixed(0)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* an existing diagnosis: show it, with its history */}
                  {visit.diagnosis && (
                    <>
                      <h3 className="h6 fw-bold mb-2">Diagnosis</h3>
                      <div className="diagnosis-box mb-3">
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                          <span className={"status-badge " + (visit.diagnosis.result === "positive" ? "status-positive" : "status-done")}>
                            Malaria {visit.diagnosis.result}
                          </span>
                          {visit.diagnosis.overruled && <span className="status-badge status-overruled">Overruled scan</span>}
                          <span className="small text-secondary">
                            {visit.diagnosis.doctor_name} · {niceDateTime(visit.diagnosis.created_at)}
                          </span>
                        </div>
                        <div className="small">{visit.diagnosis.notes ? visit.diagnosis.notes : <span className="text-secondary">No notes.</span>}</div>
                      </div>

                      {visit.diagnosis.corrections.length > 0 && (
                        <>
                          <h3 className="h6 fw-bold mb-2">Correction history</h3>
                          <div className="history-list mb-3">
                            {[...visit.diagnosis.corrections].reverse().map((c) => (
                              <div className="history-row" key={c.id}>
                                <div className="small text-secondary mb-1">
                                  {c.corrected_by_name} · {niceDateTime(c.created_at)}
                                </div>
                                <div>
                                  Was <strong>malaria {c.previous_result}</strong>
                                  {c.previous_notes ? ' ("' + c.previous_notes + '")' : ""}
                                </div>
                                <div className="small">Reason for correcting: {c.reason}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* the decision: a new diagnosis, or a correction */}
                  {(!visit.diagnosis || correcting) && (
                    <>
                      <h3 className="h6 fw-bold mb-2">{correcting ? "Corrected diagnosis" : "Your diagnosis"}</h3>
                      <div className="decision-row mb-2">
                        <label className={"decision positive" + (result === "positive" ? " chosen" : "")}>
                          <input type="radio" name="result" value="positive" checked={result === "positive"} onChange={() => setResult("positive")} />
                          Malaria positive
                        </label>
                        <label className={"decision negative" + (result === "negative" ? " chosen" : "")}>
                          <input type="radio" name="result" value="negative" checked={result === "negative"} onChange={() => setResult("negative")} />
                          Malaria negative
                        </label>
                      </div>
                      <div className="form-text mb-3">
                        {result === ""
                          ? "The scan suggests: malaria " + scanSays + "."
                          : agrees
                          ? "This agrees with the scan (malaria " + scanSays + ")."
                          : "This is different from the scan (malaria " + scanSays + "). Please explain why in the notes."}
                      </div>

                      <Form.Group className="mb-3" controlId="diagnosis-notes">
                        <Form.Label>Notes {agrees || result === "" ? "(optional)" : "(required)"}</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. start artemether-lumefantrine, review in 3 days"
                        />
                      </Form.Group>

                      {correcting && (
                        <Form.Group className="mb-3" controlId="correction-reason">
                          <Form.Label>Why are you correcting this? (required)</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={2}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. slide was mislabelled, repeat smear was negative"
                          />
                          <div className="form-text">The earlier diagnosis stays on record in the history.</div>
                        </Form.Group>
                      )}
                    </>
                  )}
                </>
              )}

              {caseError && <Alert variant="danger" className="py-2 mb-0">{caseError}</Alert>}
            </Modal.Body>
            <Modal.Footer>
              {!visit.diagnosis && (
                <span className="small text-secondary me-auto">You can correct a saved diagnosis later; the original stays on record.</span>
              )}
              <Button variant="outline-secondary" type="button" onClick={closeCase} disabled={saving}>
                {visit.diagnosis && !correcting ? "Close" : "Cancel"}
              </Button>
              {visit.diagnosis && !correcting && (
                <Button variant="primary" type="button" disabled={!report} onClick={startCorrecting}>
                  Correct diagnosis
                </Button>
              )}
              {(!visit.diagnosis || correcting) && (
                <Button variant="primary" type="submit" disabled={!report || saving}>
                  {saving ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" /> Saving...
                    </>
                  ) : correcting ? (
                    "Save correction"
                  ) : (
                    "Save diagnosis"
                  )}
                </Button>
              )}
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </>
  );
}
