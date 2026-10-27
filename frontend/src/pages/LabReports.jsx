import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, Modal, Nav, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import "./lab.css";

// How each visit status is written and which colour pill it gets (colours live in theme.css)
const STATUS = {
  sent_to_lab: { label: "Waiting for lab", css: "status-lab" },
  sent_to_doctor: { label: "Sent to doctor", css: "status-doctor" },
  diagnosed: { label: "Diagnosed", css: "status-done" },
};

// The Lab reports screen (lab technician):
//   tab 1  "Lab reports"      - visits sent by nurses. Open one, upload cell images,
//                               see the CNN result, then send the case to the doctor.
//   tab 2  "Recent cases"     - the latest cases and where each one is now.
export default function LabReports() {
  const { token } = useAuth();
  const [tab, setTab] = useState("queue");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);          // add 1 to ask both lists again

  // ----- tab 1: visits waiting for the lab -----
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

  // ----- the report window -----
  const [visit, setVisit] = useState(null);          // the visit being worked on (null = window closed)
  const [report, setReport] = useState(null);        // its lab report, once it exists
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);            // images chosen but not scanned yet
  const [scanning, setScanning] = useState("");      // "Scanning image 2 of 5..." while working
  const [uploadErrors, setUploadErrors] = useState([]);
  const [sending, setSending] = useState(false);
  const [reportError, setReportError] = useState("");
  const fileInput = useRef(null);

  // Load the waiting visits
  useEffect(() => {
    let cancelled = false;
    setQueueLoading(true);
    setQueueError("");
    api("/visits/?status=sent_to_lab", { token })
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

  // Open the report window for one visit
  async function openReport(v) {
    setVisit(v);
    setReport(null);
    setNotes("");
    setFiles([]);
    setUploadErrors([]);
    setReportError("");
    setScanning("");
    if (v.lab_report_id) {
      // the lab already started this report earlier: load it with its images
      try {
        const r = await api("/lab-reports/" + v.lab_report_id + "/", { token });
        setReport(r);
        setNotes(r.notes);
      } catch (err) {
        setReportError(err.message);
      }
    }
  }

  function closeReport() {
    if (scanning || sending) return;               // not while something is being saved
    setVisit(null);
    setReload((n) => n + 1);                       // refresh the lists behind it
  }

  // Scan every chosen image, one after another. The first one also creates the report.
  async function handleScan() {
    if (files.length === 0) return;
    setReportError("");
    setUploadErrors([]);

    let current = report;
    const failed = [];
    for (let i = 0; i < files.length; i++) {
      setScanning("Scanning image " + (i + 1) + " of " + files.length + "...");
      try {
        // make the report when we send the first image
        if (!current) {
          const created = await api("/lab-reports/", { method: "POST", token, body: { visit: visit.id, notes: notes.trim() } });
          current = { ...created, images: [] };
        }
        const form = new FormData();
        form.append("image", files[i]);
        const image = await api("/lab-reports/" + current.id + "/images/", { method: "POST", token, body: form });
        current = { ...current, images: [...current.images, image] };
        setReport(current);                         // show each result as soon as it arrives
      } catch (err) {
        failed.push(files[i].name + ": " + err.message);
        if (!current) break;                        // the report itself could not be made: stop
      }
    }
    setScanning("");
    setFiles([]);
    if (fileInput.current) fileInput.current.value = "";
    setUploadErrors(failed);
  }

  // Send the report to the doctor
  async function handleSend() {
    setSending(true);
    setReportError("");
    try {
      await api("/lab-reports/" + report.id + "/refer/", { method: "POST", token });
      setNotice("The case for " + visit.patient.name + " was sent to the doctor.");
      setVisit(null);
      setReload((n) => n + 1);
    } catch (err) {
      setReportError(err.message);
    } finally {
      setSending(false);
    }
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

  const images = report ? report.images : [];
  const positives = images.filter((im) => im.predicted_label === "parasitized").length;

  return (
    <>
      <div className="mb-4">
        <h1 className="mb-1">Lab reports</h1>
        <p className="text-secondary mb-0">Scan blood cell images and send the case to the doctor.</p>
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

      {/* ---------- tab 1: waiting for lab ---------- */}
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
                      Nothing is waiting for the lab right now.
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
                        <Button size="sm" variant="primary" onClick={() => openReport(v)}>
                          {v.lab_report_id ? "Continue report" : "Start report"}
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
                const st = STATUS[v.status] || { label: v.status, css: "" };
                return (
                  <div className="recent-row" key={v.id}>
                    <div>
                      <span className="fw-semibold">Patient {v.patient.patient_number}</span> — {v.patient.name}
                      <div className="small text-secondary">{niceDate(v.visit_date)} · {v.lab_name}</div>
                    </div>
                    <span className={"status-badge " + st.css}>{st.label}</span>
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

      {/* ---------- the report window ---------- */}
      <Modal show={Boolean(visit)} onHide={closeReport} size="lg" centered scrollable>
        {visit && (
          <>
            <Modal.Header closeButton>
              <Modal.Title as="h4">Lab report · {visit.patient.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {/* what the nurse recorded */}
              <div className="visit-summary mb-3">
                <div><span className="text-secondary">Patient no.</span> {visit.patient.patient_number}</div>
                <div><span className="text-secondary">Age</span> {visit.patient.age}</div>
                <div><span className="text-secondary">Vitals</span> {vitalsText(visit)}</div>
                <div className="w-100"><span className="text-secondary">Symptoms</span> {visit.symptoms || "-"}</div>
              </div>

              {/* notes can only be written when the report is first made */}
              <Form.Group className="mb-3" controlId="lab-notes">
                <Form.Label>Lab notes (optional)</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={Boolean(report)}
                  placeholder="e.g. thick smear, Giemsa stain"
                />
              </Form.Group>

              {/* choose images and scan them */}
              <Form.Group className="mb-3" controlId="lab-images">
                <Form.Label>Blood cell images (PNG or JPEG, up to 5 MB each)</Form.Label>
                <div className="d-flex flex-wrap gap-2">
                  <Form.Control
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="flex-grow-1"
                    onChange={(e) => setFiles(Array.from(e.target.files))}
                    disabled={Boolean(scanning)}
                  />
                  <Button variant="primary" onClick={handleScan} disabled={files.length === 0 || Boolean(scanning)}>
                    {scanning ? (
                      <>
                        <Spinner animation="border" size="sm" className="me-2" /> Scanning...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-upc-scan me-2"></i> Scan {files.length > 0 ? files.length : ""} image{files.length === 1 ? "" : "s"}
                      </>
                    )}
                  </Button>
                </div>
                {scanning && <div className="form-text">{scanning}</div>}
              </Form.Group>

              {uploadErrors.length > 0 && (
                <Alert variant="danger" className="py-2">
                  {uploadErrors.map((m) => (
                    <div key={m}>{m}</div>
                  ))}
                </Alert>
              )}
              {reportError && <Alert variant="danger" className="py-2">{reportError}</Alert>}

              {/* the CNN results */}
              {images.length > 0 && (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h3 className="h6 fw-bold mb-0">Results</h3>
                    <span className={"status-badge " + (positives > 0 ? "status-positive" : "status-done")}>
                      {positives} of {images.length} image{images.length === 1 ? "" : "s"} parasitized
                    </span>
                  </div>
                  <div className="result-list">
                    {images.map((im) => {
                      const positive = im.predicted_label === "parasitized";
                      return (
                        <div className="result-row" key={im.id}>
                          <img src={im.image} alt="Blood cell" className="result-thumb" />
                          <div className="flex-grow-1">
                            <span className={"status-badge " + (positive ? "status-positive" : "status-done")}>
                              {positive ? "Parasitized" : "Uninfected"}
                            </span>
                            <div className="prob">
                              <div className="prob-bar">
                                <div className={"prob-fill " + (positive ? "pos" : "neg")} style={{ width: im.probability * 100 + "%" }}></div>
                                {/* the line where the model switches to "parasitized" */}
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
                </>
              )}
            </Modal.Body>
            <Modal.Footer className="d-block">
              <Button
                variant="outline-secondary"
                className="send-case"
                onClick={handleSend}
                disabled={!report || images.length === 0 || sending || Boolean(scanning)}
              >
                {sending ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" /> Sending...
                  </>
                ) : (
                  "Send case to doctor"
                )}
              </Button>
              {images.length === 0 && <div className="form-text text-center">Scan at least one image first.</div>}
            </Modal.Footer>
          </>
        )}
      </Modal>
    </>
  );
}