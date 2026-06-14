import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { completeText, proposeAction, setLlmFetch } from "../src/llm/router.ts";

function res429(): Response {
  return { ok: false, status: 429, json: async () => ({}), body: null } as unknown as Response;
}
function resOk(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    body: null,
  } as unknown as Response;
}

describe("router rate-limit breaker", () => {
  let prev: Record<string, string | undefined>;

  beforeEach(() => {
    prev = {
      key: process.env["LLM_API_KEY"],
      base: process.env["LLM_BASE_URL"],
      local: process.env["LLM_LOCAL_AI_URL"],
      force: process.env["LLM_FORCE_MODEL"],
    };
    process.env["LLM_API_KEY"] = "test-key";
    process.env["LLM_BASE_URL"] = "https://gateway.example/v1";
    delete process.env["LLM_LOCAL_AI_URL"];
    delete process.env["LLM_FORCE_MODEL"];
  });

  afterEach(() => {
    for (const [name, value] of [
      ["LLM_API_KEY", prev.key],
      ["LLM_BASE_URL", prev.base],
      ["LLM_LOCAL_AI_URL", prev.local],
      ["LLM_FORCE_MODEL", prev.force],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setLlmFetch((url, init) => fetch(url, init));
  });

  test("ambient sheds load on 429, dialogue stays ungated, a dialogue success clears it", async () => {
    let proposeCalls = 0;
    let dialogueCalls = 0;
    let mode: "429" | "ok" = "429";
    setLlmFetch(async (_url, init) => {
      const body = JSON.parse((init.body as string) ?? "{}") as { response_format?: unknown };
      const isPropose = Boolean(body.response_format); // proposeAction asks for json_object
      if (isPropose) proposeCalls += 1;
      else dialogueCalls += 1;
      return mode === "429" ? res429() : resOk('{"type":"skip"}');
    });

    // 1) first ambient call reaches the gateway, 429s, and trips the breaker
    const first = await proposeAction({ tier: "normal", system: "s", user: "u" });
    expect("error" in first && first.error).toBe("HTTP 429");
    expect(proposeCalls).toBe(1);

    // 2) next ambient call is shed WITHOUT a network call
    const shed = await proposeAction({ tier: "normal", system: "s", user: "u" });
    expect("skipped" in shed && shed.skipped).toBe(true);
    if ("skipped" in shed && shed.skipped) expect(shed.reason).toBe("rate_cooldown");
    expect(proposeCalls).toBe(1);

    // 3) dialogue is NEVER gated — it still reaches the gateway during the cooldown
    await completeText({ tier: "normal", system: "s", user: "u" });
    expect(dialogueCalls).toBe(1);

    // 4) a successful dialogue call clears the breaker...
    mode = "ok";
    const recovered = await completeText({ tier: "normal", system: "s", user: "u" });
    expect("text" in recovered).toBe(true);
    expect(dialogueCalls).toBe(2);

    // 5) ...so the ambient firehose resumes hitting the gateway
    const resumed = await proposeAction({ tier: "normal", system: "s", user: "u" });
    expect("skipped" in resumed && resumed.skipped === true && resumed.reason === "rate_cooldown").toBe(false);
    expect(proposeCalls).toBe(2);
  });
});
