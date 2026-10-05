/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VERCEL_GIT_PULL_REQUEST_ID?: string;
  readonly VERCEL_GIT_COMMIT_MESSAGE?: string;
}
