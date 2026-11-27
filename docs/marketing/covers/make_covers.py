"""Generate the Xiaohongshu image set for the worklog plugin.

Rendered with Pillow instead of a headless browser: Chinese type stays exact,
the whole set is one script, and a re-run costs a second. Run:

    python3 make_covers.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1440
THEME = (255, 77, 109)
DEEP = (142, 16, 48)
INK = (22, 24, 28)
MUTED = (110, 114, 122)
PAPER = (247, 247, 249)
HERE = Path(__file__).resolve().parent
SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"
MONO = "/System/Library/Fonts/Menlo.ttc"

SOFT_ACCENT = (255, 46, 77)
SOFT_INK = (34, 36, 43)
SOFT_MUTED = (108, 112, 122)


def font(size: int, weight: str = "w6") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(SANS, size, index=2 if weight == "w6" else 0)


def mono(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(MONO, size)


def gradient(top: tuple[int, int, int], bottom: tuple[int, int, int], diagonal: bool = True) -> Image.Image:
    x = np.linspace(0, 1, W)[None, :]
    y = np.linspace(0, 1, H)[:, None]
    t = (x + y) / 2 if diagonal else np.repeat(y, W, axis=1)
    t = np.clip(t, 0, 1)[..., None]
    top_arr = np.array(top, dtype=float)[None, None, :]
    bottom_arr = np.array(bottom, dtype=float)[None, None, :]
    return Image.fromarray((top_arr * (1 - t) + bottom_arr * t).astype(np.uint8), "RGB")


def overlay(base: Image.Image, painter) -> None:
    """Pillow writes RGBA values instead of blending them, so translucent shapes go on a layer."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    painter(ImageDraw.Draw(layer))
    base.alpha_composite(layer)


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        current = ""
        for ch in paragraph:
            if draw.textlength(current + ch, font=f) > max_width and current:
                lines.append(current)
                current = ch
            else:
                current += ch
        lines.append(current)
    return [line for line in lines if line != ""]


def chip(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, f: ImageFont.FreeTypeFont,
         fill: tuple[int, int, int, int], ink: tuple[int, int, int]) -> int:
    x, y = xy
    pad_x, pad_y = 28, 16
    width = draw.textlength(text, font=f) + pad_x * 2
    height = f.size + pad_y * 2
    draw.rounded_rectangle((x, y, x + width, y + height), radius=height // 2, fill=fill)
    draw.text((x + pad_x, y + pad_y - 2), text, font=f, fill=ink)
    return int(width)


def card(base: Image.Image, box: tuple[int, int, int, int], radius: int = 28, shadow: bool = True) -> None:
    x0, y0, x1, y1 = box
    if shadow:
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + 10, x1, y1 + 16), radius=radius, fill=(0, 0, 0, 46))
        base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(18)))
    ImageDraw.Draw(base).rounded_rectangle(box, radius=radius, fill=(255, 255, 255, 255))


def to_ratio(image: Image.Image, ratio: float, anchor: str = "left") -> Image.Image:
    """Crop to an exact aspect ratio before it goes on a screen: no stretch, no cut names."""
    if image.width / image.height > ratio:
        width = int(image.height * ratio)
        left = 0 if anchor == "left" else (image.width - width) // 2
        return image.crop((left, 0, left + width, image.height))
    height = int(image.width / ratio)
    top = 0 if anchor == "top" else (image.height - height) // 2
    return image.crop((0, top, image.width, top + height))


def fit_cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((int(image.width * scale) + 1, int(image.height * scale) + 1), Image.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def paste_rounded(base: Image.Image, image: Image.Image, box: tuple[int, int, int, int], radius: int = 20) -> None:
    x0, y0, x1, y1 = box
    target = fit_cover(image.convert("RGB"), (x1 - x0, y1 - y0))
    mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target.size[0], target.size[1]), radius=radius, fill=255)
    base.paste(target, (x0, y0), mask)


def soft_background() -> Image.Image:
    """Bilinear wash from the four corner colours, plus a blush bloom upper-left."""
    corners = {
        "tl": np.array([246, 247, 251], float),
        "tr": np.array([248, 244, 250], float),
        "bl": np.array([223, 234, 249], float),
        "br": np.array([245, 244, 251], float),
    }
    x = np.linspace(0, 1, W)[None, :, None]
    y = np.linspace(0, 1, H)[:, None, None]
    top = corners["tl"] * (1 - x) + corners["tr"] * x
    bottom = corners["bl"] * (1 - x) + corners["br"] * x
    data = top * (1 - y) + bottom * y
    bloom = np.exp(-(((x - 0.30) ** 2) / (2 * 0.30 ** 2) + ((y - 0.22) ** 2) / (2 * 0.32 ** 2)))
    data = data * (1 - 0.6 * bloom) + np.array([250, 233, 242], float) * (0.6 * bloom)
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


# ─────────────────────────── 1. red cover ───────────────────────────

def cover() -> Image.Image:
    image = gradient((255, 107, 133), DEEP).convert("RGBA")
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "工作日志", font(32), (255, 255, 255, 255), THEME)

    y = 430
    for line in ["今天干了什么，", "让它自己记"]:
        draw.text((96, y), line, font=font(104), fill=(255, 255, 255))
        y += 132

    sub_font = font(36, "w3")
    for index, line in enumerate(["每轮对话自动落一行，", "按主题画成时间轴、按天出总结"]):
        draw.text((96, y + 60 + index * 56), line, font=sub_font, fill=(255, 255, 255, 214))

    bars = [(96, 120, 360), (300, 120, 430), (96, 200, 220), (360, 200, 300), (96, 280, 780)]
    for index, (bx, offset, width) in enumerate(bars):
        overlay(image, lambda layer, bx=bx, offset=offset, width=width, index=index: layer.rounded_rectangle(
            (bx, 900 + offset, bx + width, 900 + offset + 34), radius=17,
            fill=(255, 255, 255, 46 if index % 2 else 70)))

    overlay(image, lambda layer: layer.rectangle((96, 1246, 168, 1250), fill=(255, 255, 255, 160)))
    draw.text((96, 1282), "DeepSeek Harness 插件 · 开源", font=font(30, "w3"), fill=(255, 255, 255, 190))
    draw.text((96, 1332), "@Ruska", font=font(30, "w3"), fill=(255, 255, 255, 150))
    return image


# ─────────────────────────── 2. three things ───────────────────────────

def three_things() -> Image.Image:
    image = Image.new("RGBA", (W, H), PAPER + (255,))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 16), fill=THEME)
    chip(draw, (96, 110), "它做三件事", font(32), THEME + (255,), (255, 255, 255))
    draw.text((96, 232), "不用手写日报", font=font(84), fill=INK)

    items = [
        ("每轮对话自动落一行", "只存摘要、工具名和改过的文件，不存对话正文"),
        ("两个模型各写一份摘要", "主摘要跟着你在 DSH 里选的模型，对比槽可以换本地 Ollama"),
        ("每轮判一次主题", "于是日志多了可分组、能画时间轴的维度"),
    ]
    y = 430
    for index, (headline, body) in enumerate(items, start=1):
        draw.ellipse((96, y, 152, y + 56), fill=THEME)
        number = font(34)
        draw.text((124 - draw.textlength(str(index), font=number) / 2, y + 8), str(index), font=number, fill=(255, 255, 255))
        draw.text((190, y - 2), headline, font=font(46), fill=INK)
        body_font = font(32, "w3")
        lines = wrap(draw, body, body_font, W - 190 - 110)
        for line_index, line in enumerate(lines):
            draw.text((190, y + 66 + line_index * 48), line, font=body_font, fill=MUTED)
        y += 66 + len(lines) * 48 + 86

    overlay(image, lambda layer: layer.rounded_rectangle((96, 1030, 984, 1122), radius=22, fill=(255, 77, 109, 22)))
    draw.text((124, 1052), "Agent 也能直接问：", font=font(28, "w3"), fill=MUTED)
    draw.text((124, 1086), "worklog_today / worklog_search / worklog_topics", font=mono(26), fill=THEME)

    draw.rectangle((96, 1190, 984, 1192), fill=(226, 226, 230))
    draw.text((96, 1240), "全部存在本机 · 不上传云端", font=font(30, "w3"), fill=MUTED)
    draw.text((96, 1296), "手机端也能看：DSH Pocket → 插件", font=font(30, "w3"), fill=MUTED)
    return image


# ─────────────────────────── 3. gantt page ───────────────────────────

def gantt() -> Image.Image:
    image = Image.new("RGBA", (W, H), PAPER + (255,))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 16), fill=THEME)
    draw.text((96, 108), "一天被切成若干主题", font=font(76), fill=INK)
    draw.text((96, 220), "甘特视图 · 一行一个主题，色条表示被打断", font=font(32, "w3"), fill=MUTED)

    shot = Image.open(HERE.parent / "panel-gantt.webp")
    box_width = W - 2 * 72
    box_height = int(box_width * shot.height / shot.width)
    top = 310
    card(image, (72, top, 72 + box_width, top + box_height), radius=26)
    paste_rounded(image, shot, (88, top + 16, 72 + box_width - 16, top + box_height - 16), radius=18)

    stats_y = top + box_height + 56
    for index, (value, label) in enumerate([("36", "轮对话"), ("12", "个主题")]):
        x = 96 + index * 420
        draw.text((x, stats_y), value, font=font(92), fill=THEME)
        draw.text((x + draw.textlength(value, font=font(92)) + 12, stats_y + 44), label, font=font(32, "w3"), fill=MUTED)

    draw.rectangle((96, stats_y + 170, 984, stats_y + 172), fill=(226, 226, 230))
    draw.text((96, stats_y + 220), "同一天 · 主题、被打断的段、时间点都在一条轴上", font=font(30, "w3"), fill=MUTED)
    draw.rectangle((96, 1250, 984, 1252), fill=(226, 226, 230))
    draw.text((96, 1300), "甘特 / 按会话 / 按主题 / 日总结 —— 四种视图", font=font(30, "w3"), fill=MUTED)
    return image


# ─────────────────────────── 4. install ───────────────────────────

def install() -> Image.Image:
    image = gradient((255, 107, 133), DEEP).convert("RGBA")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(["装一次，", "往后自动记"]):
        width = draw.textlength(line, font=font(88))
        draw.text(((W - width) / 2, 300 + index * 116), line, font=font(88), fill=(255, 255, 255))

    sub_font = font(34, "w3")
    subtitle = "npm 包名 dsh-worklog-topics（dsh-worklog 已被占用）"
    draw.text(((W - draw.textlength(subtitle, font=sub_font)) / 2, 620), subtitle, font=sub_font, fill=(255, 255, 255, 200))

    command = "dsh plugin --profile desktop add dsh-worklog-topics"
    command_font = mono(28)
    box_width = draw.textlength(command, font=command_font) + 72
    x0 = (W - box_width) / 2
    y0 = 720
    draw.rounded_rectangle((x0, y0, x0 + box_width, y0 + 84), radius=18, fill=(0, 0, 0, 92))
    draw.text((x0 + 36, y0 + 26), command, font=command_font, fill=(255, 255, 255))

    links = font(32, "w3")
    for index, line in enumerate(["github.com/jqlong17/dsh-worklog", "装完重启一次 DSH，侧栏会出现「工作日志」"]):
        draw.text(((W - draw.textlength(line, font=links)) / 2, 880 + index * 56), line, font=links, fill=(255, 255, 255, 200))

    draw.rectangle((W / 2 - 36, 1230, W / 2 + 36, 1234), fill=(255, 255, 255, 150))
    footer = "DeepSeek Harness 插件 · 全本地"
    draw.text(((W - draw.textlength(footer, font=font(30, "w3"))) / 2, 1270), footer, font=font(30, "w3"), fill=(255, 255, 255, 170))
    return image


# ─────────────────────────── 5-6. soft pair ───────────────────────────

def soft_cover() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "工作日志", font(32), (255, 226, 232, 255), SOFT_ACCENT)

    y = 430
    for line in ["今天干了什么，", "让它自己记"]:
        draw.text((96, y), line, font=font(104), fill=SOFT_INK)
        y += 132

    sub_font = font(36, "w3")
    for index, line in enumerate(["每轮对话自动落一行，", "按主题画成时间轴、按天出总结"]):
        draw.text((96, y + 60 + index * 56), line, font=sub_font, fill=SOFT_MUTED)

    bars = [(96, 120, 360), (300, 120, 430), (96, 200, 220), (360, 200, 300), (96, 280, 780)]
    for index, (bx, offset, width) in enumerate(bars):
        fill = (255, 168, 184, 255) if index % 2 == 0 else (255, 206, 216, 255)
        draw.rounded_rectangle((bx, 900 + offset, bx + width, 900 + offset + 34), radius=17, fill=fill)

    draw.rectangle((96, 1246, 168, 1250), fill=SOFT_ACCENT)
    draw.text((96, 1282), "DeepSeek Harness 插件 · 开源", font=font(30, "w3"), fill=SOFT_MUTED)
    draw.text((96, 1332), "@Ruska", font=font(30, "w3"), fill=(140, 142, 152))
    return image


def soft_list() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, W, 14), fill=SOFT_ACCENT)
    chip(draw, (96, 110), "它做三件事", font(32), (255, 226, 232, 255), SOFT_ACCENT)
    draw.text((96, 232), "不用手写日报", font=font(84), fill=SOFT_INK)

    items = [
        ("每轮对话自动落一行", "只存摘要、工具名和改过的文件，不存对话正文"),
        ("两个模型各写一份摘要", "主摘要跟着你在 DSH 里选的模型，对比槽可以换本地 Ollama"),
        ("每轮判一次主题", "于是日志多了可分组、能画时间轴的维度"),
    ]
    y = 430
    for index, (headline, body) in enumerate(items, start=1):
        draw.ellipse((96, y, 152, y + 56), fill=SOFT_ACCENT)
        number = font(34)
        draw.text((124 - draw.textlength(str(index), font=number) / 2, y + 8), str(index), font=number, fill=(255, 255, 255))
        draw.text((190, y - 2), headline, font=font(46), fill=SOFT_INK)
        body_font = font(32, "w3")
        lines = wrap(draw, body, body_font, W - 190 - 110)
        for line_index, line in enumerate(lines):
            draw.text((190, y + 66 + line_index * 48), line, font=body_font, fill=SOFT_MUTED)
        y += 66 + len(lines) * 48 + 86

    draw.rounded_rectangle((96, 1030, 984, 1122), radius=22, fill=(255, 255, 255, 210))
    draw.text((124, 1052), "Agent 也能直接问：", font=font(28, "w3"), fill=SOFT_MUTED)
    draw.text((124, 1086), "worklog_today / worklog_search / worklog_topics", font=mono(26), fill=SOFT_ACCENT)
    draw.rectangle((96, 1190, 984, 1192), fill=(216, 219, 228))
    draw.text((96, 1240), "全部存在本机 · 不上传云端", font=font(30, "w3"), fill=SOFT_MUTED)
    draw.text((96, 1296), "手机端也能看：DSH Pocket → 插件", font=font(30, "w3"), fill=SOFT_MUTED)
    return image


# ─────────────────────────── 7-8. macbook ───────────────────────────

def macbook(base: Image.Image, shot_path: Path, center_x: int, top: int, screen_w: int,
            mode: str = "crop") -> int:
    """Draw a head-on MacBook with the screenshot on screen; returns its bottom edge."""
    shot = Image.open(shot_path)
    screen_h = int(screen_w * 0.625)
    if mode == "crop":
        shot = to_ratio(shot, screen_w / screen_h, "left")
    bezel = 16
    body_w = screen_w + bezel * 2
    body_h = screen_h + 20 + 24
    x0 = int(center_x - body_w / 2)
    y0 = top

    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x0 + 16, y0 + body_h - 6, x0 + body_w - 16, y0 + body_h + 34), radius=24, fill=(54, 57, 74, 90))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))

    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle((x0, y0, x0 + body_w, y0 + body_h), radius=22, fill=(17, 19, 23))
    draw.rounded_rectangle((x0, y0, x0 + body_w, y0 + 3), radius=2, fill=(46, 50, 58))
    screen_box = (x0 + bezel, y0 + 20, x0 + bezel + screen_w, y0 + 20 + screen_h)
    if mode == "contain":
        draw.rounded_rectangle(screen_box, radius=8, fill=(247, 248, 250))
        scaled = shot.convert("RGB")
        factor = min(screen_w / scaled.width, screen_h / scaled.height)
        target = scaled.resize((int(scaled.width * factor), int(scaled.height * factor)), Image.LANCZOS)
        base.paste(target, (screen_box[0] + (screen_w - target.width) // 2,
                            screen_box[1] + (screen_h - target.height) // 2))
    else:
        paste_rounded(base, shot, screen_box, radius=8)
    draw.ellipse((center_x - 2, y0 + 8, center_x + 2, y0 + 12), fill=(72, 77, 86))

    base_w = int(body_w * 1.11)
    bx0 = int(center_x - base_w / 2)
    by0 = y0 + body_h
    draw.rounded_rectangle((bx0, by0, bx0 + base_w, by0 + 18), radius=7, fill=(201, 205, 213))
    draw.rounded_rectangle((center_x - 72, by0 - 1, center_x + 72, by0 + 5), radius=3, fill=(166, 172, 182))
    return by0 + 18


def mac_cover() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "工作日志", font(32), (255, 226, 232, 255), SOFT_ACCENT)
    for index, line in enumerate(["一天干了什么，", "一张图看完"]):
        draw.text((96, 300 + index * 104), line, font=font(84), fill=SOFT_INK)

    bottom = macbook(image, HERE.parent / "panel-gantt.webp", W // 2, 560, 860)
    caption_font = font(30, "w3")
    caption = "甘特视图 · 一行一个主题，被谁打断一眼看出"
    draw.text(((W - draw.textlength(caption, font=caption_font)) / 2, bottom + 46), caption, font=caption_font, fill=SOFT_MUTED)
    handle = "DeepSeek Harness 插件 · 开源"
    draw.text(((W - draw.textlength(handle, font=caption_font)) / 2, H - 96), handle, font=caption_font, fill=(150, 152, 162))
    return image


def mac_red() -> Image.Image:
    image = gradient((255, 107, 133), DEEP).convert("RGBA")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(["日总结，", "两个模型各写一份"]):
        width = draw.textlength(line, font=font(80))
        draw.text(((W - width) / 2, 260 + index * 100), line, font=font(80), fill=(255, 255, 255))

    bottom = macbook(image, HERE.parent / "panel-daily.webp", W // 2, 520, 860, mode="contain")
    caption_font = font(30, "w3")
    caption = "按天列主题数与总结，天里有新记录会提示需更新"
    draw.text(((W - draw.textlength(caption, font=caption_font)) / 2, bottom + 46), caption, font=caption_font, fill=(255, 255, 255, 205))
    handle = "deepseek harness · 工作日志"
    draw.text(((W - draw.textlength(handle, font=caption_font)) / 2, H - 96), handle, font=caption_font, fill=(255, 255, 255, 150))
    return image


# ─────────────────────────── 9. gantt with hover card ───────────────────────────

def find_accent_bar(image: Image.Image) -> tuple[int, int, int, int] | None:
    """Box of the dominant blue bar (the longest row), ignoring stray accent dots."""
    data = np.array(image.convert("RGB"), dtype=int)
    mask = (data[:, :, 2] > 150) & (data[:, :, 0] < 130) & (data[:, :, 1] < 150)
    rows = mask.sum(axis=1)
    if rows.max() == 0:
        return None
    peak = int(rows.argmax())
    threshold = rows[peak] * 0.5
    top = peak
    while top > 0 and rows[top - 1] >= threshold:
        top -= 1
    bottom = peak
    while bottom + 1 < len(rows) and rows[bottom + 1] >= threshold:
        bottom += 1
    cols = np.where(mask[top:bottom + 1, :].any(axis=0))[0]
    return int(cols.min()), top, int(cols.max()), bottom


def pointer(base: Image.Image, x: int, y: int, scale: float = 1.5) -> None:
    points = [(0, 0), (0, 17), (4.6, 12.6), (7.6, 18.8), (10.4, 17.4), (7.4, 11.4), (13, 11.4)]
    scaled = [(x + px * scale, y + py * scale) for px, py in points]
    ImageDraw.Draw(base).polygon(scaled, fill=(255, 255, 255), outline=(40, 42, 48))
    ImageDraw.Draw(base).line(scaled + [scaled[0]], fill=(40, 42, 48), width=2)


def gantt_hover() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "工作日志", font(32), (255, 226, 232, 255), SOFT_ACCENT)
    for index, line in enumerate(["鼠标一停，", "这段干了什么就说清了"]):
        draw.text((96, 262 + index * 92), line, font=font(76), fill=SOFT_INK)

    shot = Image.open(HERE.parent / "panel-gantt.webp")
    crop = shot.crop((0, 40, 2150, 960))
    inner_w = 960
    inner_h = int(inner_w * crop.height / crop.width)
    card_top = 600
    card(image, (72, card_top, 72 + inner_w + 48, card_top + inner_h + 48), radius=26)
    paste_rounded(image, crop, (96, card_top + 24, 96 + inner_w, card_top + 24 + inner_h), radius=12)

    bar = find_accent_bar(crop)
    scale = inner_w / crop.width
    bar_x = 96 + ((bar[0] + bar[2]) / 2) * scale
    bar_y = card_top + 24 + bar[1] * scale
    bar_bottom = card_top + 24 + bar[3] * scale

    tip_w = 420
    pad = 14
    body = font(16, "w3")
    entries: list[tuple[str, ImageFont.FreeTypeFont, tuple[int, int, int], int]] = [
        ("接口联调与错误处理", font(22), (28, 30, 36), 7),
        ("10:42–11:54 · 1h 12m · 3 轮", font(17, "w3"), (108, 112, 122), 9),
    ]
    for paragraph in ["11:30 修了 token 过期的重试逻辑，补上错误提示",
                      "11:48 发布接口超时从 15s 提到 30s，重试能落到用户面前"]:
        for line in wrap(draw, paragraph, body, tip_w - pad * 2):
            entries.append((line, body, (60, 63, 70), 4))
    entries.append(("点一下能展开全部 12 轮", font(15, "w3"), (140, 144, 154), 0))
    entries[-2] = (entries[-2][0], entries[-2][1], entries[-2][2], 10)

    tip_h = pad * 2 + sum(face.size + gap for _, face, _, gap in entries) + 14
    tip_x = int(max(84, min(bar_x - tip_w / 2, 96 + inner_w - tip_w)))
    tip_y = int(bar_bottom) + 26

    shadow_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        (tip_x, tip_y + 6, tip_x + tip_w, tip_y + tip_h + 10), radius=12, fill=(40, 44, 60, 70))
    image.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(16)))

    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((tip_x, tip_y, tip_x + tip_w, tip_y + tip_h), radius=10,
                           fill=(238, 241, 246), outline=(214, 220, 230), width=1)
    cursor_y = tip_y + pad
    for text, face, ink, gap in entries:
        draw.text((tip_x + pad, cursor_y), text, font=face, fill=ink)
        cursor_y += face.size + gap

    pointer(image, int(bar_x) + 4, int(bar_y) + 6, 1.6)

    caption = "悬停看摘要，点一下展开这一段的全部轮次"
    draw.text(((W - draw.textlength(caption, font=font(30, "w3"))) / 2, card_top + inner_h + 70), caption, font=font(30, "w3"), fill=SOFT_MUTED)
    handle = "DeepSeek Harness 插件 · 开源"
    draw.text(((W - draw.textlength(handle, font=font(28, "w3"))) / 2, H - 90), handle, font=font(28, "w3"), fill=(150, 152, 162))
    return image


# ─────────────────────────── final set: device + screenshot, one wash ───────────────────────────

def cover_device() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "工作日志", font(32), (255, 226, 232, 255), SOFT_ACCENT)

    for index, line in enumerate(["今天干了什么，", "让它自己记"]):
        draw.text((96, 286 + index * 118), line, font=font(96), fill=SOFT_INK)

    bottom = macbook(image, HERE.parent / "panel-gantt.webp", W // 2, 600, 880)

    note_font = font(30, "w3")
    note = "每轮对话自动落一行 · 按主题画成时间轴"
    draw.text(((W - draw.textlength(note, font=note_font)) / 2, bottom + 54), note, font=note_font, fill=SOFT_MUTED)
    handle = "DeepSeek Harness 插件 · 开源"
    draw.text(((W - draw.textlength(handle, font=font(28, "w3"))) / 2, H - 78), handle, font=font(28, "w3"), fill=(150, 152, 162))
    return image


def daily_device() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)
    chip(draw, (96, 110), "日总结", font(32), (255, 226, 232, 255), SOFT_ACCENT)

    for index, line in enumerate(["一天收尾，", "两个模型各写一份"]):
        draw.text((96, 286 + index * 104), line, font=font(84), fill=SOFT_INK)

    bottom = macbook(image, HERE.parent / "panel-daily.webp", W // 2, 580, 880, mode="contain")
    note_font = font(30, "w3")
    note = "主摘要跟着你选的模型，对比槽可换本地 Ollama"
    draw.text(((W - draw.textlength(note, font=note_font)) / 2, bottom + 54), note, font=note_font, fill=SOFT_MUTED)
    handle = "DeepSeek Harness 插件 · 开源"
    draw.text(((W - draw.textlength(handle, font=font(28, "w3"))) / 2, H - 78), handle, font=font(28, "w3"), fill=(150, 152, 162))
    return image


def install_pastel() -> Image.Image:
    image = soft_background()
    draw = ImageDraw.Draw(image)

    for index, line in enumerate(["装一次，", "往后自动记"]):
        width = draw.textlength(line, font=font(96))
        draw.text(((W - width) / 2, 330 + index * 124), line, font=font(96), fill=SOFT_INK)

    sub_font = font(32, "w3")
    subtitle = "npm 包名 dsh-worklog-topics（dsh-worklog 已被占用）"
    draw.text(((W - draw.textlength(subtitle, font=sub_font)) / 2, 660), subtitle, font=sub_font, fill=SOFT_MUTED)

    command = "dsh plugin --profile desktop add dsh-worklog-topics"
    command_font = mono(27)
    box_width = draw.textlength(command, font=command_font) + 72
    x0 = (W - box_width) / 2
    y0 = 760
    draw.rounded_rectangle((x0, y0, x0 + box_width, y0 + 84), radius=18, fill=(27, 29, 34))
    draw.text((x0 + 36, y0 + 26), command, font=command_font, fill=(246, 247, 250))

    links = font(30, "w3")
    for index, line in enumerate(["github.com/jqlong17/dsh-worklog", "装完重启一次 DSH，侧栏会出现「工作日志」"]):
        draw.text(((W - draw.textlength(line, font=links)) / 2, 920 + index * 54), line, font=links, fill=SOFT_MUTED)

    draw.rectangle((W / 2 - 36, 1210, W / 2 + 36, 1214), fill=SOFT_ACCENT)
    footer = "DeepSeek Harness 插件 · 全本地 · 手机端也能看"
    draw.text(((W - draw.textlength(footer, font=font(28, "w3"))) / 2, 1250), footer, font=font(28, "w3"), fill=(140, 142, 152))
    return image


def main() -> None:
    outputs = {
        "01-cover": cover_device(),
        "02-gantt-hover": gantt_hover(),
        "03-daily": daily_device(),
        "04-install": install_pastel(),
    }
    # JPG only by default: it is what the uploader asks for, and for flat art it
    # is the same size as PNG. `--png` also keeps a lossless master.
    also_png = "--png" in sys.argv
    for stem, image in outputs.items():
        flat = image.convert("RGB")
        jpg = HERE / f"{stem}.jpg"
        flat.save(jpg, "JPEG", quality=92, subsampling=0, optimize=True, progressive=True)
        line = f"{stem}.jpg {os.path.getsize(jpg) / 1024:.0f} KB"
        if also_png:
            png = HERE / f"{stem}.png"
            flat.save(png, "PNG", optimize=True)
            line += f"   {stem}.png {os.path.getsize(png) / 1024:.0f} KB"
        print(line)


if __name__ == "__main__":
    main()
