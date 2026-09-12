# webCut

纯浏览器本地处理的轻量音视频剪辑器。

## V0.1

- 本地导入视频 / 音频，媒体文件不上传到网页服务器
- 视频预览、时间轴、音频波形
- 设置入点 / 出点、分割、删除、撤销
- 浏览器本地 FFmpeg.wasm 导出
- 导出 MP4 / WebM / MP3 / WAV / FLAC / M4A
- Qwen ASR：自定义 API 地址、Bearer Token、上传字段名
- 字幕编辑与 SRT 导出
- 视频人工分类，分类保存在浏览器 localStorage
- 故事板：按时间间隔抽帧导览
- 逐帧查看：按 FPS 上一帧 / 下一帧
- 多文件素材切换

> 网页服务器只负责 HTML/CSS/JS。剪辑、抽帧、转码、导出均在浏览器本地完成；只有点击 Qwen ASR 时，浏览器提取的 WAV 会发送到配置的 ASR API。

## 运行

推荐 Chrome / Edge 最新版。不要直接双击 HTML，使用静态 HTTP 服务：

```bash
python -m http.server 8080
```

打开：

```text
http://127.0.0.1:8080
```

## Qwen ASR 接口

默认 `multipart/form-data` 上传，字段名默认 `file`，上传内容为当前媒体在浏览器本地提取的 `16kHz mono WAV`。

支持常见返回：

```json
{
  "text": "你好，这是测试。",
  "segments": [
    {"start": 0.0, "end": 1.2, "text": "你好"},
    {"start": 1.2, "end": 2.8, "text": "这是测试"}
  ]
}
```

也会尝试兼容 `data.text`、`result.text`、`chunks` 和 `words`。ASR 服务必须允许网页跨域访问（CORS）。

## FFmpeg.wasm

首次导出或 ASR 提取音频时，会从公共 CDN 加载 FFmpeg.wasm 核心文件。后续可把 core JS/WASM 放到仓库内，改成完全离线部署。

## 快捷键

- `Space`：播放 / 暂停
- `← / →`：上一帧 / 下一帧
- `I`：设置入点
- `O`：设置出点
- `S`：播放头分割
- `Delete`：删除选中片段

## V0.1 已知限制

当前“逐帧”按 `currentTime ± 1/fps` 实现。对于长 GOP / VFR 视频不保证严格命中每个解码帧；下一版可用 WebCodecs + demuxer 做真正帧级定位。
