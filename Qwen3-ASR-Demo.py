import os
import re
import tempfile
from pathlib import Path

import gradio as gr
from gradio_client import Client, handle_file
# pip install gradio gradio_client
# https://huggingface.co/settings/tokens

SPACE_ID = "Qwen/Qwen3-ASR"


LANGUAGES = [
    "Auto",
    "Chinese",
    "Cantonese",
    "English",
    "Japanese",
    "Korean",
    "Arabic",
    "German",
    "French",
    "Spanish",
    "Portuguese",
    "Indonesian",
    "Italian",
    "Russian",
    "Thai",
    "Vietnamese",
    "Turkish",
    "Hindi",
    "Malay",
    "Dutch",
    "Swedish",
    "Danish",
    "Finnish",
    "Polish",
    "Czech",
    "Filipino",
    "Persian",
    "Greek",
    "Romanian",
    "Hungarian",
    "Macedonian",
]


def srt_time(seconds):
    seconds = max(0, float(seconds))

    ms = int(round(seconds * 1000))

    h = ms // 3600000
    ms %= 3600000

    m = ms // 60000
    ms %= 60000

    s = ms // 1000
    ms %= 1000

    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def is_cjk(text):
    return bool(
        re.search(
            r"[\u3400-\u9fff"
            r"\u3040-\u30ff"
            r"\uac00-\ud7af]",
            text,
        )
    )


def merge_text(old, new):
    old = old or ""
    new = new or ""

    if not old:
        return new

    if not new:
        return old

    # 中文、日文、韩文通常不插入空格
    if is_cjk(old[-1:]) or is_cjk(new[:1]):
        return old + new

    # 标点前不加空格
    if re.match(r"^[,.;:!?，。！？；：、…]", new):
        return old + new

    # 撇号等英文情况
    if new.startswith(("'", "’")):
        return old + new

    return old + " " + new


def timestamps_to_segments(
    timestamps,
    max_chars=28,
    max_duration=6.0,
):
    """
    将词/字级时间戳合并成适合 SRT 的字幕段。
    """

    if not timestamps:
        return []

    segments = []

    current_text = ""
    start = None
    end = None

    punctuation = (
        "。！？!?"
        "；;"
        "\n"
    )

    for item in timestamps:
        text = str(item.get("text", "")).strip()

        if not text:
            continue

        ts_start = float(item.get("start_time", 0) or 0)
        ts_end = float(item.get("end_time", ts_start) or ts_start)

        if start is None:
            start = ts_start

        end = ts_end
        current_text = merge_text(current_text, text)

        duration = end - start

        should_split = False

        if len(current_text) >= max_chars:
            should_split = True

        if duration >= max_duration:
            should_split = True

        if current_text.endswith(punctuation):
            should_split = True

        if should_split:
            segments.append(
                {
                    "start": start,
                    "end": end,
                    "text": current_text.strip(),
                }
            )

            current_text = ""
            start = None
            end = None

    if current_text and start is not None:
        segments.append(
            {
                "start": start,
                "end": end,
                "text": current_text.strip(),
            }
        )

    return segments


def segments_to_srt(segments):
    result = []

    for i, seg in enumerate(segments, 1):
        result.append(str(i))

        result.append(
            f"{srt_time(seg['start'])} --> "
            f"{srt_time(seg['end'])}"
        )

        result.append(seg["text"])
        result.append("")

    return "\n".join(result)


def recognize(
    audio_file,
    hf_token,
    language,
    max_chars,
    max_duration,
):
    if not audio_file:
        raise gr.Error("请先上传音频。")

    token = (hf_token or "").strip()

    try:
        if token:
            client = Client(
                SPACE_ID,
                token=token,
            )
        else:
            client = Client(SPACE_ID)

        result = client.predict(
            audio_upload=handle_file(audio_file),
            lang_disp=language,
            return_ts=True,
            api_name="/transcribe",
        )

    except Exception as e:
        raise gr.Error(
            f"调用 Qwen3-ASR 失败：\n{e}"
        )

    if not isinstance(result, (list, tuple)):
        raise gr.Error(
            f"接口返回格式异常：{type(result)}"
        )

    detected_language = ""
    text = ""
    timestamps = None

    if len(result) >= 1:
        detected_language = result[0] or ""

    if len(result) >= 2:
        text = result[1] or ""

    if len(result) >= 3:
        timestamps = result[2]

    if not timestamps:
        raise gr.Error(
            "识别成功，但接口没有返回时间戳，"
            "因此暂时无法生成准确 SRT。"
        )

    segments = timestamps_to_segments(
        timestamps,
        max_chars=int(max_chars),
        max_duration=float(max_duration),
    )

    srt_content = segments_to_srt(segments)

    # 输出文件
    audio_path = Path(audio_file)

    out_dir = Path(tempfile.gettempdir()) / "qwen3_asr_srt"
    out_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    srt_path = out_dir / f"{audio_path.stem}.srt"

    srt_path.write_text(
        srt_content,
        encoding="utf-8-sig",
    )

    return (
        detected_language,
        text,
        srt_content,
        str(srt_path),
    )


with gr.Blocks(
    title="Qwen3-ASR SRT 字幕工具"
) as demo:

    gr.Markdown(
        """
# 🎤 Qwen3-ASR 字幕生成器

上传音频，调用 Qwen3-ASR 自动识别并生成 **SRT 字幕**。

- 支持自动语言检测
- 支持中文 / 英文 / 日文等
- 自动生成时间轴
- 可填写 Hugging Face Token
- 本地不运行 ASR 模型，只调用远程 Space
"""
    )

    with gr.Row():

        with gr.Column():

            audio = gr.Audio(
                label="🎤 上传音频",
                type="filepath",
                sources=["upload", "microphone"],
            )

            token = gr.Textbox(
                label="🔑 Hugging Face API Key / Token（可选）",
                placeholder="hf_xxxxxxxxxxxxxxxxx",
                type="password",
            )

            language = gr.Dropdown(
                LANGUAGES,
                value="Auto",
                label="🌍 语言",
            )

            with gr.Row():

                max_chars = gr.Slider(
                    10,
                    80,
                    value=28,
                    step=1,
                    label="每条字幕最大字符数",
                )

                max_duration = gr.Slider(
                    1,
                    15,
                    value=6,
                    step=0.5,
                    label="每条字幕最长秒数",
                )

            submit = gr.Button(
                "🚀 开始识别并生成 SRT",
                variant="primary",
            )

        with gr.Column():

            detected = gr.Textbox(
                label="🌍 检测语言"
            )

            text_result = gr.Textbox(
                label="📝 完整识别文本",
                lines=10,
            )

            srt_result = gr.Textbox(
                label="🎬 SRT 字幕",
                lines=18,
            )

            srt_file = gr.File(
                label="⬇️ 下载 SRT"
            )

    submit.click(
        recognize,
        inputs=[
            audio,
            token,
            language,
            max_chars,
            max_duration,
        ],
        outputs=[
            detected,
            text_result,
            srt_result,
            srt_file,
        ],
    )


if __name__ == "__main__":
    demo.launch(
        server_name="127.0.0.1",
        server_port=7860,
        inbrowser=True,
    )