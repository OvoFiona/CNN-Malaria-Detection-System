import { Link } from "react-router-dom";
import { Col, Row } from "react-bootstrap";
import { useAuth } from "../AuthContext.jsx";
import { NAV } from "../navigation.js";

// The first page after signing in: a greeting and big cards for the
// things this role can do. The cards come from the menu list in navigation.js.
export default function Home() {
  const { user } = useAuth();

  // "Good morning / afternoon / evening" from the clock
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // all menu items except Home itself
  const cards = (NAV[user.role] || []).filter((item) => item.to !== "/dashboard");

  return (
    <>
      <div className="home-hero">
        <span className="role-pill">
          <i className="bi bi-person-check me-1"></i> {user.role_display}
        </span>
        <h1 className="fw-bold mt-3 mb-1">
          {greeting}, {user.name.split(" ")[0]}
        </h1>
        <p className="text-secondary mb-0">What would you like to do today?</p>
      </div>

      <Row className="g-3">
        {cards.map((item) => (
          <Col md={6} lg={4} key={item.to}>
            <Link to={item.to} className="quick-card">
              <div className="quick-icon">
                <i className={"bi " + item.icon}></i>
              </div>
              <h5 className="fw-bold mb-1">{item.label}</h5>
              <p className="text-secondary small mb-0">{item.desc}</p>
            </Link>
          </Col>
        ))}
      </Row>
    </>
  );
}