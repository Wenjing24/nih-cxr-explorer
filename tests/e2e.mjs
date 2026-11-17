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
  await page.waitForSelector('.venn svg');
  const defaultSel = await page.locator('.finding-list label.on').allInnerTexts();
  check('default selection from Progress Book sketch', defaultSel.length === 2 && defaultSel[0].startsWith('Atelectasis'), defaultSel.join(', '));

  // select a third, then try a fourth (must be blocked)
  await page.getByLabel(/Effusion/).check({ force: true });
  await page.waitForTimeout(100);
  check('3 circles drawn after selecting Effusion', (await page.locator('.venn svg > circle').count()) === 6);
  const fourth = page.locator('.finding-list label', { hasText: 'Infiltration' }).locator('input');
  check('4th finding disabled at cap of 3', await fourth.isDisabled());
  check('URL holds selected findings', page.url().includes('f=Atelectasis%2CConsolidation%2CEffusion'), page.url());

  // region table sums to denominator
  const sums = await page.evaluate(() => {
    const num = (s) => +s.replace(/[^\d]/g, '');
    const rows = [...document.querySelectorAll('.region-table tbody tr')].map((tr) => num(tr.children[1].textContent));
    const denom = num(document.querySelector('.region-table tfoot td.num').textContent);
    return { total: rows.reduce((a, b) => a + b, 0), denom };
  });
  check('Venn regions + none = denominator', sums.total === sums.denom && sums.denom === 112120, JSON.stringify(sums));

  // hover the centre of the first circle -> tooltip
  const c = await page.locator('.venn svg > circle').first().boundingBox();
  await page.mouse.move(c.x + c.width * 0.3, c.y + c.height * 0.5);
  await page.waitForTimeout(100);
  check('hovering a Venn region shows a tooltip', await page.locator('.tooltip').isVisible());
  await page.mouse.click(c.x + c.width * 0.3, c.y + c.height * 0.5);
  check('clicking a region pins & highlights a table row', (await page.locator('.region-table tr.active').count()) === 1);
  await page.screenshot({ path: `${shots}interaction-venn.png` });

  // patient unit
  await page.getByRole('radio', { name: 'Patients' }).click();
  const denomP = await page.locator('.region-table tfoot td.num').first().innerText();
  check('patient unit denominator = 30,805', denomP === '30,805', denomP);

  // filters: female + age 20-39, AP
  await page.getByRole('radio', { name: 'Female' }).click();
  await page.getByRole('radio', { name: 'AP', exact: true }).click();
  await page.locator('.age-row input').nth(0).fill('20');
  await page.locator('.age-row input').nth(1).fill('39');
  await page.waitForTimeout(150);
  const summary = await page.locator('.filter-summary').innerText();
  check('filter summary F/AP/20–39 = 4,850 images (pandas)', summary.includes('4,850'), summary.replace(/\s+/g, ' '));

  // navigate: filters must persist across task pages
  for (const [label, route] of [['Findings by age', 'demographics'], ['Images per patient', 'images-per-patient'], ['View position', 'view-position']]) {
    await page.locator('.tabs a', { hasText: label }).click();
    await page.waitForSelector('.page h2');
    const sel = await page.locator('.finding-list label.on').count();
    const fem = await page.getByRole('radio', { name: 'Female' }).getAttribute('aria-checked');
    const age = await page.locator('.age-row input').nth(0).inputValue();
    check(`filters preserved on ${route}`, sel === 3 && fem === 'true' && age === '20', `sel=${sel} female=${fem} ageMin=${age}`);
    await page.screenshot({ path: `${shots}filtered-${route}.png`, fullPage: true });
  }
  // view page ignores view filter: n for Effusion should equal F/20-39 all views
  const viewDisabled = await page.evaluate(() => [...document.querySelectorAll('.filters fieldset')].some((f) => f.disabled && f.textContent.includes('View position')));
  check('view filter disabled on AP/PA page', viewDisabled);

  // reload keeps state from URL
  await page.reload();
  await page.waitForSelector('.page h2');
  check('reload restores filters from URL', (await page.locator('.finding-list label.on').count()) === 3);

  // empty results
  await page.goto(`${base}#/cooccurrence?f=Hernia&sex=F&view=PA&age=100-100`);
  await page.waitForSelector('.page h2');
  check('empty filter result shows message', await page.getByText('No images match the current filters').isVisible());
  await page.goto(`${base}#/cooccurrence?f=`);
  await page.waitForSelector('.page h2');
  check('no findings selected shows prompt', await page.getByText('Select 1–3 findings to compare').isVisible());
  await page.getByRole('button', { name: /Cardiomegaly · Effusion · Edema/ }).click();
  check('suggestion chip selects findings', (await page.locator('.finding-list label.on').count()) === 3);

  // clear filters
  await page.getByRole('button', { name: 'Clear filters' }).click();
  check('clear filters resets selection', (await page.locator('.finding-list label.on').count()) === 0);

  // demographics: toggles + tooltip
  await page.goto(`${base}#/demographics?f=Effusion`);
  await page.waitForSelector('.panel svg');
  await page.getByRole('radio', { name: '5 y' }).click();
  await page.getByRole('radio', { name: 'Count' }).click();
  const box = await page.locator('.panel svg').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.waitForTimeout(100);
  const tipText = (await page.locator('.tooltip').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('demographics hover shows male & female values', /Male/.test(tipText) && /Female/.test(tipText), tipText);

  // view position: all findings + sort
  await page.goto(`${base}#/view-position?f=`);
  await page.waitForSelector('.page h2');
  const rows = await page.locator('.row-label').count();
  check('AP/PA page with no selection lists 14 findings + No Finding + overall', rows === 16, `${rows} rows`);
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
  await mp.goto(`${base}#/view-position?f=Hernia`);
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
  await mp.goto(`${base}#/cooccurrence?f=Atelectasis,Consolidation`);
  await mp.waitForSelector('.venn svg');
  const clipped = await mp.evaluate(() => {
    const svg = document.querySelector('.venn svg').getBoundingClientRect();
    return [...document.querySelectorAll('.venn .set-label, .venn .set-sub')].some((t) => {
      const r = t.getBoundingClientRect();
      return r.left < svg.left - 1 || r.right > svg.right + 1;
    });
  });
  check('mobile: Venn set labels inside the chart', !clipped);
  await mp.screenshot({ path: `${shots}mobile-venn.png`, fullPage: true });
  await mctx.close();
} finally {
  await browser.close();
  server?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
