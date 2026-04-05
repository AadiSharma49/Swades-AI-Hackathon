import { env } from "@my-better-t-app/env/web";

const DEFAULT_SERVER_URL = "http://localhost:3000";

export function getServerUrl(): string {
  return env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "");
}

export function getServerUrlFromServer(): string {
  const url = process.env.NEXT_PUBLIC_SERVER_URL ?? DEFAULT_SERVER_URL;

  return url.replace(/\/$/, "");
}
