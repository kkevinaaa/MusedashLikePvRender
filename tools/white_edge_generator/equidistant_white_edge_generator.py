from __future__ import annotations

import argparse
import queue
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

import cv2
import numpy as np
from PIL import Image


APP_NAME = "Equidistant White Edge Generator"
APP_VERSION = "1.0.0"


@dataclass(frozen=True)
class Settings:
    width: float = 12.0
    reference_height: int = 1080
    alpha_threshold: int = 16
    feather: float = 1.0
    recursive: bool = True
    overwrite: bool = False

    def validate(self) -> None:
        if self.width < 0:
            raise ValueError("白边宽度不能小于 0。")
        if self.reference_height <= 0:
            raise ValueError("基准高度必须大于 0。")
        if not 0 <= self.alpha_threshold <= 255:
            raise ValueError("Alpha 阈值必须在 0 到 255 之间。")
        if self.feather < 0:
            raise ValueError("抗锯齿宽度不能小于 0。")


def effective_pixels(value: float, image_height: int, reference_height: int) -> float:
    return value * image_height / reference_height


def add_equidistant_white_edge(image: Image.Image, settings: Settings) -> Image.Image:
    """Return an RGBA image with a white edge outside the alpha silhouette."""
    settings.validate()
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    alpha = rgba[:, :, 3]
    foreground = alpha >= settings.alpha_threshold

    if not np.any(foreground):
        raise ValueError("图片没有达到 Alpha 阈值的可见像素。")

    height, width = alpha.shape
    edge_width = effective_pixels(settings.width, height, settings.reference_height)
    feather = effective_pixels(settings.feather, height, settings.reference_height)

    # distanceTransform returns the Euclidean distance from each non-zero pixel
    # to the nearest zero pixel. The subject is zero, so values outside it are
    # distances to the alpha silhouette.
    outside = (~foreground).astype(np.uint8)
    distance = cv2.distanceTransform(outside, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)

    if feather > 0:
        coverage = np.clip((edge_width + feather - distance) / feather, 0.0, 1.0)
    else:
        coverage = (distance <= edge_width).astype(np.float32)
    coverage *= outside

    white_layer = np.empty((height, width, 4), dtype=np.uint8)
    white_layer[:, :, :3] = 255
    white_layer[:, :, 3] = np.rint(coverage * 255.0).astype(np.uint8)

    base = Image.fromarray(white_layer, mode="RGBA")
    original = Image.fromarray(rgba, mode="RGBA")
    return Image.alpha_composite(base, original)


def iter_png_files(root: Path, recursive: bool) -> Iterable[Path]:
    pattern = "**/*.png" if recursive else "*.png"
    return sorted(path for path in root.glob(pattern) if path.is_file())


def process_directory(
    input_dir: Path,
    output_dir: Path,
    settings: Settings,
    progress: Callable[[int, int, Path, str], None] | None = None,
) -> tuple[int, int]:
    settings.validate()
    input_dir = input_dir.resolve()
    output_dir = output_dir.resolve()

    if not input_dir.is_dir():
        raise ValueError(f"输入目录不存在：{input_dir}")
    if input_dir == output_dir:
        raise ValueError("输入目录和输出目录不能相同。")
    try:
        output_dir.relative_to(input_dir)
    except ValueError:
        pass
    else:
        raise ValueError("输出目录不能放在输入目录内部，以免重复处理生成文件。")

    files = list(iter_png_files(input_dir, settings.recursive))
    if not files:
        raise ValueError("输入目录中没有找到 PNG 文件。")

    completed = 0
    skipped = 0
    total = len(files)
    for index, source in enumerate(files, start=1):
        relative = source.relative_to(input_dir)
        destination = output_dir / relative
        if destination.exists() and not settings.overwrite:
            skipped += 1
            if progress:
                progress(index, total, relative, "跳过（已存在）")
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened:
            result = add_equidistant_white_edge(opened, settings)
            save_options: dict[str, object] = {"optimize": True}
            if "icc_profile" in opened.info:
                save_options["icc_profile"] = opened.info["icc_profile"]
            result.save(destination, format="PNG", **save_options)
        completed += 1
        if progress:
            progress(index, total, relative, "完成")

    return completed, skipped


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="为透明 PNG 批量生成欧氏等距白色外边缘。")
    parser.add_argument("--input", type=Path, help="输入文件夹")
    parser.add_argument("--output", type=Path, help="输出文件夹")
    parser.add_argument("--width", type=float, default=12.0, help="基准分辨率下的白边宽度（默认 12）")
    parser.add_argument("--reference-height", type=int, default=1080, help="参数对应的基准高度（默认 1080）")
    parser.add_argument("--alpha-threshold", type=int, default=16, help="主体 Alpha 阈值（默认 16）")
    parser.add_argument("--feather", type=float, default=1.0, help="边缘抗锯齿宽度（默认 1）")
    parser.add_argument("--no-recursive", action="store_true", help="不处理子文件夹")
    parser.add_argument("--overwrite", action="store_true", help="覆盖输出目录中已有的同名文件")
    parser.add_argument("--version", action="version", version=f"%(prog)s {APP_VERSION}")
    return parser


def run_cli(args: argparse.Namespace) -> int:
    if args.input is None or args.output is None:
        raise ValueError("命令行模式必须同时提供 --input 和 --output。")
    settings = Settings(
        width=args.width,
        reference_height=args.reference_height,
        alpha_threshold=args.alpha_threshold,
        feather=args.feather,
        recursive=not args.no_recursive,
        overwrite=args.overwrite,
    )

    def report(index: int, total: int, path: Path, status: str) -> None:
        print(f"[{index}/{total}] {status}: {path}")

    completed, skipped = process_directory(args.input, args.output, settings, report)
    print(f"处理完成：生成 {completed} 张，跳过 {skipped} 张。")
    return 0


def run_gui() -> int:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title(f"{APP_NAME} {APP_VERSION}")
    root.geometry("760x570")
    root.minsize(680, 500)

    input_var = tk.StringVar()
    output_var = tk.StringVar()
    width_var = tk.StringVar(value="12")
    reference_var = tk.StringVar(value="1080")
    threshold_var = tk.StringVar(value="16")
    feather_var = tk.StringVar(value="1")
    recursive_var = tk.BooleanVar(value=True)
    overwrite_var = tk.BooleanVar(value=False)
    status_var = tk.StringVar(value="请选择输入和输出文件夹。")
    events: queue.Queue[tuple[str, object]] = queue.Queue()

    container = ttk.Frame(root, padding=16)
    container.pack(fill="both", expand=True)
    container.columnconfigure(1, weight=1)

    ttk.Label(container, text="输入文件夹").grid(row=0, column=0, sticky="w", pady=5)
    ttk.Entry(container, textvariable=input_var).grid(row=0, column=1, sticky="ew", padx=8, pady=5)
    ttk.Button(
        container,
        text="浏览…",
        command=lambda: input_var.set(filedialog.askdirectory(title="选择包含透明 PNG 的文件夹") or input_var.get()),
    ).grid(row=0, column=2, pady=5)

    ttk.Label(container, text="输出文件夹").grid(row=1, column=0, sticky="w", pady=5)
    ttk.Entry(container, textvariable=output_var).grid(row=1, column=1, sticky="ew", padx=8, pady=5)
    ttk.Button(
        container,
        text="浏览…",
        command=lambda: output_var.set(filedialog.askdirectory(title="选择输出文件夹") or output_var.get()),
    ).grid(row=1, column=2, pady=5)

    params = ttk.LabelFrame(container, text="边缘参数", padding=12)
    params.grid(row=2, column=0, columnspan=3, sticky="ew", pady=(12, 8))
    for column in range(4):
        params.columnconfigure(column, weight=1 if column in (1, 3) else 0)

    ttk.Label(params, text="白边宽度（px）").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=5)
    ttk.Entry(params, textvariable=width_var, width=12).grid(row=0, column=1, sticky="w", pady=5)
    ttk.Label(params, text="基准高度（px）").grid(row=0, column=2, sticky="w", padx=(24, 8), pady=5)
    ttk.Entry(params, textvariable=reference_var, width=12).grid(row=0, column=3, sticky="w", pady=5)
    ttk.Label(params, text="Alpha 阈值").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=5)
    ttk.Entry(params, textvariable=threshold_var, width=12).grid(row=1, column=1, sticky="w", pady=5)
    ttk.Label(params, text="抗锯齿宽度（px）").grid(row=1, column=2, sticky="w", padx=(24, 8), pady=5)
    ttk.Entry(params, textvariable=feather_var, width=12).grid(row=1, column=3, sticky="w", pady=5)
    ttk.Label(
        params,
        text="宽度以基准高度计；例如 1080p 下 12 px，2160p 自动换算为 24 px。",
        foreground="#555555",
    ).grid(row=2, column=0, columnspan=4, sticky="w", pady=(7, 0))

    options = ttk.Frame(container)
    options.grid(row=3, column=0, columnspan=3, sticky="w", pady=5)
    ttk.Checkbutton(options, text="包含子文件夹", variable=recursive_var).pack(side="left", padx=(0, 20))
    ttk.Checkbutton(options, text="覆盖已有输出", variable=overwrite_var).pack(side="left")

    progress_bar = ttk.Progressbar(container, mode="determinate")
    progress_bar.grid(row=4, column=0, columnspan=3, sticky="ew", pady=(12, 5))
    ttk.Label(container, textvariable=status_var).grid(row=5, column=0, columnspan=3, sticky="w")

    log = tk.Text(container, height=11, wrap="none", state="disabled")
    log.grid(row=6, column=0, columnspan=3, sticky="nsew", pady=(8, 8))
    container.rowconfigure(6, weight=1)

    def append_log(message: str) -> None:
        log.configure(state="normal")
        log.insert("end", message + "\n")
        log.see("end")
        log.configure(state="disabled")

    def worker(input_dir: Path, output_dir: Path, settings: Settings) -> None:
        try:
            def report(index: int, total: int, path: Path, state: str) -> None:
                events.put(("progress", (index, total, path, state)))

            result = process_directory(input_dir, output_dir, settings, report)
            events.put(("done", result))
        except Exception as exc:  # shown to the user in the GUI
            events.put(("error", str(exc)))

    def start() -> None:
        try:
            settings = Settings(
                width=float(width_var.get()),
                reference_height=int(reference_var.get()),
                alpha_threshold=int(threshold_var.get()),
                feather=float(feather_var.get()),
                recursive=recursive_var.get(),
                overwrite=overwrite_var.get(),
            )
            settings.validate()
            input_dir = Path(input_var.get().strip())
            output_dir = Path(output_var.get().strip())
            if not input_var.get().strip() or not output_var.get().strip():
                raise ValueError("请选择输入和输出文件夹。")
        except Exception as exc:
            messagebox.showerror(APP_NAME, str(exc))
            return

        start_button.configure(state="disabled")
        progress_bar["value"] = 0
        status_var.set("正在扫描 PNG 文件…")
        append_log("— 开始处理 —")
        threading.Thread(target=worker, args=(input_dir, output_dir, settings), daemon=True).start()

    def poll_events() -> None:
        try:
            while True:
                kind, payload = events.get_nowait()
                if kind == "progress":
                    index, total, path, state = payload  # type: ignore[misc]
                    progress_bar["maximum"] = total
                    progress_bar["value"] = index
                    status_var.set(f"{index}/{total}  {path}")
                    append_log(f"[{index}/{total}] {state}: {path}")
                elif kind == "done":
                    completed, skipped = payload  # type: ignore[misc]
                    start_button.configure(state="normal")
                    status_var.set(f"处理完成：生成 {completed} 张，跳过 {skipped} 张。")
                    messagebox.showinfo(APP_NAME, status_var.get())
                elif kind == "error":
                    start_button.configure(state="normal")
                    status_var.set("处理失败。")
                    messagebox.showerror(APP_NAME, str(payload))
        except queue.Empty:
            pass
        root.after(100, poll_events)

    start_button = ttk.Button(container, text="开始生成等距白边", command=start)
    start_button.grid(row=7, column=0, columnspan=3, pady=(6, 0))

    root.after(100, poll_events)
    root.mainloop()
    return 0


def main() -> int:
    parser = build_parser()
    if len(sys.argv) == 1:
        return run_gui()
    try:
        return run_cli(parser.parse_args())
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
