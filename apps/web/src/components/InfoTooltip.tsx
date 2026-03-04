import { useState } from "react";

interface Props {
  text: string;
}

export function InfoTooltip({ text }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="info-tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span className="info-tooltip-icon">i</span>
      {visible && <span className="info-tooltip-bubble">{text}</span>}
    </span>
  );
}
