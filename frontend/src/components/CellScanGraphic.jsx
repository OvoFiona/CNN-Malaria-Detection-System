// An illustration of what the system does: a microscope view of blood cells,
// a scanning line, and the AI marking one infected cell.

// Positions of the red blood cells in the picture (x, y, radius)
const CELLS = [
  { x: 105, y: 105, r: 38 },
  { x: 215, y: 72, r: 34 },
  { x: 300, y: 140, r: 40 },
  { x: 78, y: 215, r: 36 },
  { x: 210, y: 205, r: 44, infected: true },
  { x: 318, y: 268, r: 38 },
  { x: 120, y: 312, r: 40 },
  { x: 240, y: 325, r: 36 },
];

// Tiny platelets scattered between the cells (x, y)
const PLATELETS = [[160, 160], [270, 70], [160, 260], [350, 200], [60, 120], [280, 220], [190, 350]];

export default function CellScanGraphic() {
  return (
    <svg viewBox="0 0 400 400" className="scan-graphic" role="img" aria-label="Blood cells being scanned">
      <defs>
        {/* red blood cell shading */}
        <radialGradient id="rbc" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fbb9b9" />
          <stop offset="0.6" stopColor="#ef7f8e" />
          <stop offset="1" stopColor="#d9566b" />
        </radialGradient>
        {/* the microscope slide background */}
        <radialGradient id="slide" cx="50%" cy="45%" r="65%">
          <stop offset="0" stopColor="#fff6f8" />
          <stop offset="1" stopColor="#f8dce6" />
        </radialGradient>
        {/* soft teal glow of the scanning line */}
        <linearGradient id="scanGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d9488" stopOpacity="0" />
          <stop offset="1" stopColor="#0d9488" stopOpacity="0.35" />
        </linearGradient>
        <clipPath id="viewfield">
          <circle cx="200" cy="200" r="186" />
        </clipPath>
      </defs>

      {/* white ring around the microscope view */}
      <circle cx="200" cy="200" r="196" fill="#ffffff" stroke="#cfe9e5" strokeWidth="6" />

      <g clipPath="url(#viewfield)">
        <rect width="400" height="400" fill="url(#slide)" />

        {/* platelets */}
        {PLATELETS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill="#b9a7e6" opacity="0.8" />
        ))}

        {/* red blood cells */}
        {CELLS.map((c, i) => (
          <g key={i} transform={`translate(${c.x} ${c.y})`}>
            <circle r={c.r} fill="url(#rbc)" />
            <ellipse rx={c.r * 0.5} ry={c.r * 0.42} fill="#d9566b" opacity="0.28" />
            {c.infected && (
              <>
                {/* the malaria parasite: a purple ring with a dark dot */}
                <circle cx="-9" cy="-6" r="11" fill="none" stroke="#6d3fc4" strokeWidth="4" />
                <circle cx="-17" cy="-11" r="4.5" fill="#4c2a9a" />
                <circle cx="14" cy="12" r="3.5" fill="#6d3fc4" opacity="0.7" />
              </>
            )}
          </g>
        ))}

        {/* the scanning line sweeping up and down */}
        <g className="scan-line">
          <rect x="0" y="130" width="400" height="70" fill="url(#scanGlow)" />
          <rect x="0" y="198" width="400" height="3" fill="#0d9488" />
        </g>
      </g>

      {/* detection box around the infected cell (red = positive only) */}
      <g className="detect-box" stroke="#e5484d" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M152 169 V147 H174 M246 147 H268 V169 M268 241 V263 H246 M174 263 H152 V241" />
      </g>

      {/* result labels */}
      <g fontFamily="inherit" fontSize="13" fontWeight="700" textAnchor="middle" fill="#ffffff">
        <rect x="146" y="114" width="138" height="26" rx="13" fill="#e5484d" />
        <text x="215" y="132">Parasitized · 0.93</text>
        <rect x="274" y="184" width="84" height="24" rx="12" fill="#16a34a" />
        <text x="316" y="201">Uninfected</text>
      </g>
    </svg>
  );
}