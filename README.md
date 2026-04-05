# Swades AI Hackathon

Local-first reliable audio chunk recording with:

- Next.js frontend
- Hono API server
- PostgreSQL for session + chunk metadata
- OPFS browser storage for zero-loss chunk buffering
- Local filesystem uploads
- Local Whisper transcription through Python

## What This Build Does

1. Records microphone or tab audio in the browser
2. Saves each finalized 15 second chunk into OPFS immediately
3. Uploads chunks to the local backend with max concurrency of 3
4. Deletes chunks from OPFS only after upload + DB ack succeed
5. Reconciles missing chunks every 15 seconds after refresh/reconnect
6. Stores uploaded chunk files on disk under `apps/server/uploads/<sessionId>/`
7. Transcribes uploaded chunks locally with Whisper
8. Rebuilds the session transcript from chunk transcripts

## Current Deployment Reality

This repo is ready for local demo use.

Frontend:
- can be deployed to Vercel

Backend:
- is **not** Vercel-ready in its current form
- depends on local filesystem persistence and local Python Whisper execution
- should be run locally or on a separate persistent server/VM

If you deploy the frontend to Vercel later, point it to a separately hosted backend.

## Requirements

Install these on your machine:

- Node.js 22+
- PostgreSQL
- Python 3.11+

Python packages:

```bash
pip install openai-whisper imageio-ffmpeg
```

## Environment Files

### Backend

Create [apps/server/.env](e:/Swades-AI-Hackathon/apps/server/.env) from [apps/server/.env.example](e:/Swades-AI-Hackathon/apps/server/.env.example)

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/my-better-t-app
CORS_ORIGIN=http://localhost:3001
PORT=3000
STORAGE_ROOT=.
PYTHON_PATH=python
WHISPER_MODEL=base
```

Notes:
- Replace `password` with your PostgreSQL password
- `WHISPER_MODEL=base` is the default local Whisper model

### Frontend

Create [apps/web/.env.local](e:/Swades-AI-Hackathon/apps/web/.env.local) from [apps/web/.env.local.example](e:/Swades-AI-Hackathon/apps/web/.env.local.example)

```env
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```

The frontend also falls back to `http://localhost:3000` automatically if this file is missing.

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create PostgreSQL database

Open `psql` and run:

```sql
CREATE DATABASE "my-better-t-app";
```

### 3. Push schema

```bash
npm run db:push
```

### 4. Start backend

```bash
npm run dev:server
```

Backend runs on:

```text
http://localhost:3000
```

### 5. Start frontend

In another terminal:

```bash
npm run dev:web
```

Frontend runs on:

```text
http://localhost:3001
```

## Mentor Demo Commands

From repo root:

```bash
npm install
pip install openai-whisper imageio-ffmpeg
```

Create:
- `apps/server/.env`
- `apps/web/.env.local`

Then run:

```bash
npm run db:push
npm run dev:server
```

In a second terminal:

```bash
npm run dev:web
```

Open:

```text
http://localhost:3001/sessions/record
```

## How To Test

### Basic recording

1. Open `/sessions/record`
2. Start recording from microphone
3. Speak for 20 to 30 seconds
4. Stop recording
5. Open the saved session
6. Confirm:
   - chunk files are listed
   - transcript text appears

### OPFS recovery

1. Start recording
2. Wait for at least one chunk
3. Kill backend
4. Keep recording for one more chunk interval
5. Restart backend
6. Wait up to 15 seconds
7. Confirm missing chunks upload automatically

### Filesystem verification

Uploaded files are written to:

```text
apps/server/uploads/<sessionId>/
```

## Important Notes

- Old broken sessions from earlier experiments may still show old errors
- Use a fresh new recording after code changes when testing
- The backend must stay running while uploads happen
- If port `3000` is already in use, kill the old process before starting a new backend

## Useful Commands

Check backend:

```bash
curl http://localhost:3000
```

Check sessions:

```bash
curl http://localhost:3000/api/sessions
```

Start frontend only:

```bash
npm run dev:web
```

Start backend only:

```bash
npm run dev:server
```

Type check:

```bash
npm run check-types
```

Build:

```bash
npm run build
```

## Git / Push

Suggested git flow:

```bash
git status
git add .
git commit -m "Build local-first reliable recording and transcription pipeline"
git push origin <your-branch>
```

## Vercel

Recommended Vercel use for this repo:

- Deploy `apps/web` only
- Set root directory to `apps/web`
- Set environment variable:

```env
NEXT_PUBLIC_SERVER_URL=https://your-backend-url
```

<img width="1919" height="941" alt="Screenshot 2026-04-05 163638" src="https://github.com/user-attachments/assets/b43668f7-c79a-47f9-b067-14894dd8a73c" />

<img width="1903" height="938" alt="image" src="https://github.com/user-attachments/assets/b351c6c7-684d-47ac-a6dc-7ab081f3cf5d" />

<img width="1919" height="942" alt="Screenshot 2026-04-05 163648" src="https://github.com/user-attachments/assets/f33115ba-7b6f-4d6e-9c34-b10151481fff" />


