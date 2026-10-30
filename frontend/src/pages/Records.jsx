import { useEffect, useState } from "react";
import { Alert, Button, Form, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api, downloadFile } from "../api.js";
import CaseView from "../components/CaseView.jsx";
import TimeFrame from "../components/TimeFrame.jsx";
import { ALL_TIME, rangeQuery } from "../timeframe.js";
import "./staff.css";
import "./cases.css";

// Where each visit is in the workflow
const STAGES = {
  sent_to_lab: { label: "Waiting for lab", css: "status-lab" },
  sent_to_doctor: { label: "With doctor", css: "status-doctor" },
  diagnosed: { label: "Diagnosed", css: "status-done" },
};

// The Records screen (admin): every visit in the system with its scan and diagnosis.
// Filter it, open a case to read it (read only), or download it as an Excel file.
export default function Records() {
  const { token } = useAuth();

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");          // what is typed
  const [term, setTerm] = useState("");              // what we really search for (after a pause)
  const [stage, setStage] = useState("");            // "" = every stage
  const [diagnosis, setDiagnosis] = useState("");    // "", "positive", "negative" or "overruled"
  const [range, setRange] = useState(ALL_TIME);      // the visit dates
  const [downloading, setDownloading] = useState(false);
  const [viewing, setViewing] = useState(null);      // the case open in the read-only window

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
    (term ? "&search=" + encodeURIComponent(term) : "") +
    (stage ? "&status=" + stage : "") +
    (diagnosis === "overruled" ? "&overruled=1" : diagnosis ? "&result=" + diagnosis : "") +
    rangeQuery(range);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api("/visits/?page=" + page + filters, { token })
      .then((data) => {
        if (cancelled) return;
        setRows(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrev(Boolean(data.previous));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, page, token]);

  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      const day = new Date().toLocaleDateString("en-CA");      // 2026-10-28, in local time
      await downloadFile("/visits/export/?" + filters.slice(1), "clinic-records-" + day + ".xlsx", token);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  function niceDate(iso) {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="mb-1">Records</h1>
          <p className="text-secondary mb-0">
            {loading ? "Loading..." : count + (count === 1 ? " visit" : " visits") + (filters ? " found" : " recorded")}
          </p>
        </div>
        <Button variant="outline-success" onClick={handleDownload} disabled={downloading || loading}>
          {downloading ? <Spinner animation="border" size="sm" className="me-2" /> : <i className="bi bi-file-earmark-excel me-2"></i>}
          Download Excel
        </Button>
      </div>

      <div className="admin-filters mb-3">
        <div className="admin-search">
          <i className="bi bi-search"></i>
          <Form.Control
            type="search"
            placeholder="Search by patient name or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search records"
          />
        </div>
        <Form.Select value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }} aria-label="Filter by stage">
          <option value="">All stages</option>
          <option value="sent_to_lab">Waiting for lab</option>
          <option value="sent_to_doctor">With doctor</option>
          <option value="diagnosed">Diagnosed</option>
        </Form.Select>
        <Form.Select value={diagnosis} onChange={(e) => { setDiagnosis(e.target.value); setPage(1); }} aria-label="Filter by diagnosis">
          <option value="">Any diagnosis</option>
          <option value="positive">Malaria positive</option>
          <option value="negative">Malaria negative</option>
          <option value="overruled">Overruled scan only</option>
        </Form.Select>
        <TimeFrame label="Visit date" value={range} onChange={(r) => { setRange(r); setPage(1); }} />
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="admin-table">
        <Table hover responsive className="mb-0 align-middle">
          <thead>
            <tr>
              <th>Date</th>
              <th>Patient</th>
              <th>People</th>
              <th>Stage</th>
              <th>Diagnosis</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading records...
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-secondary py-5">No visits match.</td>
              </tr>
            )}
            {!loading &&
              rows.map((v) => {
                const st = STAGES[v.status] || { label: v.status, css: "" };
                const d = v.diagnosis;
                return (
                  <tr key={v.id}>
                    <td className="text-secondary text-nowrap">{niceDate(v.visit_date)}</td>
                    <td>
                      <div className="fw-semibold">{v.patient.name}</div>
                      <div className="small text-secondary">No. {v.patient.patient_number} · {v.patient.age} yrs</div>
                    </td>
                    <td className="people-cell">
                      <div><span className="role-label">Nurse</span> {v.nurse_name}</div>
                      <div><span className="role-label">Lab tech</span> {v.technician_name || <span className="text-secondary">not scanned yet</span>}</div>
                      <div><span className="role-label">Doctor</span> {d ? d.doctor_name : <span className="text-secondary">not diagnosed yet</span>}</div>
                      <div className="small text-secondary">{v.lab_name}</div>
                    </td>
                    <td><span className={"status-badge " + st.css}>{st.label}</span></td>
                    <td>
                      {d ? (
                        <div className="d-flex flex-wrap gap-1">
                          <span className={"status-badge " + (d.result === "positive" ? "status-positive" : "status-done")}>
                            Malaria {d.result}
                          </span>
                          {d.overruled && <span className="status-badge status-overruled">Overruled scan</span>}
                          {d.corrections.length > 0 && <span className="status-badge status-corrected">Corrected</span>}
                        </div>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" onClick={() => setViewing(v)}>
                        View
                      </Button>
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

      <CaseView visit={viewing} onHide={() => setViewing(null)} />
    </>
  );
}