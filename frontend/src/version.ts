export function appVersion(prId?: string, msg?: string): string {
  if (prId && /^\d+$/.test(prId)) return `v1.${prId}`;
  const m = msg?.match(/Merge pull request #(\d+)/) ?? msg?.match(/\(#(\d+)\)\s*$/m);
  return m?.[1] ? `v1.${m[1]}` : "v1.dev";
}
export const APP_VERSION = appVersion(
  import.meta.env.VERCEL_GIT_PULL_REQUEST_ID,
  import.meta.env.VERCEL_GIT_COMMIT_MESSAGE,
);
