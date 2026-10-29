import { useEffect, useState } from "react";
import { Alert, Button, Modal, Spinner } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";
import "../pages/lab.css";      // the result rows and the probability bar
import "../pages/cases.css";    // the diagnosis box and the correction history

// A READ-ONLY window showing one case: the patient, the lab scan results and the diagnosis.
// Nothing can be changed here. It is used by the lab technician's and the admin's lists.
//   visit  - the visit to show (null = closed)
//   onHide - called when the window is closed
export default function CaseView({ visit, onHide }) {
  const { token } = useAuth();
  const [report, setReport] = useState(null);       // the lab report with its images
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Whenever a different case is opened, load its lab report (if it has one)
  const visitId = visit ? visit.id : null;
  const reportId = visit ? visit.lab_report_id : null;
  useEffect(() => {
    setReport(null);
    setError("");
    if (!visitId || !reportId) return undefined;
    let cancelled = false;
    setLoading(true);
    api("/lab-reports/" + reportId + "/", { token })
      .then((data) => !cancelled && setReport(data))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [visitId, reportId, token]);

  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function niceDateTime(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const d = visit ? visit.diagnosis : null;

  return (
    <Modal show={Boolean(visit)} onHide={onHide} size="lg" centered scrollable>
      {visit && (
        <>
          <Modal.Header closeButton>
            <Modal.Title as="h4">Case · {visit.patient.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {/* what the nurse recorded */}
            <div className="visit-summary mb-3">
              <div><span className="text-secondary">Patient no.</span> {visit.patient.patient_number}</div>
              <div><span className="text-secondary">Age</span> {visit.patient.age}</div>
              <div><span className="text-secondary">Visit</span> {niceDate(visit.visit_date)}</div>
              <div><span className="text-secondary">Vitals</span> {vitalsText(visit)}</div>
              <div className="w-100"><span className="text-secondary">Symptoms</span> {visit.symptoms || "-"}</div>
              <div className="w-100">
                <span className="text-secondary">Nurse</span> {visit.nurse_name} · <span className="text-secondary">Lab</span> {visit.lab_name}
              </div>
            </div>

            {/* the lab scan */}
            <h3 className="h6 fw-bold mb-2">Lab scan results</h3>
            {!visit.lab_report_id && <p className="text-secondary">The lab has not started a report for this case yet.</p>}
            {loading && (
              <div className="text-center py-4">
                <Spinner animation="border" size="sm" className="me-2" /> Loading the lab report...
              </div>
            )}
            {error && <Alert variant="danger" className="py-2">{error}</Alert>}
            {report && (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small text-secondary">
                    {report.technician_name ? "Scanned by " + report.technician_name : ""}
                  </span>
                  <span className={"status-badge " + (positives > 0 ? "status-positive" : "status-done")}>
                    {positives} of {images.length} image{images.length === 1 ? "" : "s"} parasitized
                  </span>
                </div>
                {report.notes && <p className="small text-secondary mb-2">Lab notes: {report.notes}</p>}
                {images.length === 0 && <p className="text-secondary">No images were scanned.</p>}
                <div className="result-list mb-4">
                  {images.map((im) => {
                    const positive = im.predicted_label === "parasitized";
                    return (
                      <div className="result-row" key={im.id}>
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
              </>
            )}

            {/* the doctor's diagnosis */}
            <h3 className="h6 fw-bold mb-2">Diagnosis</h3>
            {!d && <p className="text-secondary mb-0">The doctor has not diagnosed this case yet.</p>}
            {d && (
              <>
                <div className="diagnosis-box mb-3">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                    <span className={"status-badge " + (d.result === "positive" ? "status-positive" : "status-done")}>
                      Malaria {d.result}
                    </span>
                    {d.overruled && <span className="status-badge status-overruled">Overruled scan</span>}
                    <span className="small text-secondary">{d.doctor_name} · {niceDateTime(d.created_at)}</span>
                  </div>
                  <div className="small">{d.notes ? d.notes : <span className="text-secondary">No notes.</span>}</div>
                </div>
                {d.corrections.length > 0 && (
                  <>
                    <h3 className="h6 fw-bold mb-2">Correction history</h3>
                    <div className="history-list">
                      {[...d.corrections].reverse().map((c) => (
                        <div className="history-row" key={c.id}>
                          <div className="small text-secondary mb-1">{c.corrected_by_name} · {niceDateTime(c.created_at)}</div>
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
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          </Modal.Footer>
        </>
      )}
    </Modal>
  );
}