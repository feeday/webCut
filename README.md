# webCut V0.6.4

轻量浏览器音视频剪辑器。网页服务器只负责提供 HTML / CSS / JS；视频、音频、图片的预览、剪辑和 FFmpeg.wasm 导出主要在访问者浏览器本地完成。只有使用 Qwen ASR 时，浏览器提取的 WAV 会发送到用户配置的 ASR API。

## 当前功能

- 横屏 / 竖屏视频自适应预览
- 多视频顺序拼接、裁剪、分割、删除、撤销
- 视频原声音频波形
- 独立音频轨与纯音频工程
- 多图片图层覆盖
- 图片在预览区直接拖动、缩放
- 图片图层置顶 / 上移 / 下移 / 置底
- 时间轴缩放、Ctrl + 滚轮缩放
- 逐帧查看
- 故事板 / 按间隔抽帧导览
- Qwen ASR 自定义 API
- 字幕与 SRT 导出
- 浏览器本地 FFmpeg.wasm 导出
- 多种画布尺寸与 contain / cover 适配

## 仓库结构

```text
index.html                 主页面
style.css                  页面样式
app-v062.js                当前核心编辑逻辑
app-v064-loader.js         V0.6.4 启动与状态桥接
image-layers-v063.js       多图片时间轴图层显示
image-controls-v064.js     图片拖动 / 缩放 / 图层顺序控制
ffmpeg-worker.js           FFmpeg Worker 入口
file-protocol-guard.js     阻止 file:// 模式误用导出
server.py                  Windows / Linux 通用静态服务器
启动-webCut.bat            Windows 启动脚本
start-centos.sh            CentOS / Linux 启动脚本
```

## Windows 启动

需要 Python 3。

直接双击：

```text
启动-webCut.bat
```

默认打开：

```text
http://127.0.0.1:18080/
```

也可以手动运行：

```bat
python server.py --host 127.0.0.1 --port 18080
```

## CentOS / Linux 启动

先确认 Python 3：

```bash
python3 --version
```

如果没有：

```bash
sudo dnf install -y python3
```

首次给脚本执行权限：

```bash
chmod +x start-centos.sh
```

启动：

```bash
./start-centos.sh
```

默认监听：

```text
0.0.0.0:18080
```

浏览器访问：

```text
http://服务器IP:18080/
```

自定义端口：

```bash
PORT=8080 ./start-centos.sh
```

只允许本机访问：

```bash
HOST=127.0.0.1 ./start-centos.sh
```

如果 CentOS 防火墙开启，对局域网 / 公网提供服务时需要放行端口，例如：

```bash
sudo firewall-cmd --permanent --add-port=18080/tcp
sudo firewall-cmd --reload
```

> 若服务器直接暴露公网，建议用 Nginx/Caddy 反向代理并启用 HTTPS，而不是长期直接暴露 Python 静态服务器。

## Qwen ASR

默认使用 `multipart/form-data`，字段名默认 `file`。可以在界面填写：

- API 地址
- Bearer Token
- 文件字段名

常见返回格式：

```json
{
  "text": "你好，这是测试。",
  "segments": [
    {"start": 0.0, "end": 1.2, "text": "你好"},
    {"start": 1.2, "end": 2.8, "text": "这是测试"}
  ]
}
```

ASR 服务需允许网页跨域访问（CORS）。

## FFmpeg.wasm

首次生成视频波形、导出或 ASR 音频处理时，会从公共 CDN 加载 FFmpeg.wasm 相关资源。因此第一次使用需要网络连接。

## 快捷键

- `Space`：播放 / 暂停
- `← / →`：逐帧
- `S`：播放头分割
- `Delete`：删除选中片段
- `Ctrl + 鼠标滚轮`：缩放时间轴

## 注意

不要直接双击 `index.html` 使用 `file://` 打开。浏览器会限制 Worker / WASM，导致 FFmpeg 导出失败。请使用 Windows 或 CentOS/Linux 启动脚本。
