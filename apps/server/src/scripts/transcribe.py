import argparse
import contextlib
import io
import json
import os
import shutil
import sys
import traceback
from pathlib import Path


def ensure_ffmpeg() -> tuple[bool, str | None]:
    try:
        import imageio_ffmpeg

        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_source = Path(ffmpeg_path)
        ffmpeg_dir = ffmpeg_source.parent
        ffmpeg_alias = ffmpeg_dir / "ffmpeg.exe"

        if ffmpeg_source.name.lower() != "ffmpeg.exe" and not ffmpeg_alias.exists():
            shutil.copyfile(ffmpeg_source, ffmpeg_alias)

        current_path = os.environ.get("PATH", "")
        ffmpeg_dir_string = str(ffmpeg_dir)
        if ffmpeg_dir_string not in current_path.split(os.pathsep):
            os.environ["PATH"] = ffmpeg_dir_string + os.pathsep + current_path

        os.environ["IMAGEIO_FFMPEG_EXE"] = str(ffmpeg_alias if ffmpeg_alias.exists() else ffmpeg_source)
        return True, str(ffmpeg_alias if ffmpeg_alias.exists() else ffmpeg_source)
    except Exception:
        return False, None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    try:
        import whisper
    except Exception as error:
        print(
            json.dumps(
                {
                    "error": f"Whisper is not installed. Run: pip install openai-whisper. {error}",
                    "ok": False,
                }
            )
        )
        return 0

    ffmpeg_ready, ffmpeg_path = ensure_ffmpeg()
    if not ffmpeg_ready or not ffmpeg_path:
        print(
            json.dumps(
                {
                    "error": "FFmpeg is not available in PATH. Install it or run: pip install imageio-ffmpeg",
                    "ok": False,
                }
            )
        )
        return 0

    stderr_buffer = io.StringIO()
    with contextlib.redirect_stderr(stderr_buffer):
        try:
            model = whisper.load_model(args.model)
            result = model.transcribe(args.file, fp16=False)
        except FileNotFoundError as error:
            buffered = stderr_buffer.getvalue().strip()
            message = "FFmpeg executable not found. Install FFmpeg or run: pip install imageio-ffmpeg"
            if buffered:
                message = f"{message} {buffered}"
            print(
                json.dumps(
                    {
                        "error": f"{message} {error}",
                        "ok": False,
                    }
                )
            )
            return 0
        except Exception as error:
            buffered = stderr_buffer.getvalue().strip()
            message = "Whisper transcription failed."
            if buffered:
                message = f"{message} {buffered}"
            print(
                json.dumps(
                    {
                        "error": f"{message} {error}\n{traceback.format_exc()}",
                        "ok": False,
                    }
                )
            )
            return 0

    text = (result.get("text") or "").strip()
    print(json.dumps({"ok": True, "text": text}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
