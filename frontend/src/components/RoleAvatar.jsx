// A simple, friendly profile picture in our teal colours.
// The small round badge in the corner shows which role it is.
// "size" is the width and height in pixels (default 104).

// Which icon goes with which role
const ICONS = {
  nurse: "bi-clipboard2-pulse",
  lab_technician: "bi-droplet-half",
  doctor: "bi-heart-pulse",
  admin: "bi-shield-check",
};

export default function RoleAvatar({ role, size = 104 }) {
  return (
    <div className="avatar-wrap" style={{ "--avatar-size": size + "px" }}>
      <svg viewBox="0 0 120 120" className="avatar" aria-hidden="true">
        <defs>
          {/* keeps the shoulders inside the round picture */}
          <clipPath id="avatar-clip">
            <circle cx="60" cy="60" r="58" />
          </clipPath>
        </defs>
        <circle cx="60" cy="60" r="58" fill="#e3f4f1" />
        <g clipPath="url(#avatar-clip)" fill="#6cc5ba">
          <circle cx="60" cy="46" r="20" />            {/* head */}
          <ellipse cx="60" cy="112" rx="38" ry="32" /> {/* shoulders */}
        </g>
      </svg>
      {/* role badge */}
      <span className="avatar-badge">
        <i className={"bi " + ICONS[role]}></i>
      </span>
    </div>
  );
}