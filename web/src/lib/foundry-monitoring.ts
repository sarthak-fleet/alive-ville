import { posthog } from "posthog-js";

const PROJECT_SLUG = "ai-game";
const POSTHOG_HOST = "https://us.i.posthog.com";
const MAX_STRING_LENGTH = 500;
const MAX_STACK_LENGTH = 2000;

let installed = false;

export function installBrowserMonitoring(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const apiKey = posthogApiKey();
  if (apiKey) {
    posthog.init(apiKey, {
      api_host: posthogHost(),
      person_profiles: "always",
      capture_pageview: false,
      autocapture: false,
    });
  }

  window.addEventListener("error", (event) => {
    capturePageCrash(event.error ?? event.message, "window_error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    capturePageCrash(event.reason, "unhandled_rejection");
  });
}

export function capturePageCrash(
  error: unknown,
  source: "window_error" | "unhandled_rejection",
): void {
  try {
    const normalized = normalizeError(error);
    trackEvent("foundry_page_crash", {
      route: currentRoute(),
      source,
      error_name: normalized.name,
      message: normalized.message,
      stack: normalized.stack,
    });
  } catch {
    // Monitoring is best-effort and must never create another crash path.
  }
}

export function trackEvent(event: string, properties: Record<string, unknown> = {}): void {
  posthog.capture(event, { project_id: PROJECT_SLUG, ...properties });
}

function posthogApiKey(): string | undefined {
  return (
    import.meta.env["VITE_POSTHOG_KEY"]
    ?? import.meta.env["NEXT_PUBLIC_POSTHOG_KEY"]
    ?? import.meta.env["POSTHOG_KEY"]
  );
}

function posthogHost(): string {
  return (
    import.meta.env["VITE_POSTHOG_HOST"]
    ?? import.meta.env["NEXT_PUBLIC_POSTHOG_HOST"]
    ?? import.meta.env["POSTHOG_HOST"]
    ?? POSTHOG_HOST
  );
}

function currentRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function normalizeError(error: unknown): {
  name?: string;
  message?: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: truncate(error.name, MAX_STRING_LENGTH),
      message: truncate(error.message, MAX_STRING_LENGTH),
      stack: truncate(error.stack, MAX_STACK_LENGTH),
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      name: typeof record["name"] === "string" ? truncate(record["name"], MAX_STRING_LENGTH) : undefined,
      message:
        typeof record["message"] === "string"
          ? truncate(record["message"], MAX_STRING_LENGTH)
          : truncate(String(error), MAX_STRING_LENGTH),
      stack: typeof record["stack"] === "string" ? truncate(record["stack"], MAX_STACK_LENGTH) : undefined,
    };
  }

  return { message: truncate(String(error), MAX_STRING_LENGTH) };
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return value;
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
