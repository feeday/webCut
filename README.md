# webCut V0.6.4

![webCut 界面](https://raw.githubusercontent.com/feeday/webCut/main/2.png)

轻量浏览器音视频剪辑器。网页服务器提供 HTML / CSS / JS 和固定目标的 Qwen Space 转发；视频、音频、图片的预览、剪辑和 FFmpeg.wasm 导出主要在访问者浏览器本地完成。只有使用 Qwen ASR 时，浏览器提取的 WAV 会通过所选连接方式发送到 ASR 服务。

源码：<https://github.com/feeday/webCut>

## 当前功能

- 横屏 / 竖屏视频自适应预览
- 多视频顺序拼接、时长裁剪、分割、删除、撤销
- 视频画面框选裁剪、像素微调、裁剪结果预览及裁剪后导出
- 视频原声音频波形
- 独立音频轨与纯音频工程
- 多图片图层覆盖
- 图片在预览区直接拖动、缩放
- 图片图层置顶 / 上移 / 下移 / 置底
- 时间轴缩放、Ctrl + 滚轮缩放
- 逐帧查看
- 故事板 / 按间隔抽帧导览
- Qwen3-ASR-Demo 一键字幕识别（Hugging Face Token）及自定义 API
- SRT / VTT 字幕导入、导出、预览和双击编辑
- 浏览器本地 FFmpeg.wasm 导出
- 多种画布尺寸与 contain / cover 适配
- Windows 网页版 / CentOS 网页版 / Windows EXE 桌面版
- Windows EXE 支持“另存为”选择导出路径
- Windows 免安装 Portable EXE，双击直接运行

## Windows 网页版

需要 Python 3，双击：

```text
启动-webCut.bat
```

默认打开：

```text
http://127.0.0.1:18080/
```

如果 `18080` 端口被占用，启动器会自动尝试后续端口。

## CentOS / Linux 网页版

```bash
chmod +x start-centos.sh
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

仅本机访问：

```bash
HOST=127.0.0.1 ./start-centos.sh
```

## Windows EXE 桌面版

桌面版使用 Tauri 封装当前网页界面，不影响网页版本。

项目目录：

```text
desktop/
```

本地构建：

```bash
cd desktop
npm install
npm run build
```

构建完成后主要文件：

```text
desktop/src-tauri/target/release/webcut.exe
```

这是免安装可执行文件，可直接双击运行。

安装包位于：

```text
desktop/src-tauri/target/release/bundle/nsis/
```

### 桌面版导出

EXE 版导出时会优先弹出 Windows“另存为”窗口，可自行选择文件名和保存目录。

流程：

```text
点击导出
→ FFmpeg.wasm 转码
→ 选择保存位置
→ 分块写入磁盘
→ 显示实际保存路径
```

网页版本仍保持浏览器下载方式。

> 当前 EXE 版仍使用 FFmpeg.wasm，因此主要优势是无需 Python / 浏览器启动脚本、可直接运行、导出路径更明确。后续可将桌面版切换为原生 ffmpeg.exe / ffprobe.exe，以进一步提升大视频处理性能。

## GitHub 一键打包 EXE

仓库已经包含：

```text
.github/workflows/build-windows-exe.yml
```

操作：

1. 打开 GitHub 仓库的 `Actions`
2. 左侧选择 `Build Windows EXE`
3. 点击 `Run workflow`
4. 选择 `main`
5. 再点绿色 `Run workflow`
6. 等待构建完成
7. 打开这次 Workflow Run
8. 在页面底部 `Artifacts` 下载 `webCut-windows`

Artifact 内包含：

```text
webCut-windows-x64-portable.exe   免安装版，双击直接运行
webCut-windows-x64-setup.exe      Windows 安装版
webCut-web.zip                    网页版
```

如果推送版本 Tag，例如：

```bash
git tag v0.6.4
git push origin v0.6.4
```

GitHub Actions 会自动构建，并把以下文件上传到对应 GitHub Release：

```text
webCut-windows-x64-portable.exe
webCut-windows-x64-setup.exe
webCut-web.zip
```

## 仓库结构

```text
index.html                 网页主页面
style.css                  页面样式
app-v062.js                核心编辑逻辑
app-v064-loader.js         V0.6.4 启动与状态桥接
image-layers-v063.js       多图片时间轴图层显示
image-controls-v064.js     图片拖动 / 缩放 / 图层顺序控制
subtitle-tools.js          字幕解析、导出与 WAV 分段
subtitles.js               字幕界面与 Qwen Space 接入
desktop-save.js            桌面版另存为 / 分块保存支持
ffmpeg-worker.js           FFmpeg Worker 入口
file-protocol-guard.js     file:// 模式保护
server.py                  Windows / Linux 静态服务器
启动-webCut.bat            Windows 网页版启动脚本
start-centos.sh            CentOS / Linux 启动脚本
desktop/                   Tauri Windows 桌面版
.github/workflows/         GitHub Actions 自动打包
```

## 视频画面裁剪

1. 导入视频，在时间轴上选中需要裁剪的视频片段。
2. 点击顶部 **画面裁剪**，在视频画面上按住鼠标拖出要保留的矩形。
3. 拖动矩形内部可移动选区，拖四角可调整大小；也可以输入左边距 X、上边距 Y、宽和高。下方会显示裁剪结果预览。
4. 点击 **应用裁剪**，再点击 **导出 → 开始导出**。默认画布采用首段视频的裁剪尺寸。

- 首次打开（或点击“恢复完整画面”后）可以直接从画面任意位置拖框；已有选区时，可从框外重新绘制。
- 裁剪作用于当前视频片段，分割片段时继承裁剪设置。多个片段可分别裁剪；合成时统一到导出画布尺寸。
- 点击“恢复完整画面”后再应用可取消裁剪，也可用“撤销”恢复上一状态。直接关闭窗口或点“取消”不会修改工程。
- 为兼容视频编码，裁剪坐标和尺寸自动对齐为偶数像素，最小 2×2。选择精确尺寸后可在字段中核对。
- 主剪辑预览仍显示原始视频，裁剪窗口下方预览为实际保留区域。属性中的文件名会标注已裁剪尺寸。
- 导出时先裁剪各视频源画面，再缩放 / 补边、叠加图片图层；音频保持原有时间轴。图片图层不会随源视频一起裁掉。
- 裁剪视频必须重新编码，即使选择“保持原格式”也不会直接输出未裁剪的原文件。若更改导出画布或选择铺满，最终尺寸和画面取舍以导出设置为准。

## Qwen ASR 与字幕

1. 打开视频或音频，完成时间轴剪辑。
2. 点击顶部 **Qwen ASR**，默认服务为 `Qwen/Qwen3-ASR-Demo`，不需要填写接口地址。
3. Key 填写 **Hugging Face Token（`hf_…`）**；公共 Space 可以尝试留空。Token 可在 <https://huggingface.co/settings/tokens> 创建。这不是阿里云百炼的 `sk-…` Key。
4. 选择语言，可填写人名、术语等上下文，并选择是否规范化数字。
5. 点击 **开始识别**。网页先在本机按时间轴提取裁剪、混合后的 16 kHz 单声道 WAV，再分段上传至该 Space。
6. 完成后在字幕轨双击字幕块，修改文字、开始时间和结束时间。右侧可导入或导出 **SRT / VTT**。

**时间精度：**该 Space 的 `/asr_inference` 只返回文字和语言，不返回逐字或逐句时间戳。此版本默认每 8 秒识别一次，每段生成一条字幕；时间是分段估算，分段边界也可能截断语音，需要人工校对。每段时长可设为 2–30 秒。自定义 API 若提供 `segments` / `chunks` / `words`，会使用其时间戳（单位：秒）。

**Key 与服务限制：**Key 只保存在当前页面内存中，刷新后重新填写。保存设置不会保存 Key，并会移除旧版设置里持久化的 Token。公共 Demo 的上游阿里云 Key 由 Space 管理者配置，填写个人 HF Token 不会替换它，也不保证绕过服务额度、排队、停机或网络限制。服务失败、取消或识别期间工程发生变化时，不会覆盖当前字幕。关闭识别窗口会取消任务；已经上传的音频无法撤回。单段识别超过 3 分钟会终止等待。

字幕导入要求 UTF-8 编码，支持 SRT / WebVTT 多行文字；文件最大 5 MB，导入时替换现有字幕。无效时间或空文字会报错，不会部分覆盖；替换、编辑、删除均可撤销。VTT 的样式、布局设置不会保留。字幕会叠加在本地预览中，**视频导出暂不烧录字幕**，请单独导出 SRT / VTT。

### “Failed to fetch” 网络修复

更新**整个项目**并重启 `启动-webCut.bat` / `server.py`，浏览器按 `Ctrl+F5`。连接方式默认选择“自动”：

- Python 启动版：浏览器通过同源 `/api/qwen` 请求，由 Python 转发至固定的 Qwen Space，避免浏览器跨域限制。
- 重新构建的 EXE：使用原生网络转发，避免 WebView 跨域限制。旧 EXE 不会自动包含修复，需重新打包。
- 纯静态托管：直接请求 `https://qwen-qwen3-asr-demo.hf.space/gradio_api`，不再依赖 `esm.sh/@gradio/client` 或主站 Space 查询。仍受浏览器跨域、网络和 Space 状态限制。
- 若服务器不能访问 Space，但浏览器所在电脑可以，可手动选择“浏览器直连 Space”。

运行 Python / EXE 的电脑或服务器必须能访问上述 `hf.space` 域名。Token 不能解决网络不通。Python 转发读取系统 / 环境代理；EXE 转发支持 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量。需要代理时，使用自己的实际地址，在启动程序之前设置。例如 Windows CMD：

```bat
set HTTPS_PROXY=http://127.0.0.1:你的代理端口
python server.py
```

远程服务器转发时，提取后的分段音频和 Key 会经过该服务器，请使用自己信任的实例及 HTTPS（本机回环地址除外）。转发仅支持固定 Space 的上传、提交和取回结果接口，不接受任意目标网址、不记录 Key 或音频。取消会停止浏览器等待；已发出的上游请求可能继续执行。

错误现在会显示失败阶段。如果提示“音频提取 / FFmpeg 资源加载”，需检查 `esm.sh` / `unpkg.com` 网络，该阶段尚未调用 ASR；如果显示 HTTP 401 / 403，再检查 Token 权限；HTTP 429 为限流；HTTP 502 可能是转发端无法访问 Space。

### 自定义 API

选择“自定义 ASR API”，填写 API 地址、Bearer Token 和文件字段名（默认 `file`）。请求为 `multipart/form-data`，接口需允许网页跨域访问（CORS）。返回示例：

```json
{"segments":[{"start":0.5,"end":2.4,"text":"你好，世界"}]}
```

也接受 `{"text":"完整识别文本"}`，这种响应会生成覆盖整个音频的一条字幕。HF 模式通过 Gradio HTTP API 连接 <https://huggingface.co/spaces/Qwen/Qwen3-ASR-Demo>，无需在线加载 Gradio JavaScript 客户端或访问 Hugging Face 主站解析地址；服务器无需安装 ASR 模型。

### 开发验证

```bash
node --test tests/*.test.cjs
python -m unittest discover -s tests -p "test_*.py"
node desktop/scripts/copy-web.mjs
```

## FFmpeg.wasm

首次生成视频波形、导出或 ASR 音频处理时，会从公共 CDN 加载 FFmpeg.wasm 相关资源，因此第一次使用需要网络连接。

## 快捷键

- `Space`：播放 / 暂停
- `← / →`：逐帧
- `S`：播放头分割
- `Delete`：删除选中片段
- `Ctrl + 鼠标滚轮`：缩放时间轴

## Source

Source code: <https://github.com/feeday/webCut>
