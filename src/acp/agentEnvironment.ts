const SAFE_ENVIRONMENT_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'TERM',
  'COLORTERM',
] as const;

/** Minimal child-process environment plus names the user explicitly allows. */
export function buildAgentEnvironment(
  additionalKeys: string[],
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [...SAFE_ENVIRONMENT_KEYS, ...additionalKeys]) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && source[key] !== undefined) {
      env[key] = source[key];
    }
  }
  return env;
}
