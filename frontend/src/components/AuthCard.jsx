import { Link } from "react-router-dom";

// The white card used by the password pages that are shown BEFORE signing in
// (forgot password, reset password). It has the same soft background as the sign-in page.
//   icon     - a Bootstrap icon name, e.g. "bi-key"
//   title    - the heading
//   subtitle - one line under the heading
//   backTo / backLabel - the small "Back" link at the top of the card
export default function AuthCard({ icon, title, subtitle, backTo, backLabel, children }) {
  return (
    <div className="auth-page">
      <span className="cell cell-1"></span>
      <span className="cell cell-2"></span>
      <span className="cell cell-3"></span>

      <main className="auth-main justify-content-center" style={{ paddingRight: "2rem" }}>
        <div className="signin-card fade-in">
          <div className="signin-top">
            <Link to={backTo} className="signin-back">
              <i className="bi bi-arrow-left me-1"></i> {backLabel}
            </Link>
            <div className="reset-icon">
              <i className={"bi " + icon}></i>
            </div>
            <h4 className="fw-bold mt-3 mb-1">{title}</h4>
            <p className="text-secondary small mb-0">{subtitle}</p>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </main>
    </div>
  );
}