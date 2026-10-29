import { useEffect, useState } from "react";
import { Alert, Button, Form, Spinner, Table } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { api, downloadFile } from "../api.js";
import TimeFrame from "../components/TimeFrame.jsx";
import { ALL_TIME, rangeQuery } from "../timeframe.js";
import "./staff.css";

// How each action code from the server is written on screen.
// warn = true shows the tag in red (things worth a second look).
const ACTIONS = {
  LOGIN: { label: "Signed in" },
  LOGOUT: { label: "Signed out" },
  LOGIN_FAILED: { label: "Failed sign-in", warn: true },
  CHANGE_PASSWORD: { label: "Changed password" },
  PASSWORD_RESET_REQUESTED: { label: "Asked for password reset" },
  PASSWORD_RESET_COMPLETED: { label: "Password reset done" },
  CREATE_USER: { label: "Created account" },
  UPDATE_USER: { label: "Changed account" },
  CREATE_LAB: { label: "Added lab" },
  CREATE_PATIENT: { label: "Registered patient" },
  CREATE_VISIT: { label: "Recorded visit" },
  CREATE_LAB_REPORT: { label: "Started lab report" },
  UPLOAD_AND_PREDICT: { label: "Scanned image" },
  SEND_TO_DOCTOR: { label: "Sent case to doctor" },
  CREATE_DIAGNOSIS: { label: "Saved diagnosis" },
  CORRECT_DIAGNOSIS: { label: "Corrected diagnosis", warn: true },
};

const ROLE_NAMES = { nurse: "Nurse", lab_technician: "Lab technician", doctor: "Doctor", admin: "System admin" };

// The Activity logs screen (admin): who did what, and when. Read only.
export default function Logs() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");           // "" = every kind of action
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState(ALL_TIME);       // the period to show
  const [downloading, setDownloading] = useState(false);

  // The filters as part of a web address (used by the list AND by the Excel download)
  const filters = (action ? "&action=" + action : "") + rangeQuery(range);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api("/logs/?page=" + page + filters, { token })
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
  }, [filters, page, reload, token]);

  // Download what the filters show as an Excel file
  async function handleDownload() {
    setError("");
    setDownloading(true);
    try {
      const day = new Date().toLocaleDateString("en-CA");      // 2026-10-28, in local time
      await downloadFile("/logs/export/?" + filters.slice(1), "activity-logs-" + day + ".xlsx", token);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  // "28 Oct 2026, 10:24"
  function niceDateTime(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div>
          <h1 className="mb-1">Activity logs</h1>
          <p className="text-secondary mb-0">
            {loading ? "Loading..." : count + (count === 1 ? " entry" : " entries") + (filters ? " found" : "")}
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="outline-success" onClick={handleDownload} disabled={downloading || loading}>
            {downloading ? <Spinner animation="border" size="sm" className="me-2" /> : <i className="bi bi-file-earmark-excel me-2"></i>}
            Download Excel
          </Button>
          <Button variant="outline-secondary" onClick={() => setReload((n) => n + 1)} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-2"></i> Refresh
          </Button>
        </div>
      </div>

      <div className="admin-filters mb-3">
        <Form.Select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {Object.entries(ACTIONS).map(([code, a]) => (
            <option key={code} value={code}>{a.label}</option>
          ))}
        </Form.Select>
        <TimeFrame
          label="Period"
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
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center py-5">
                  <Spinner animation="border" size="sm" className="me-2" /> Loading...
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-secondary py-5">Nothing logged yet.</td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => {
                const a = ACTIONS[r.action] || { label: r.action };
                return (
                  <tr key={r.id}>
                    <td className="text-secondary text-nowrap">{niceDateTime(r.logged_at)}</td>
                    <td>
                      {r.actor_name ? (
                        <>
                          <div className="fw-semibold">{r.actor_name}</div>
                          <div className="small text-secondary">{ROLE_NAMES[r.actor_role] || r.actor_role}</div>
                        </>
                      ) : (
                        <span className="text-secondary">Not signed in</span>
                      )}
                    </td>
                    <td><span className={"action-tag" + (a.warn ? " warn" : "")}>{a.label}</span></td>
                    <td className="log-detail">{r.description || "-"}</td>
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
    </>
  );
}