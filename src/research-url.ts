import { summarizeUrl } from "./research.ts";

async function main(): Promise<void> {
  const [url, ...questionParts] = process.argv.slice(2);
  if (!url) {
    console.error("Usage: pnpm research:url <https://...> [question]");
    process.exitCode = 1;
    return;
  }

  const result = await summarizeUrl(url, { question: questionParts.join(" ") || undefined });
  console.info(JSON.stringify({
    url: result.source.url,
    title: result.source.title,
    fetchedAt: result.source.fetchedAt,
    question: result.question,
    model: result.meta.model,
    latencyMs: result.meta.latencyMs,
    summary: result.summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
