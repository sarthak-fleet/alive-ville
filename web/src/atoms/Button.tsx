import type { ButtonHTMLAttributes, ReactNode } from "react";

import { playClickCue } from "../audio.ts";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary";
  children: ReactNode;
}

export function Button({ variant = "default", className, onClick, ...rest }: Props) {
  const cls = [variant === "primary" ? "primary" : "", className].filter(Boolean).join(" ");

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playClickCue();
    onClick?.(e);
  };

  return <button className={cls} onClick={handleClick} {...rest} />;
}
