import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import AppLayout, { RequireRole } from "./components/AppLayout.jsx";
import Welcome from "./pages/Welcome.jsx";
import SignIn from "./pages/SignIn.jsx";
import Home from "./pages/Home.jsx";
import ComingSoon from "./pages/ComingSoon.jsx";
import Patients from "./pages/Patients.jsx";
import Visits from "./pages/Visits.jsx";
import LabReports from "./pages/LabReports.jsx";
import Cases from "./pages/Cases.jsx";

// Decides which page to show, based on the address in the browser.
//   Before signing in:  /  and  /signin/nurse ...
//   After signing in:   everything inside <AppLayout> (top bar + page)
// RequireRole keeps each screen for the roles that should see it.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* before signing in */}
          <Route path="/" element={<Welcome />} />
          <Route path="/signin/:roleKey" element={<SignIn />} />

          {/* after signing in */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Home />} />

            <Route path="/patients" element={<RequireRole roles={["nurse"]}><Patients /></RequireRole>} />
            <Route path="/visits" element={<RequireRole roles={["nurse"]}><Visits /></RequireRole>} />
            <Route path="/lab" element={<RequireRole roles={["lab_technician"]}><LabReports /></RequireRole>} />
            <Route path="/cases" element={<RequireRole roles={["doctor"]}><Cases /></RequireRole>} />
            <Route path="/users" element={<RequireRole roles={["admin"]}><ComingSoon /></RequireRole>} />
            <Route path="/logs" element={<RequireRole roles={["admin"]}><ComingSoon /></RequireRole>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}