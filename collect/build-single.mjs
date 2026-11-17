// Packs the whole presentation into ONE file, presentation.html, with styles, scripts, data and
// images inside it. That file can be copied anywhere and opened by double-click.
import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname;
const site = root + 'site/';
const text = (f) => readFile(site + f, 'utf8');
const dataUri = async (f) => 'data:image/jpeg;base64,' + (await readFile(site + f)).toString('base64');

let html = await text('index.html');
let data = await text('data.js');
for (const f of ['assets/guess/ikea.jpg', 'assets/guess/netflix.jpg', 'assets/guess/supermarket.jpg']) {
  if (!data.includes(f)) throw new Error('not referenced: ' + f);
  data = data.split(f).join(await dataUri(f));
}
const swap = (from, to) => { if (!html.includes(from)) throw new Error('missing: ' + from); html = html.replace(from, () => to); };
swap('<link rel="stylesheet" href="style.css">', '<style>\n' + (await text('style.css')) + '</style>');
swap('<script src="data.js"></script>', '<script>\n' + data + '</script>');
swap('<script src="app.js"></script>', '<script>\n' + (await text('app.js')) + '</script>');
if (/(src|href)="(?!data:)[^"#]+"/.test(html)) throw new Error('an external reference is left');
await writeFile(root + 'presentation.html', html);
console.log('presentation.html', (html.length / 1048576).toFixed(1) + ' MB');
