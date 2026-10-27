import { useNavigate } from "react-router-dom";
import { ROLES } from "../roles.js";

// The slim floating sidebar: one icon button per profile.
// Point at an icon to see its name, click it to go to that profile's sign-in page.
//   activeKey - the profile of the page we are on (it stays highlighted)
export default function ProfileRail({ activeKey }) {
  const navigate = useNavigate(); // lets us jump to another page

  return (
    <nav className="profile-rail" aria-label="Choose your profile">
      {/* logo bubble at the top: click it to go back to the welcome page */}
      <button type="button" className="rail-logo" onClick={() => navigate("/")} aria-label="Home">
        <i className="bi bi-heart-pulse-fill"></i>
      </button>
      <div className="rail-divider"></div>

      {ROLES.map((r) => (
        <button
          type="button"
          key={r.key}
          className={"rail-btn" + (activeKey === r.key ? " active" : "")}
          onClick={() => navigate("/signin/" + r.key)}
          aria-label={"Sign in as " + r.label}
        >
          <i className={"bi " + r.icon}></i>
          {/* the name that pops out on hover */}
          <span className="rail-tip">{r.label}</span>
        </button>
      ))}
    </nav>
  );
}