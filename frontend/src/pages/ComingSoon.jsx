import { useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { NAV } from "../navigation.js";

// A placeholder for screens we have not built yet.
// It looks up its own title and icon from the menu list.
export default function ComingSoon() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const item = (NAV[user.role] || []).find((i) => i.to === pathname);

  return (
    <div className="text-center py-5">
      <div className="quick-icon mx-auto" style={{ width: 72, height: 72, fontSize: "2rem" }}>
        <i className={"bi " + (item ? item.icon : "bi-hourglass-split")}></i>
      </div>
      <h2 className="fw-bold">{item ? item.label : "Coming soon"}</h2>
      <p className="text-secondary">This screen is coming next.</p>
    </div>
  );
}