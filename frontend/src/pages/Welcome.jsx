import CellScanGraphic from "../components/CellScanGraphic.jsx";
import ProfileRail from "../components/ProfileRail.jsx";
import "./auth.css";

// The first page people see: a welcome screen with the profile sidebar.
export default function Welcome() {
  return (
    <div className="auth-page">
      {/* floating background circles */}
      <span className="cell cell-1"></span>
      <span className="cell cell-2"></span>
      <span className="cell cell-3"></span>

      {/* the slim sidebar (on the right) */}
      <ProfileRail />

      <main className="auth-main">
        <div className="row align-items-center g-5 w-100">
          <div className="col-lg-6">
            <div className="fs-2 fw-bold mb-4">
              <i className="bi bi-heart-pulse-fill text-primary me-2"></i>
              MalariaScan
            </div>
            <h1 className="display-5 fw-bold mb-3">
              Spot malaria faster.
              <br />
              Care sooner.
            </h1>
            <p className="fs-5 text-secondary mb-0" style={{ maxWidth: 480 }}>
              Blood cell images are screened in seconds, so nurses, lab
              technicians and doctors can act on the result together.
            </p>
          </div>

          <div className="col-lg-6 text-center">
            <CellScanGraphic />
          </div>
        </div>
      </main>
    </div>
  );
}