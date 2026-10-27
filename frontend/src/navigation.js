// What each profile sees in the top menu.
//   to    - the page address
//   label - the words in the menu
//   icon  - the Bootstrap icon
//   desc  - one line shown on the home page card (not used for "Home")
const HOME = { to: "/dashboard", label: "Home", icon: "bi-house-door" };

export const NAV = {
  nurse: [
    HOME,
    { to: "/patients", label: "Patients", icon: "bi-people", desc: "Find a patient or register a new one." },
    { to: "/visits", label: "Visits", icon: "bi-clipboard2-pulse", desc: "Record vitals and send a patient to the lab." },
  ],
  lab_technician: [
    HOME,
    { to: "/lab", label: "Lab Reports", icon: "bi-droplet-half", desc: "Upload cell images and run the malaria scan." },
  ],
  doctor: [
    HOME,
    { to: "/cases", label: "Cases", icon: "bi-heart-pulse", desc: "Review lab results and record the diagnosis." },
  ],
  admin: [
    HOME,
    { to: "/users", label: "Staff", icon: "bi-person-gear", desc: "Create and manage staff accounts." },
    { to: "/logs", label: "Activity logs", icon: "bi-journal-text", desc: "See who did what, and when." },
  ],
};