"""Standalone synthetic FFmpeg smoke test: no application, database, credentials or network."""
import json
import subprocess
import tempfile
from pathlib import Path


def run(*args: str) -> bytes:
    """Bound every subprocess and fail with an actionable local diagnostic."""
    return subprocess.run(args, check=True, capture_output=True, timeout=60).stdout


def main() -> None:
    """Validate source audio + edited video remux using the production command semantics."""
    with tempfile.TemporaryDirectory(prefix='jellyfish-audio-smoke-') as directory:
        root = Path(directory)
        source, edited, output = (str(root / name) for name in ('source.mp4', 'edited.mp4', 'output.mp4'))
        run('ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x720:r=24',
            '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3',
            '-c:v', 'libx264', '-threads', '1', '-c:a', 'aac', source)
        run('ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=1280x720:r=24',
            '-t', '3', '-c:v', 'libx264', '-threads', '1', edited)
        run('ffmpeg', '-nostdin', '-v', 'error', '-i', edited, '-i', source,
            '-map', '0:v:0', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', output)
        info = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', output))
        video = [s for s in info['streams'] if s['codec_type'] == 'video']
        audio = [s for s in info['streams'] if s['codec_type'] == 'audio']
        assert len(video) == len(audio) == 1
        assert video[0]['width'] == 1280 and video[0]['height'] == 720
        assert abs(float(info['format']['duration']) - 3) < 0.1
        assert audio[0]['codec_name'] == 'aac'
        print(json.dumps({'passed': True, 'duration_seconds': float(info['format']['duration']),
            'video': '1280x720', 'audio': 'aac', 'scope': 'synthetic ffmpeg command, not paid model output'}))


if __name__ == '__main__':
    main()
