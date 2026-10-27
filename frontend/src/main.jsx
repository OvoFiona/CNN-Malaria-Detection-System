import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Load the styles. ORDER MATTERS: Bootstrap first, our theme last,
// so our colours win over Bootstrap's defaults.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./theme.css";

import App from "./App.jsx";

// Put the App inside the <div id="root"> from index.html
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);