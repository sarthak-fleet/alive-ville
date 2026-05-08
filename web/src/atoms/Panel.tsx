import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export function Panel({ title, children }: Props) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
