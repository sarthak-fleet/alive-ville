import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary";
  children: ReactNode;
}

export function Button({ variant = "default", className, ...rest }: Props) {
  const cls = [variant === "primary" ? "primary" : "", className].filter(Boolean).join(" ");
  return <button className={cls} {...rest} />;
}
