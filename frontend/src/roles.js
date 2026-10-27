// The four profiles, in one place so every page uses the same list.
// "key" matches the role names in our Django backend.
export const ROLES = [
  { key: "nurse", label: "Nurse", icon: "bi-clipboard2-pulse", hint: "Register patients and record their vitals.", placeholder: "jane.achieng@kisumulab.org" },
  { key: "lab_technician", label: "Lab technician", icon: "bi-droplet-half", hint: "Upload cell images and run the malaria scan.", placeholder: "peter.otieno@kisumulab.org" },
  { key: "doctor", label: "Doctor", icon: "bi-heart-pulse", hint: "Review lab results and record the diagnosis.", placeholder: "dr.mary.wanjiru@hospital.org" },
  { key: "admin", label: "Admin", icon: "bi-shield-check", hint: "Manage staff accounts and view activity logs.", placeholder: "alex.admin@malariasystem.org" },
];