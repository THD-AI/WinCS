"""Transcribe meeting recordings with speaker labels through the OpenAI API.

Audio and raw API responses stay outside Git (default: tmp/transcripts/).
Re-running skips chunks whose raw response already exists.

    python scripts/transcribe_recordings.py "C:/path/GameJam.m4a" --id A11
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "gpt-4o-transcribe-diarize"
CHUNK_SECONDS = 600


def load_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("OPENAI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("OPENAI_API_KEY missing (environment or .env)")


def duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    )
    return float(out)


def make_chunks(src: Path, work: Path) -> list[tuple[Path, float]]:
    total = duration(src)
    chunks = []
    start = 0.0
    index = 0
    while start < total - 1:
        out = work / f"chunk-{index:02d}.mp3"
        if not out.exists():
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(CHUNK_SECONDS), "-i", str(src),
                 "-ac", "1", "-ar", "16000", "-b:a", "48k", str(out)],
                check=True,
            )
        chunks.append((out, start))
        start += CHUNK_SECONDS
        index += 1
    return chunks


def post(path: Path, key: str) -> dict:
    boundary = uuid.uuid4().hex
    fields = {"model": MODEL, "response_format": "diarized_json", "chunking_strategy": "auto"}
    body = b""
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    body += (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        "Content-Type: audio/mpeg\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return json.load(response)


def render(segments_file: Path, page: Path, speakers: dict[str, str]) -> None:
    """Replace the page's '## Transcript' section with speaker turns and timestamps."""
    data = json.loads(segments_file.read_text(encoding="utf-8"))
    turns: list[list] = []
    for seg in data["segments"]:
        if not seg["text"].strip():
            continue
        who = speakers.get(seg["speaker"], speakers.get(seg["speaker"].split(":")[-1], seg["speaker"]))
        if turns and turns[-1][1] == who:
            turns[-1][2].append(seg["text"])
        else:
            turns.append([seg["start"], who, [seg["text"]]])
    lines = []
    for start, who, texts in turns:
        lines.append(f"**{int(start // 60)}:{int(start % 60):02d} · {who}:** {' '.join(texts)}\n")
    text = page.read_text(encoding="utf-8")
    head, _, rest = text.partition("## Transcript")
    tail = rest[rest.find("\n<!-- nav:start"):] if "<!-- nav:start" in rest else ""
    note = (f"Speaker-labelled with `{data['model']}`. Labels: "
            + ", ".join(f"{k} = {v}" for k, v in speakers.items()) + ".\n\n")
    page.write_text(head + "## Transcript\n\n" + note + "\n".join(lines) + tail, encoding="utf-8", newline="\n")
    print(f"{page.name}: {len(turns)} speaker turns")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--id", required=True)
    parser.add_argument("--out", type=Path, default=ROOT / "tmp" / "transcripts")
    parser.add_argument("--render", metavar="A=Alexander,B=Lex",
                        help="write the labelled transcript into docs/meetings/transcripts/<id>.md")
    args = parser.parse_args()
    if args.render:
        speakers = dict(pair.split("=", 1) for pair in args.render.split(","))
        render(args.out / args.id / "segments.json",
               ROOT / "docs" / "meetings" / "transcripts" / f"{args.id}.md", speakers)
        return

    work = args.out / args.id
    work.mkdir(parents=True, exist_ok=True)
    key = load_key()
    segments = []
    for chunk, offset in make_chunks(args.audio, work):
        raw = chunk.with_suffix(".json")
        if not raw.exists():
            print(f"{args.id}: transcribing {chunk.name}", flush=True)
            raw.write_text(json.dumps(post(chunk, key), ensure_ascii=False, indent=1), encoding="utf-8")
        data = json.loads(raw.read_text(encoding="utf-8"))
        part = chunk.stem.split("-")[1]
        for seg in data.get("segments", []):
            segments.append({
                "start": round(seg["start"] + offset, 2),
                "end": round(seg["end"] + offset, 2),
                # Diarization labels are only consistent inside one chunk.
                "speaker": f"{part}:{seg.get('speaker', '?')}",
                "text": seg["text"].strip(),
            })
    sha = hashlib.sha256(args.audio.read_bytes()).hexdigest()
    result = {"id": args.id, "source": args.audio.name, "source_sha256": sha, "model": MODEL,
              "duration_seconds": duration(args.audio), "segments": segments}
    (work / "segments.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{args.id}: {len(segments)} segments -> {work / 'segments.json'}")


if __name__ == "__main__":
    main()
