import fs from 'node:fs';
import path from 'node:path';

const sourcePath = 'C:/Users/STAIRX 佐藤/Documents/Codex/konya-meshi/src/components/FoodIcon.tsx';
const outPath = 'C:/Users/STAIRX 佐藤/Documents/Codex/2026-06-29/react-native-expo-typescript-svg-icon/outputs/food_icon_gallery.html';
const source = fs.readFileSync(sourcePath, 'utf8');

const keys = [
  'salmon', 'fish', 'shrimp',
  'shiitake', 'enoki', 'eringi',
  'carrot', 'onion', 'cabbage', 'tomato', 'potato', 'eggplant', 'pepper', 'broccoli', 'leafy',
  'egg', 'tofu', 'beans', 'natto',
  'milk', 'soymilk', 'yogurt', 'cheese',
  'bottle', 'box',
  'pork', 'chicken', 'sausage',
  'rice', 'ricebag', 'bread', 'noodle', 'udon', 'soba', 'yakisoba', 'fruit',
  'nut', 'can', 'seaweed', 'daikon', 'negi', 'cucumber', 'pumpkin', 'corn', 'sprout', 'garlic', 'ginger', 'greens',
];

function caseBody(key) {
  const startNeedle = `case '${key}':`;
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error(`Missing case ${key}`);
  const returnStart = source.indexOf('return (', start);
  if (returnStart < 0) throw new Error(`Missing return for ${key}`);
  const bodyStart = source.indexOf('\n', returnStart) + 1;
  const nextCase = source.indexOf("\n    case '", bodyStart);
  const defaultCase = source.indexOf('\n    case \'box\':', bodyStart);
  let bodyEnd = nextCase < 0 ? defaultCase : nextCase;
  if (key === 'box') bodyEnd = source.indexOf('\n  }', bodyStart);
  if (bodyEnd < 0) throw new Error(`Missing end for ${key}`);
  return source.slice(bodyStart, bodyEnd);
}

function unwrapJsx(body) {
  let s = body;
  s = s.replace(/^\s*<>\s*/m, '').replace(/\s*<\/>\s*\);\s*$/m, '');
  s = s.replace(/^\s*\(/, '').replace(/\);\s*$/, '');
  return s.trim();
}

function toSvgMarkup(jsx) {
  let s = unwrapJsx(jsx);
  s = s.replace(/<([A-Z][A-Za-z]*)/g, (_, tag) => `<${tag.toLowerCase()}`);
  s = s.replace(/<\/([A-Z][A-Za-z]*)>/g, (_, tag) => `</${tag.toLowerCase()}>`);
  s = s.replace(/\sstrokeWidth=\{([0-9.]+)\}/g, ' stroke-width="$1"');
  s = s.replace(/\sstrokeLinecap="([^"]+)"/g, ' stroke-linecap="$1"');
  s = s.replace(/\sstrokeLinejoin="([^"]+)"/g, ' stroke-linejoin="$1"');
  s = s.replace(/\s([a-zA-Z][\w-]*)=\{([0-9.]+)\}/g, ' $1="$2"');
  s = s.replace(/\sfill=\{color \?\? '([^']+)'\}/g, ' fill="$1"');
  s = s.replace(/\sfill=\{"#ffffffaa"\}/g, ' fill="#ffffffaa"');
  s = s.replace(/\sfill=\{color \?\? "([^"]+)"\}/g, ' fill="$1"');
  s = s.replace(/\s*\/>/g, ' />');
  return s;
}

const cards = keys.map((key) => {
  const body = toSvgMarkup(caseBody(key));
  return `<article class="card ${['salmon','shrimp','shiitake','cabbage','potato','pepper','broccoli','leafy','negi','pumpkin','corn','garlic','greens','cheese','chicken','sausage'].includes(key) ? 'reworked' : ''}">
  <svg viewBox="0 0 40 40" role="img" aria-label="${key}">${body}</svg>
  <div>${key}</div>
</article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>今日飯 FoodIcon Gallery</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #FCFBF7; color: #28241f; }
    body { margin: 0; padding: 28px; background: #FCFBF7; }
    h1 { margin: 0 0 6px; font-size: 24px; line-height: 1.2; font-weight: 700; }
    p { margin: 0 0 22px; color: #6b6256; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 14px; }
    .card { min-height: 122px; border: 1px solid #e5dfd2; border-radius: 8px; background: #fffefa; display: grid; place-items: center; padding: 12px 8px 10px; box-sizing: border-box; }
    .card.reworked { border-color: #d9bd75; background: #fffaf0; }
    svg { width: 72px; height: 72px; display: block; overflow: visible; }
    .card div { margin-top: 8px; font-size: 12px; line-height: 1.2; color: #51483e; font-weight: 600; overflow-wrap: anywhere; text-align: center; }
  </style>
</head>
<body>
  <h1>今日飯 FoodIcon Gallery</h1>
  <p>All 48 Shape() icons. Warm cards mark the 16 reworked icons.</p>
  <main class="grid">
${cards}
  </main>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(outPath);
