// End-to-end check of the built app in headless Chromium.
// Usage: node tests/e2e.mjs [baseUrl]   (default: starts `vite preview` on :4317)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const ROUTES = ['overview', 'complexity', 'cooccurrence', 'demographics', 'images-per-patient', 'view-position'];
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

let server;
let base = process.argv[2];
if (!base) {
  base = 'http://localhost:4317/';
  server = spawn('npx', ['vite', 'preview', '--port', '4317', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  for (const vp of [{ name: 'desktop', width: 1400, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const r of ROUTES) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('.page h2', { timeout: 20000 });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`${vp.name} ${r}: no horizontal page scroll`, overflow <= 0, `overflow ${overflow}px`);
      const svgs = await page.locator('main svg').count();
      check(`${vp.name} ${r}: charts rendered`, svgs > 0, `${svgs} svg`);
      await page.screenshot({ path: `${shots}${vp.name}-${r}.png`, fullPage: true });
    }
    check(`${vp.name}: no console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------------------ interactions (desktop)
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}#/cooccurrence`);
  await page.waitForSelector('.upset svg');
  const defaultSel = await page.locator('.finding-list label.on').allInnerTexts();
  check('co-occurrence default = 5 most common findings', defaultSel.length === 5 && defaultSel[0].startsWith('Infiltration'), defaultSel.map((t) => t.split('\n')[0]).join(', '));
  check('UpSet draws one matrix row per selected finding', (await page.locator('.upset-set').count()) === 5);

  // no cap: select all 14
  await page.getByRole('button', { name: 'Select all 14' }).click();
  await page.waitForTimeout(150);
  check('all 14 findings selectable', (await page.locator('.finding-list label.on').count()) === 14 && (await page.locator('.upset-set').count()) === 14);
  check('URL holds selected findings', /f=Infiltration%2CEffusion%2CAtelectasis%2CNodule%2CMass%2C/.test(page.url()), page.url().slice(0, 120));

  // combinations + none = denominator (show all columns)
  await page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'All', exact: true }).click();
  await page.waitForTimeout(200);
  const sums = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.upset-col')].map((g) => +g.getAttribute('data-count'));
    const none = +document.querySelector('[data-testid=none-count]').textContent.replace(/[^\d]/g, '');
    const denom = +document.querySelector('.upset svg').getAttribute('data-denominator');
    return { cols: cols.length, total: cols.reduce((a, b) => a + b, 0) + none, denom };
  });
  check('UpSet: all 800 combinations + none = 112,120 images (pandas)', sums.cols === 800 && sums.total === sums.denom && sums.denom === 112120, JSON.stringify(sums));
  await page.getByRole('radio', { name: 'Top 15' }).click();
  check('Top 15 limits the columns', (await page.locator('.upset-col').count()) === 15);

  // hover a column -> tooltip; click -> pinned details
  const col = page.locator('.upset-col').first();
  const cb = await col.locator('.upset-bar').boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForTimeout(100);
  const tipText = (await page.locator('.tooltip').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('hovering an UpSet column shows a tooltip', /exactly this combination/.test(tipText), tipText);
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
  const detail = (await page.locator('[data-testid=combo-detail]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('clicking a column pins its details', (await page.locator('.upset-col.pinned').count()) === 1 && /Infiltration only.*9,547 images/.test(detail), detail.slice(0, 80));
  // click a set name -> conditional panel
  await page.locator('.upset-set', { hasText: 'Effusion' }).click();
  check('clicking a finding name updates the conditional panel', /Given Effusion/.test(await page.locator('[data-testid=conditional]').innerText()));
  await page.screenshot({ path: `${shots}interaction-upset.png`, fullPage: true });

  // patient unit
  await page.getByRole('radio', { name: 'Patients' }).click();
  const denomP = await page.locator('.upset svg').getAttribute('data-denominator');
  check('patient unit denominator = 30,805', denomP === '30805', denomP);

  // filters: female + age 20-39, AP
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByRole('radio', { name: 'AP', exact: true }).click();
  await page.locator('.age-row input').nth(0).fill('20');
  await page.locator('.age-row input').nth(1).fill('39');
  await page.waitForTimeout(150);
  const summary = await page.locator('.filter-summary').innerText();
  check('filter summary F/AP/20–39 = 4,850 images (pandas)', summary.includes('4,850'), summary.replace(/\s+/g, ' '));

  // independent filters: other task pages keep their own defaults
  for (const [label, route] of [['Findings by age', 'demographics'], ['Images per patient', 'images-per-patient']]) {
    await page.locator('.tabs a', { hasText: label }).click();
    await page.waitForSelector('.page h2');
    const sel = await page.locator('.finding-list label.on').count();
    const fem = await page.getByRole('radio', { name: 'Female' }).getAttribute('aria-checked');
    const age = await page.locator('.age-row input').nth(0).inputValue();
    check(`${route} has its own independent filters`, sel === 2 && fem === 'false' && age === '0', `sel=${sel} female=${fem} ageMin=${age}`);
  }
  await page.getByRole('radio', { name: 'Male', exact: true }).click();
  await page.locator('.tabs a', { hasText: 'Finding co-occurrence' }).click();
  await page.waitForSelector('.upset svg');
  {
    const fem = await page.getByRole('radio', { name: 'Female' }).getAttribute('aria-checked');
    const age = await page.locator('.age-row input').nth(0).inputValue();
    const sel = await page.locator('.finding-list label.on').count();
    check('co-occurrence filters kept after visiting other pages', fem === 'true' && age === '20' && sel === 14, `female=${fem} age=${age} sel=${sel}`);
  }
  await page.locator('.tabs a', { hasText: 'Images per patient' }).click();
  await page.waitForSelector('.page h2');
  check('images-per-patient kept its own Male filter', (await page.getByRole('radio', { name: 'Male', exact: true }).getAttribute('aria-checked')) === 'true');

  // view position page: no filters at all
  await page.locator('.tabs a', { hasText: 'View position' }).click();
  await page.waitForSelector('.page h2');
  check('AP/PA page has no filter panel', (await page.locator('.filters').count()) === 0);
  check('AP/PA page shows 14 findings + No Finding + all images', (await page.locator('.row-label').count()) === 16);

  // reload keeps state from URL
  await page.goto(`${base}#/cooccurrence?f=Edema,Hernia&sex=F`);
  await page.reload();
  await page.waitForSelector('.page h2');
  check('reload restores filters from URL', (await page.locator('.finding-list label.on').count()) === 2 && (await page.getByRole('radio', { name: 'Female' }).getAttribute('aria-checked')) === 'true');

  // empty results
  await page.goto(`${base}#/cooccurrence?f=Hernia&sex=F&view=PA&age=100-100`);
  await page.waitForSelector('.page h2');
  check('empty filter result shows message', await page.getByText('No images match the current filters').isVisible());
  await page.goto(`${base}#/cooccurrence?f=`);
  await page.waitForSelector('.page h2');
  check('no findings selected shows prompt', await page.getByText('Select findings to compare').isVisible());
  await page.getByRole('button', { name: /Cardiomegaly · Effusion · Edema/ }).click();
  check('suggestion chip selects findings', (await page.locator('.finding-list label.on').count()) === 3);

  // clear filters
  await page.getByRole('button', { name: 'Clear filters' }).click();
  check('clear filters resets selection', (await page.locator('.finding-list label.on').count()) === 0);

  // linear only + marker shapes
  await page.goto(`${base}#/overview`);
  await page.waitForSelector('.page h2');
  check('overview: no log/linear toggle', (await page.getByRole('radio', { name: 'Log' }).count()) === 0);
  await page.goto(`${base}#/complexity`);
  await page.waitForSelector('.page h2');
  check('complexity: no log/linear toggle', (await page.getByRole('radio', { name: 'Log' }).count()) === 0);
  const shapes = await page.evaluate(() => {
    const d = [...document.querySelectorAll('path.dot')].map((p) => p.getAttribute('d'));
    return { tri: d.filter((x) => x.endsWith('Z')).length, circ: d.filter((x) => x.includes('a')).length };
  });
  check('PA circles vs AP triangles on the complexity line chart', shapes.tri === 10 && shapes.circ === 10, JSON.stringify(shapes));
  // magnifier: hover the k=8 point -> zoom box with exact small counts
  const p8 = await page.evaluate(() => { const d = [...document.querySelectorAll('.view-lines path.dot')][8].getBoundingClientRect(); return { x: d.x + d.width / 2, y: d.y }; });
  await page.mouse.move(p8.x, p8.y - 4);
  await page.waitForTimeout(120);
  const mag = await page.evaluate(() => [...document.querySelectorAll('.magnifier .mag-val')].map((t) => t.textContent));
  check('hovering small points opens a magnifier with exact counts (k=7–9)', mag.join(',') === '9,0,1,7,1,1', mag.join(','));
  await page.mouse.move(p8.x - 600, p8.y - 150);
  await page.waitForTimeout(80);
  check('magnifier hides away from the small points', (await page.locator('.magnifier').count()) === 0);

  // demographics: toggles + tooltip
  await page.goto(`${base}#/demographics?f=Effusion`);
  await page.waitForSelector('.panel svg');
  await page.getByRole('radio', { name: '5 y' }).click();
  await page.getByRole('radio', { name: 'Count' }).click();
  const box = await page.locator('.panel svg').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.waitForTimeout(100);
  const tipText2 = (await page.locator('.tooltip').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('demographics hover shows male & female values', /Male/.test(tipText2) && /Female/.test(tipText2), tipText2);
  await page.getByRole('button', { name: 'Select all 14' }).click();
  await page.waitForTimeout(200);
  check('demographics: all 14 findings -> 14 panels', (await page.locator('.panel').count()) === 14);

  // view position: all findings + sort
  await page.goto(`${base}#/view-position`);
  await page.waitForSelector('.page h2');
  await page.getByRole('radio', { name: 'A–Z' }).click();
  const first = await page.locator('.row-label').first().textContent();
  check('A–Z sort', first.includes('Atelectasis'), first);

  // images per patient: toggle count
  await page.goto(`${base}#/images-per-patient?f=Hernia,Pneumonia`);
  await page.waitForSelector('.panel svg');
  check('IPP: reference + 2 finding panels', (await page.locator('.panel').count()) === 3);
  await page.getByRole('radio', { name: '# patients' }).click();
  check('IPP: count mode y label', await page.getByText('# patients', { exact: true }).first().isVisible());

  // keyboard: tab into a bar shows tooltip
  await page.goto(`${base}#/overview`);
  await page.waitForSelector('.bar');
  await page.locator('rect.bar').first().focus();
  check('keyboard focus on a bar shows tooltip', await page.locator('.tooltip').isVisible());
  await ctx.close();

  // ------------------------------------------------------------ mobile interactions
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(`${base}#/images-per-patient?f=Hernia`);
  await mp.waitForSelector('.page h2');
  await mp.waitForTimeout(400);
  const navOk = await mp.evaluate(() => {
    const a = document.querySelector('.tabs a.active').getBoundingClientRect();
    return a.left >= 0 && a.right <= window.innerWidth + 1;
  });
  check('mobile: active tab scrolled into view', navOk);
  check('mobile: filters collapsed by default with summary', (await mp.locator('.closed-summary').innerText()).includes('Hernia'));
  await mp.getByRole('button', { name: 'Edit filters' }).click();
  await mp.locator('.finding-list label', { hasText: 'Edema' }).click();
  check('mobile: filter panel opens and selection works', (await mp.locator('.finding-list label.on').count()) === 2);
  await mp.goto(`${base}#/cooccurrence?f=${'Infiltration,Effusion,Atelectasis,Nodule,Mass,Pneumothorax,Consolidation,Pleural_Thickening,Cardiomegaly,Emphysema,Edema,Fibrosis,Pneumonia,Hernia'}`);
  await mp.waitForSelector('.upset svg');
  await mp.waitForTimeout(300);
  const fits = await mp.evaluate(() => {
    const box = document.querySelector('.upset').getBoundingClientRect();
    const svg = document.querySelector('.upset svg').getBoundingClientRect();
    return { box: Math.round(box.width), svg: Math.round(svg.width) };
  });
  check('mobile: 14-finding UpSet (top 15) fits the screen', fits.svg <= fits.box + 1, JSON.stringify(fits));
  await mp.screenshot({ path: `${shots}mobile-upset.png`, fullPage: true });
  await mctx.close();
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
