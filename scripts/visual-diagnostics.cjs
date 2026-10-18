// Temporary failure-only diagnostics; remove after inspecting runner rendering.
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('../node_modules/playwright-core/lib/utilsBundle.js');
for (const dir of fs.readdirSync('test-results-visual', { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const root = path.join('test-results-visual', dir.name);
  const file = fs.readdirSync(root).find((name) => name.endsWith('-diff.png'));
  if (!file) continue;
  const name = file.replace('-diff.png', '');
  const diff = PNG.sync.read(fs.readFileSync(path.join(root, file)));
  const tiles = new Map();
  for (let y = 0; y < diff.height; y++)
    for (let x = 0; x < diff.width; x++) {
      const i = (y * diff.width + x) * 4;
      if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
        const key = `${Math.floor(x / 128)},${Math.floor(y / 128)}`;
        tiles.set(key, (tiles.get(key) || 0) + 1);
      }
    }
  const ranked = [...tiles].sort((a, b) => b[1] - a[1]);
  console.log('VISUAL_DIFF_TILES', JSON.stringify({ name, tiles: ranked }));
  if (!name.endsWith('-light')) continue;
  const actual = PNG.sync.read(fs.readFileSync(path.join(root, `${name}-actual.png`)));
  const expected = PNG.sync.read(fs.readFileSync(`tests/visual/baselines/${name}.png`));
  for (const [tile] of ranked.slice(0, 3)) {
    const [tx, ty] = tile.split(',').map(Number);
    const width = Math.min(128, diff.width - tx * 128);
    const height = Math.min(128, diff.height - ty * 128);
    const crop = new PNG({ width: width * 3, height });
    [expected, actual, diff].forEach((source, index) => {
      PNG.bitblt(source, crop, tx * 128, ty * 128, width, height, width * index, 0);
    });
    console.log(
      'VISUAL_CROP',
      JSON.stringify({ name, tile, data: PNG.sync.write(crop).toString('base64') }),
    );
  }
}
