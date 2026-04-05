import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { getServerUrlFromServer } from "../../lib/server-url";
import type { SessionRecord } from "../../lib/session-api";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClasses(status: SessionRecord["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "processing":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "failed":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    default:
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
}

async function getSessions(): Promise<{
  error: string | null;
  sessions: SessionRecord[];
}> {
  try {
    const response = await fetch(`${getServerUrlFromServer()}/api/sessions`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        error: "Backend is not reachable yet. Start the server to load saved sessions.",
        sessions: [],
      };
    }

    const payload = (await response.json()) as { sessions: SessionRecord[] };
    return {
      error: null,
      sessions: payload.sessions,
    };
  } catch {
    return {
      error: "Backend is not running on http://localhost:3000 yet. Start the server to load sessions.",
      sessions: [],
    };
  }
}

export default async function SessionsPage() {
  const { error, sessions } = await getSessions();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Recording sessions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse locally uploaded recording sessions and inspect the chunk files acknowledged by the server.
          </p>
        </div>
        <Link
          href="/sessions/record"
          className="rounded-full border border-border/60 px-4 py-2 text-sm font-medium transition hover:bg-muted"
        >
          New recording
        </Link>
      </div>

      <div className="grid gap-4">
        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Backend not running</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <Card className="transition hover:border-border hover:bg-muted/10">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <CardTitle>{session.title}</CardTitle>
                    <CardDescription>
                      {formatDate(session.createdAt)} · {session.sourceType === "mic" ? "Microphone" : "Tab audio"}
                    </CardDescription>
                  </div>
                  <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(session.status)}`}>
                    {session.status}
                  </span>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem]">
                  <p className="line-clamp-3 text-sm leading-7 text-muted-foreground">
                    {session.transcript || `Session id: ${session.id}`}
                  </p>
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm leading-7">
                    {session.transcript
                      ? "Transcript is being assembled locally from the uploaded chunks."
                      : `Local upload bucket: /uploads/${session.id}`}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        ) : !error ? (
          <Card>
            <CardHeader>
              <CardTitle>No sessions yet</CardTitle>
              <CardDescription>Start a recording to create the first local chunk upload session.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
