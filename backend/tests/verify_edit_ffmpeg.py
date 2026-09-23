"""在无网络一次性容器中编码合成媒体，验证裁剪、混音时间和字幕。"""
from app.services.studio.project_visual_review import extract_review_frame
import asyncio
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile
from app.schemas.studio.timeline import ProjectEditPlan, EditAudioClip, EditVideoClip
from app.services.studio.project_video_export import _normalize_clip, _mix_edit_audio, _attach_subtitle_track, build_transition_command


def run(*args):
    """编码失败直接终止验证，stderr 保留可诊断信息。"""
    return subprocess.check_output(args, stderr=subprocess.PIPE)


async def main():
    """生成两秒静音裁剪与延时音轨，并验证时长、采样能量及软字幕。"""
    with tempfile.TemporaryDirectory(prefix="edit-fixture-") as directory:
        work = Path(directory)
        source, tone, normalized, mixed, final = [work / name for name in ("source.mp4", "tone.wav", "clip.mp4", "mixed.mp4", "final.mp4")]
        run("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=25:duration=4", "-c:v", "libx264", str(source))
        run("ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=800:duration=1:sample_rate=48000", str(tone))
        await _normalize_clip(ffmpeg="ffmpeg", ffprobe="ffprobe", source=source, target=normalized,
            width=320, height=180, in_seconds=1, duration_seconds=2, volume=0)
        plan = ProjectEditPlan(audio=[EditAudioClip(id="a", file_id="tone", label="tone", start_seconds=.5, duration_seconds=1, volume=.5)])
        await _mix_edit_audio(ffmpeg="ffmpeg", video=normalized, target=mixed, plan=plan, sources=[tone])
        probe = json.loads(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(mixed)))
        assert abs(float(probe["format"]["duration"]) - 2) < .08, probe
        raw = run("ffmpeg", "-v", "error", "-i", str(mixed), "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "f32le", "-")
        samples = struct.unpack(f"{len(raw)//4}f", raw)
        def energy(start, end):
            """在稳定时间段比较能量，跳过 AAC 边界过渡。"""
            section = samples[int(start*48000):int(end*48000)]
            return math.sqrt(sum(x*x for x in section) / len(section))
        assert energy(.1,.3) < .001
        assert energy(.7,1.2) > .01
        assert energy(1.7,1.9) < .001
        subtitle = work / "captions.srt"
        subtitle.write_text("1\n00:00:00,500 --> 00:00:01,500\nConsistency check\n", encoding="utf-8")
        await _attach_subtitle_track(ffmpeg="ffmpeg", video=mixed, subtitle=subtitle, target=final)
        streams = json.loads(run("ffprobe", "-v", "error", "-show_streams", "-of", "json", str(final)))["streams"]
        assert {s["codec_type"] for s in streams} == {"video", "audio", "subtitle"}
        assert next(s for s in streams if s["codec_type"] == "subtitle")["codec_name"] == "mov_text"
        frame1, frame2 = work / 'frame1.jpg', work / 'frame2.jpg'
        await extract_review_frame('ffmpeg', source, 1, frame1)
        await extract_review_frame('ffmpeg', source, 2, frame2)
        assert frame1.stat().st_size > 1000 and frame2.stat().st_size > 1000
        assert frame1.read_bytes() != frame2.read_bytes(), 'different timestamps must select different pixels'
        # Five transition filters and mixed hard cuts must produce the predicted overlapping duration.
        for transition in ('fade', 'dissolve', 'wipeleft', 'slideright', 'fadeblack'):
            for mixed_cut in (False, True):
                clips = [EditVideoClip(id=str(i), shot_id='s', file_id='v', label='test', out_seconds=2,
                    transition=transition if i == (1 if mixed_cut else 0) else 'cut') for i in range(3)]
                transition_plan = ProjectEditPlan(clips=clips)
                transition_output = work / f'{transition}-{mixed_cut}.mp4'
                command = build_transition_command(ffmpeg='ffmpeg', sources=[normalized]*3, target=transition_output, plan=transition_plan)
                try:
                    run(*command)
                except subprocess.CalledProcessError as error:
                    raise AssertionError(error.stderr.decode()) from error
                duration = float(json.loads(run('ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(transition_output)))['format']['duration'])
                assert abs(duration - 5.6) < .09, (transition, mixed_cut, duration)
        print("PASS: five transitions, mixed cuts and duration;  real FFmpeg trim 2s, delayed mix amplitude/silence, MP4 video/audio/subtitle streams")


if __name__ == "__main__":
    asyncio.run(main())
