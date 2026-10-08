# MuseDash Like PV Renderer

## 中文

一套在本地桌面浏览器中运行的工具，用手绘 PNG 序列制作类 Muse Dash 的节奏 PV。制谱器与渲染器分为两个网页，通过 JSON 谱面衔接，音符高度由人工编排。

- **制谱器（Contour）**：在时间与高度组成的二维画布上编辑音符，提供音乐波形、BPM 与 offset 校准、网格吸附和区间循环试听，支持谱面导入与导出。
- **PV 渲染器**：读取谱面、音乐和图片，支持全部击打与全部 Miss 两种模式。人物按高度变化选择攻击动作，怪物外观由谱面 seed 和音符 ID 分配。素材窗口可调整整组动画的锚点、缩放、旋转和裁剪；序列默认以 8fps 播放，空间移动保持平滑。

渲染器使用 1920×1080 逻辑画布，通过全屏播放配合外部录屏软件获取视频，尚不支持直接导出视频。谱面和渲染配置分别保存，均不包含音乐或图片；根目录 `src/` 素材不随仓库分发。制谱器暂不支持撤销、多选或自动节拍分析。

启动及操作见[制谱器说明](software/chart-editor/README.md)和[渲染器说明](software/renderer/README.md)。素材校准见[动画导入器说明](software/animation-importer/README.md)，功能范围与后续工作见[实现计划](docs/MVP_IMPLEMENTATION_PLAN.md)。

## English

Local browser tools for making Muse Dash-style rhythm PVs from hand-drawn PNG sequences. The chart editor and renderer are separate web apps linked by JSON charts, with note heights placed manually.

- **Chart editor (Contour)**: Edit notes on a time-and-height canvas, with audio waveforms, BPM and offset adjustment, grid snapping, looped playback, and JSON import and export.
- **PV renderer**: Load a chart, music, and images for all-hit or all-miss playback. The character selects attacks based on height changes; the chart seed and note IDs determine monster appearances. An integrated asset window adjusts anchors, scale, rotation, and cropping for each animation group. Frame sequences default to 8fps while movement stays smooth.

The renderer uses a 1920×1080 logical canvas and fullscreen playback for external screen recording. Direct video export is not available. Charts and renderer settings are saved separately and contain no audio or images; assets in the root `src/` directory are excluded from the repository. The editor does not yet support undo, multiple selection, or automatic beat analysis.

See the [chart editor guide](software/chart-editor/README.md) and [renderer guide](software/renderer/README.md) for setup and usage. The [asset importer guide](software/animation-importer/README.md) covers calibration, and the [implementation plan](docs/MVP_IMPLEMENTATION_PLAN.md) describes the current scope and future work. These guides are in Chinese.
