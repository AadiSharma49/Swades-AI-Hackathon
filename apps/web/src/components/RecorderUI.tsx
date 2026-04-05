"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderSync, LoaderCircle, Mic, MonitorUp, ShieldCheck, Square } from "lucide-react";

import { Button } from "@my-better-t-app/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@my-better-t-app/ui/components/card";
import { Input } from "@my-better-t-app/ui/components/input";
import { Label } from "@my-better-t-app/ui/components/label";
import { useRecorder } from "../hooks/useRecorder";
import { LiveWaveform } from "./ui/live-waveform";

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "requesting-permission":
      return "Waiting for browser permission";
    case "recording":
      return "Recording in 15 second slices";
    case "stopping":
      return "Stopping recorder and flushing pending uploads";
    case "recovering":
      return "Reconciling OPFS chunks with the local server";
    case "error":
      return "Attention needed";
    default:
      return "Ready for a new local recording session";
  }
}

export function RecorderUI() {
  const {
    activeSession,
    elapsedSeconds,
    error,
    inFlightCount,
    lastUploadedChunkId,
    pendingChunkCount,
    phase,
    queuedCount,
    recoveredSessionCount,
    startRecording,
    stopRecording,
    stream,
    uploadedChunkCount,
  } = useRecorder();
  const [title, setTitle] = useState("Swades local recording session");
  const [source, setSource] = useState<"mic" | "tab">("mic");

  const isRecording = phase === "recording";
  const canStart = phase === "idle" || phase === "error";
  const canStop = phase === "recording" || phase === "stopping";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-border/60 bg-background/80">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-2xl">Reliable Local Chunk Recorder</CardTitle>
                <CardDescription>
                  Every chunk is saved into OPFS first, uploaded with max concurrency of three, and deleted only after the local server and database both acknowledge it.
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <ShieldCheck className="size-3 text-emerald-500" />
                Local-first reliability
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="session-title">Session title</Label>
                <Input
                  id="session-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Weekly planning sync"
                  disabled={!canStart}
                />
              </div>

              <div className="space-y-2">
                <Label>Audio source</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={source === "mic" ? "default" : "outline"}
                    className="justify-start gap-2"
                    disabled={!canStart}
                    onClick={() => setSource("mic")}
                  >
                    <Mic className="size-4" />
                    Microphone
                  </Button>
                  <Button
                    type="button"
                    variant={source === "tab" ? "default" : "outline"}
                    className="justify-start gap-2"
                    disabled={!canStart}
                    onClick={() => setSource("tab")}
                  >
                    <MonitorUp className="size-4" />
                    Browser tab
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-muted/20 p-4">
              <LiveWaveform
                active={isRecording}
                processing={phase === "stopping" || phase === "recovering"}
                stream={stream}
                height={110}
                barGap={2}
                barRadius={999}
                barWidth={4}
                fadeEdges
                fadeWidth={28}
                mode="static"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Elapsed</div>
                <div className="mt-2 font-mono text-2xl">{formatDuration(elapsedSeconds)}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Queued</div>
                <div className="mt-2 font-mono text-2xl">{queuedCount}</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">In Flight</div>
                <div className="mt-2 font-mono text-2xl">{inFlightCount} / 3</div>
              </div>
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Pending OPFS</div>
                <div className="mt-2 font-mono text-2xl">{pendingChunkCount}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="lg"
                className="gap-2"
                disabled={!canStart || title.trim().length === 0}
                onClick={() => startRecording({ source, title: title.trim() })}
              >
                {phase === "requesting-permission" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Mic className="size-4" />
                )}
                Start recording
              </Button>

              <Button
                type="button"
                size="lg"
                variant="destructive"
                className="gap-2"
                disabled={!canStop}
                onClick={() => stopRecording()}
              >
                {phase === "stopping" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Stop recording
              </Button>

              {activeSession ? (
                <Link
                  href={`/sessions/${activeSession.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-none border border-border bg-background px-3 text-xs font-medium transition hover:bg-muted"
                >
                  Open saved session
                </Link>
              ) : null}
            </div>

            <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Status</div>
              <div className="mt-2 text-sm font-medium">{getPhaseLabel(phase)}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Active source: <span className="font-medium text-foreground">{source === "mic" ? "Microphone" : "Tab audio"}</span>
              </div>
              {activeSession ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  Session: <span className="font-mono text-foreground">{activeSession.id}</span>
                </div>
              ) : null}
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="border-border/60 bg-background/80">
            <CardHeader>
              <CardTitle>Recovery status</CardTitle>
              <CardDescription>The client scans OPFS every 15 seconds and re-uploads anything missing from the server database.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm leading-7">
                <div className="flex items-center gap-2">
                  <FolderSync className="size-4 text-foreground" />
                  <span>{recoveredSessionCount} OPFS session folders detected locally</span>
                </div>
                <p className="text-muted-foreground">
                  Refresh the page or disconnect the server while recording. Stored chunks remain in OPFS, then reconciliation re-queues any chunk not present in the server database.
                </p>
                <p className="text-muted-foreground">
                  Uploaded chunks: <span className="font-medium text-foreground">{uploadedChunkCount}</span>
                </p>
                <p className="text-muted-foreground">
                  Last acknowledged chunk: <span className="font-mono text-foreground">{lastUploadedChunkId ?? "none yet"}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-background/80">
            <CardHeader>
              <CardTitle>Reliability guarantees</CardTitle>
              <CardDescription>This is the exact client-side contract for every chunk.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="min-h-36 rounded-2xl border border-border/50 bg-muted/20 p-4 text-sm leading-7">
                <p>1. Record a 15 second chunk with MediaRecorder.</p>
                <p>2. Persist it to OPFS immediately.</p>
                <p>3. Enqueue upload with max concurrency of 3.</p>
                <p>4. Delete from OPFS only after local file write and DB ack succeed on the server.</p>
                <p>5. Retry failures with backoff and reconcile missing chunks every 15 seconds.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
