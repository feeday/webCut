# webCut V0.6.4
![webCut 界面](https://raw.githubusercontent.com/feeday/webCut/main/2.png)

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
- Windows 网页版 / CentOS 网页版 / Windows EXE 桌面版

## Windows 网页版

需要 Python 3，双击：

```text
启动-webCut.bat
```

默认打开：

```text
http://127.0.0.1:18080/
```

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

生成的 Windows 安装程序位于：

```text
desktop/src-tauri/target/release/bundle/nsis/
```

> 当前 EXE 版仍使用 FFmpeg.wasm，因此主要优势是无需 Python / 浏览器启动脚本、使用体验更像原生软件。后续可将 FFmpeg.wasm 替换为原生 ffmpeg.exe 以进一步提升大视频导出性能。

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
webCut-windows-x64-setup.exe
webCut-web.zip
```

如果推送版本 Tag，例如：

```bash
git tag v0.6.4
git push origin v0.6.4
```

GitHub Actions 会自动构建，并把：

```text
webCut-windows-x64-setup.exe
webCut-web.zip
```

自动上传到对应 GitHub Release。

## 仓库结构

```text
index.html                 网页主页面
style.css                  页面样式
app-v062.js                核心编辑逻辑
app-v064-loader.js         V0.6.4 启动与状态桥接
image-layers-v063.js       多图片时间轴图层显示
image-controls-v064.js     图片拖动 / 缩放 / 图层顺序控制
ffmpeg-worker.js           FFmpeg Worker 入口
file-protocol-guard.js     file:// 模式保护
server.py                  Windows / Linux 静态服务器
启动-webCut.bat            Windows 网页版启动脚本
start-centos.sh            CentOS / Linux 启动脚本
desktop/                   Tauri Windows 桌面版
.github/workflows/         GitHub Actions 自动打包
```

## Qwen ASR

默认使用 `multipart/form-data`，字段名默认 `file`。可配置：

- API 地址
- Bearer Token
- 文件字段名

ASR 服务需允许网页跨域访问（CORS）。

## FFmpeg.wasm

首次生成视频波形、导出或 ASR 音频处理时，会从公共 CDN 加载 FFmpeg.wasm 相关资源，因此第一次使用需要网络连接。

## 快捷键

- `Space`：播放 / 暂停
- `← / →`：逐帧
- `S`：播放头分割
- `Delete`：删除选中片段
- `Ctrl + 鼠标滚轮`：缩放时间轴
