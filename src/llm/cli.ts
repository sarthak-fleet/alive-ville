/**
 * Local CLI backend: run NPC brains through `claude` (Claude Code) or
 * `codex` in non-interactive print mode. Node-only — the dev server sets
 * LLM_CLI=claude|codex; the Workers build never enters this path.
 */

export type CliBackend = 'claude' | 'codex';

export function cliBackend(): CliBackend | null {
  const value = process.env['LLM_CLI'];
  return value === 'claude' || value === 'codex' ? value : null;
}

const CLI_TIMEOUT_MS = 120_000;

export async function cliComplete(prompt: string): Promise<{ text?: string; error?: string }> {
  const backend = cliBackend();
  if (!backend) return { error: 'LLM_CLI not configured' };
  const { spawn } = await import('node:child_process');
  const { readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  // codex echoes the whole session to stdout; the agent's reply lands here
  const lastMessageFile = join(
    tmpdir(),
    `aliveville-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  const [command, args]: [string, string[]] =
    backend === 'claude'
      ? ['claude', ['-p', '--output-format', 'text', '--max-turns', '1']]
      : ['codex', ['exec', '--skip-git-repo-check', '--output-last-message', lastMessageFile, '-']];

  return new Promise((resolve) => {
    const finish = async (result: { text?: string; error?: string }) => {
      if (backend === 'codex') {
        try {
          const last = (await readFile(lastMessageFile, 'utf8')).trim();
          if (last) result = { text: last };
        } catch {
          // fall through with whatever we have
        }
        void rm(lastMessageFile, { force: true });
      }
      resolve(result);
    };

    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      void finish({ error: `${backend} timed out after ${CLI_TIMEOUT_MS / 1000}s` });
    }, CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      void finish({ error: `${backend} failed to start: ${error.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (code !== 0 && !text)
        void finish({ error: `${backend} exited ${code}: ${stderr.slice(0, 200)}` });
      else if (!text) void finish({ error: `${backend} returned no output` });
      else void finish({ text });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
