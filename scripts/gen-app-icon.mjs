// アプリアイコン/スプラッシュ/faviconを生成する（緑地に白「飯」ワードマーク）。
// 依存: @resvg/resvg-js, pngjs（プロジェクト依存には含めない。別ディレクトリで入れて実行）
//   pnpm add @resvg/resvg-js pngjs
//   node scripts/gen-app-icon.mjs
// icon.png はApp Store要件によりアルファ無し(RGB)で出力する。
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Render to an opaque (no alpha channel) PNG — App Store icons must not have alpha.
function renderOpaque(svg, width, bg) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: fontOpts, background: bg });
  const img = r.render();
  const { width: w, height: h, pixels } = img; // RGBA
  const png = new PNG({ width: w, height: h, colorType: 2, inputColorType: 2, bgColor: { red: 0, green: 0, blue: 0 } });
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    out[j] = pixels[i]; out[j + 1] = pixels[i + 1]; out[j + 2] = pixels[i + 2];
  }
  png.data = out;
  return PNG.sync.write(png, { colorType: 2 });
}

const GREEN = '#3E7D5A';
const CREAM = '#FCFBF7';
const WHITE = '#FFFFFF';
const FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc';
const OUT = '/Users/wmac/AI-edit-Mac/konya-meshi/assets';

const fontOpts = { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Hiragino Sans' };

function render(svg, width) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: fontOpts, background: 'rgba(0,0,0,0)' });
  return r.render().asPng();
}

// Glyph centered. cy nudged for optical centering of 飯.
function glyph(color, size, cx, cy) {
  return `<text x="${cx}" y="${cy}" font-family="Hiragino Sans" font-weight="700" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="central">飯</text>`;
}

// 1) iOS icon.png — 1024, full-bleed green, no transparency, no rounded corners (iOS masks).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${GREEN}"/>
  ${glyph(WHITE, 580, 512, 536)}
</svg>`;
writeFileSync(`${OUT}/icon.png`, renderOpaque(icon, 1024, GREEN));

// 2) Android adaptive foreground — transparent, glyph within safe zone (~66% center).
// Content kept inside center ~62% so nothing clips under circle/squircle masks.
const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  ${glyph(WHITE, 400, 512, 528)}
</svg>`;
writeFileSync(`${OUT}/adaptive-icon.png`, render(adaptive, 1024));

// 3) Splash — cream bg, centered green rounded tile with white glyph (mini app icon).
const TILE = 300, TX = (1242 - TILE) / 2, TY = (2436 - TILE) / 2;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1242 2436">
  <rect width="1242" height="2436" fill="${CREAM}"/>
  <rect x="${TX}" y="${TY}" width="${TILE}" height="${TILE}" rx="66" fill="${GREEN}"/>
  ${glyph(WHITE, 182, 621, TY + TILE / 2 + 6)}
</svg>`;
writeFileSync(`${OUT}/splash.png`, render(splash, 1242));

// 4) Web favicon — 48px green tile with glyph.
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="${GREEN}"/>
  ${glyph(WHITE, 30, 24, 26)}
</svg>`;
writeFileSync(`${OUT}/favicon.png`, render(fav, 48));

console.log('generated: icon.png, adaptive-icon.png, splash.png, favicon.png');
