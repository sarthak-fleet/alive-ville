import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onClick?: () => void;
  muted?: boolean;
  title?: string;
}

export function Chip({ children, onClick, muted, title }: Props) {
  return (
    <span
      className={`chip${muted ? " muted" : ""}`}
      onClick={onClick}
      title={title}
      role={onClick ? "button" : undefined}
    >
      {children}
    </span>
  );
}
