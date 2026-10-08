# MuseDash Like PV Renderer

## 中文

一套在本地桌面浏览器中运行的工具，用手绘 PNG 序列制作类 Muse Dash 的节奏 PV。制谱器与渲染器分为两个网页，通过 JSON 谱面衔接，音符高度由人工编排。

- **制谱器（Contour）**：在时间与高度组成的二维画布上编辑音符，提供音乐波形、BPM 与 offset 校准、网格吸附和区间循环试听，支持谱面导入与导出。
- **PV 渲染器**：读取谱面、音乐和图片，支持全部击打与全部 Miss 两种模式。击打模式按高度变化选择攻击动作；Miss 模式使用单张立绘做正弦浮动。两种模式各自保存渲染参数，怪物外观由谱面 seed 和音符 ID 分配。素材窗口可调整整组动画的锚点、缩放、旋转和裁剪；支持正常运动和独立帧率的全局抽帧。

渲染器可调整分辨率与纵横比，直接导出含音乐的 MP4 或 PNG 序列。“保存工程”将两套渲染参数、谱面、原始音乐、图片和素材校正打包到单个 JSON，打开即可恢复。网页不内置个人素材，根目录 `src/` 不随仓库分发。制谱器支持框选批量删除，暂不支持撤销、移动、复制或自动节拍分析。

启动及操作见[制谱器说明](software/chart-editor/README.md)和[渲染器说明](software/renderer/README.md)。素材校准见[动画导入器说明](software/animation-importer/README.md)，功能范围与后续工作见[实现计划](docs/MVP_IMPLEMENTATION_PLAN.md)。

## English

Local browser tools for making Muse Dash-style rhythm PVs from hand-drawn PNG sequences. The chart editor and renderer are separate web apps linked by JSON charts, with note heights placed manually.

- **Chart editor (Contour)**: Edit notes on a time-and-height canvas, with audio waveforms, BPM and offset adjustment, grid snapping, looped playback, and JSON import and export.
- **PV renderer**: Load a chart, music, and images for all-hit or all-miss playback. All-hit playback selects attacks based on height changes; all-miss uses a single portrait with sinusoidal vertical motion. Each mode retains its own renderer settings. The chart seed and note IDs determine monster appearances. An integrated asset window adjusts anchors, scale, rotation, and cropping for each animation group. Choose smooth motion or global frame sampling at an independent rate.

The renderer supports configurable resolution and aspect ratio, MP4 export with audio, and PNG sequences. A single project JSON contains both mode settings, the chart, original audio, images, and asset calibration. Personal assets are not bundled with the web app; the root `src/` directory is excluded from the repository. The chart editor supports selection and batch deletion, but not undo, moving or copying notes, or automatic beat analysis.

See the [chart editor guide](software/chart-editor/README.md) and [renderer guide](software/renderer/README.md) for setup and usage. The [asset importer guide](software/animation-importer/README.md) covers calibration, and the [implementation plan](docs/MVP_IMPLEMENTATION_PLAN.md) describes the current scope and future work. These guides are in Chinese.
