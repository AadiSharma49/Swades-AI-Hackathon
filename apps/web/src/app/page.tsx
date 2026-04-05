"use client";

import Link from "next/link";

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <pre className="overflow-x-auto rounded-3xl border border-border/60 bg-muted/20 p-6 font-mono text-sm">{TITLE_TEXT}</pre>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-3xl border border-border/60 bg-muted/20 p-6">
          <h2 className="mb-3 text-xl font-semibold">Long-running chunk reliability</h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Capture microphone or tab audio, persist every 15 second chunk in OPFS, and upload it to the local Hono server with bounded concurrency and recovery.
          </p>
          <div className="mt-5 flex gap-3">
            <Link href="/sessions/record" className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background">
              Start recording
            </Link>
            <Link href="/sessions" className="rounded-full border border-border/60 px-4 py-2 text-sm font-medium">
              View sessions
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-border/60 bg-muted/20 p-6">
          <h2 className="mb-3 text-xl font-semibold">What this build includes</h2>
          <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
            <li>OPFS-backed chunk durability before every upload</li>
            <li>Automatic retry and reconciliation every 15 seconds</li>
            <li>Local filesystem bucket plus PostgreSQL upload acks</li>
            <li>Refresh-safe recovery for missing chunks</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
