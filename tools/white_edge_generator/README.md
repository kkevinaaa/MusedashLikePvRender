# Equidistant White Edge Generator

为带透明通道的 PNG 批量生成欧氏等距白色外边缘。工具保持原画布尺寸、图像位置和目录结构，不会裁切或移动主体。

## 图形界面

运行 `dist/EquidistantWhiteEdgeGenerator.exe`，选择输入、输出文件夹并设置参数：

- **白边宽度**：基准分辨率下向外扩张的像素数，默认 12。
- **基准高度**：默认 1080。2160 像素高的输入会把 12 px 自动换算为 24 px。
- **Alpha 阈值**：Alpha 大于等于该值的像素构成主体，默认 16。
- **抗锯齿宽度**：白边最外侧的透明过渡，默认 1 px。
- **包含子文件夹**：递归处理 PNG，并在输出目录中保留相同结构。
- **覆盖已有输出**：默认关闭，防止误覆盖之前生成的图片。

输入、输出文件夹不能相同，输出文件夹也不能位于输入文件夹内部。

## 命令行

开发环境可直接运行 Python 源码：

```powershell
python equidistant_white_edge_generator.py `
  --input "input-folder" `
  --output "output-folder" `
  --width 12 `
  --reference-height 1080 `
  --alpha-threshold 16 `
  --feather 1
```

可选参数：`--no-recursive`、`--overwrite`。

## 构建

安装依赖后，在本目录执行：

```powershell
python -m pip install pillow numpy opencv-python pyinstaller
.\build.ps1
```

生成的可执行文件位于 `dist/EquidistantWhiteEdgeGenerator.exe`。
