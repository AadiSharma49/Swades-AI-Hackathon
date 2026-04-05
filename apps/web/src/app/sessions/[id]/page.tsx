import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { getServerUrlFromServer } from "../../../lib/server-url";
import type { SessionDetail } from "../../../lib/session-api";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function getSession(id: string): Promise<{
  error: string | null;
  session: SessionDetail | null;
}> {
  try {
    const response = await fetch(`${getServerUrlFromServer()}/api/sessions/${id}`, {
      cache: "no-store",
    });

    if (response.status === 404) {
      return {
        error: "Session not found.",
        session: null,
      };
    }

    if (!response.ok) {
      return {
        error: "Backend is not reachable yet. Start the server to load session details.",
        session: null,
      };
    }

    return {
      error: null,
      session: (await response.json()) as SessionDetail,
    };
  } catch {
    return {
      error: "Backend is not running on http://localhost:3000 yet. Start the server to load this session.",
      session: null,
    };
  }
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { error, session } = await getSession(id);

  if (!session) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Session unavailable</CardTitle>
            <CardDescription>{error ?? "This session could not be loaded."}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Link href="/sessions" className="rounded-full border border-border/60 px-4 py-2 text-sm font-medium transition hover:bg-muted">
                Back to sessions
              </Link>
              <Link href="/sessions/record" className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90">
                Start recording
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{session.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Created {formatDate(session.createdAt)} · {session.sourceType === "mic" ? "Microphone" : "Tab audio"} · {session.status}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sessions" className="rounded-full border border-border/60 px-4 py-2 text-sm font-medium transition hover:bg-muted">
            All sessions
          </Link>
          <Link href="/sessions/record" className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90">
            Start new recording
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Session details</CardTitle>
            <CardDescription>Persistent metadata for this local recording session.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="min-h-[24rem] rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm leading-7">
              <p>Session id: <span className="font-mono">{session.id}</span></p>
              <p>Title: {session.title}</p>
              <p>Created: {formatDate(session.createdAt)}</p>
              <p>Source: {session.sourceType === "mic" ? "Microphone" : "Tab audio"}</p>
              <p>Status: {session.status}</p>
              <p>Upload directory: <span className="font-mono">/uploads/{session.id}</span></p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Transcript</CardTitle>
              <CardDescription>Local Whisper transcription built from the uploaded chunks.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="min-h-40 rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm leading-7">
                {session.transcript || "Transcript is still processing. Install Whisper and wait for the chunk transcription worker to finish."}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Uploaded chunks</CardTitle>
              <CardDescription>{session.chunks.length} chunk files acknowledged for this session.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto">
                {session.chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {chunk.chunkId} · {chunk.filename}
                    </div>
                    <p className="mt-2 text-sm leading-7">Status: {chunk.status}</p>
                    <p className="text-sm leading-7 text-muted-foreground">Mime type: {chunk.mimeType}</p>
                    <p className="text-sm leading-7 text-muted-foreground">Size: {chunk.sizeBytes} bytes</p>
                    <p className="text-sm leading-7">{chunk.transcriptText || "Transcription pending for this chunk."}</p>
                    {chunk.transcriptError ? (
                      <p className="text-sm leading-7 text-destructive">Transcription error: {chunk.transcriptError}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
