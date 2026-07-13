#!/usr/bin/env python3
"""
食材アイコンを参考画像から自動トレースして FoodIcon 用のJSXを生成する。

手描きせず「画像そのもの」をベクター化（線画＋塗りを抽出）するためのツール。
broccoli / natto はこの手順で作成済み。

必要パッケージ（初回のみ）:
    python -m pip install vtracer pillow

使い方:
    python scripts/trace-icon.py <画像パス> [オプション]

主なオプション:
    --name NAME          出力JSXファイル名の接頭辞（既定: icon）
    --crop-bottom N      下からNpxを切り落とす（透かし除去用。既定: 0）
    --detail {low,mid,high}
                         粒の細かさ。high=豆など細部を拾う／パス数増（既定: mid）
    --out PATH           JSX出力先（既定: <name>_jsx.txt を画像と同じフォルダに）

出力された <name>_jsx.txt の中身（<G>…</G>）を src/components/FoodIcon.tsx の
該当 case の return ( … ) にそのまま貼る。G / Path は import 済み。

プレビュー（任意・node必要）:
    npm install @resvg/resvg-js --no-save
    で <name>_trace.svg をPNG化して確認できる（resvgは外部DLL不要）。

クリップボードから画像を取り込む場合（PowerShell）:
    Add-Type -AssemblyName System.Windows.Forms,System.Drawing
    [System.Windows.Forms.Clipboard]::GetImage().Save("ref.png")
"""
import argparse
import os
import xml.etree.ElementTree as ET

from PIL import Image
import vtracer

DETAIL = {
    # filter_speckle, color_precision, layer_difference
    "low":  (10, 4, 24),
    "mid":  (6, 6, 16),
    "high": (4, 7, 10),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--name", default="icon")
    ap.add_argument("--crop-bottom", type=int, default=0)
    ap.add_argument("--detail", choices=DETAIL.keys(), default="mid")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    base = os.path.dirname(os.path.abspath(args.image))
    clean = os.path.join(base, f"{args.name}_clean.png")
    svgout = os.path.join(base, f"{args.name}_trace.svg")
    out = args.out or os.path.join(base, f"{args.name}_jsx.txt")

    # 1) 背景（白 or 黒）を透明化＋透かし切り落とし＋バウンディングボックス算出
    im = Image.open(args.image).convert("RGBA")
    W, H = im.size
    if args.crop_bottom:
        im = im.crop((0, 0, W, H - args.crop_bottom))
        W, H = im.size
    px = im.load()
    xs0, ys0, xs1, ys1 = W, H, 0, 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            near_white = r > 240 and g > 240 and b > 240
            near_black = r < 18 and g < 18 and b < 18
            if a == 0 or near_white or near_black:
                px[x, y] = (0, 0, 0, 0)
            else:
                xs0 = min(xs0, x); xs1 = max(xs1, x)
                ys0 = min(ys0, y); ys1 = max(ys1, y)
    im.save(clean)
    bw, bh = xs1 - xs0 + 1, ys1 - ys0 + 1
    print(f"bbox: x{xs0}-{xs1} y{ys0}-{ys1}  ({bw}x{bh})")

    # 2) カラー自動トレース
    fs, cp, ld = DETAIL[args.detail]
    vtracer.convert_image_to_svg_py(
        clean, svgout,
        colormode="color", hierarchical="stacked", mode="spline",
        filter_speckle=fs, color_precision=cp, layer_difference=ld,
        corner_threshold=60, length_threshold=4.0, splice_threshold=45,
        path_precision=2,
    )

    # 3) パス抽出 → viewBox "0 0 40 40" に収まるよう縮尺
    tree = ET.parse(svgout)
    paths = []
    for p in tree.iter("{http://www.w3.org/2000/svg}path"):
        d = p.get("d")
        if d:
            paths.append((d, p.get("fill", "#000000"), p.get("transform")))
    print(f"paths: {len(paths)}  colors: {len({f for _, f, _ in paths})}")

    s = 36.0 / max(bw, bh)
    ox = (2 + (36 - bw * s) / 2) - xs0 * s
    oy = (2 + (36 - bh * s) / 2) - ys0 * s

    lines = [f'<G transform="translate({ox:.2f} {oy:.2f}) scale({s:.4f})">']
    for d, fill, tr in paths:
        t = f' transform="{tr}"' if tr else ""
        lines.append(f'  <Path d="{d}" fill="{fill}"{t} />')
    lines.append("</G>")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"total d chars: {sum(len(d) for d, _, _ in paths)}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
