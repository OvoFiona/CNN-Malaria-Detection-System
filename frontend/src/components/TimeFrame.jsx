import { Form } from "react-bootstrap";
import { PRESETS } from "../timeframe.js";

// A drop-down for the time period. Choosing "Custom dates..." shows two date boxes.
//   label    - small text in front, e.g. "Created"
//   value    - the range { preset, from, to } (the page keeps it)
//   onChange - called with the new range
export default function TimeFrame({ label, value, onChange }) {
  return (
    <div className="timeframe">
      <span className="timeframe-label">{label}</span>
      <Form.Select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value })}
        aria-label={label + " period"}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </Form.Select>
      {value.preset === "custom" && (
        <>
          <Form.Control
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            aria-label="From date"
          />
          <span className="text-secondary">to</span>
          <Form.Control
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            aria-label="To date"
          />
        </>
      )}
    </div>
  );
}