interface Props { score: number; }

export function RelationCell({ score }: Props) {
  const cls = score > 0 ? "pos" : score < 0 ? "neg" : "";
  return <span className={cls}>{score}</span>;
}
