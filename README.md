# NIH Chest X-Ray Explorer

An interactive web prototype for exploring the **NIH ChestX-ray14** metadata (`Data_Entry_2017.csv`: 112,120 images from 30,805 patients). It follows the final decisions and sketches in the BMI 706 Progress Book. Only the metadata is used; no X-ray images are loaded.

| # | Page | What it shows | Unit |
|---|------|---------------|------|
| 1 | Overview | Patients by recorded gender, patients by age, patients by number of images, images by view position, how often each finding occurs | patients / images (labelled on each chart) |
| 2 | Variables vs. complexity | Number of findings per image by view (PA/AP lines), age × complexity (100% stacked), mean findings by age, images per patient by age (colour = mean findings) | images / patients |
| 3 | Finding co-occurrence | Interactive UpSet plot for 1–3 findings, an exact-intersection table and conditional rates | images **or** patients (toggle) |
| 4 | Findings by age & gender | Prevalence (or count) by 5- or 10-year age bin, male (solid) vs female (dashed), one panel per finding | % / # of images **or** patients |
| 5 | Images per patient | Histogram of images per patient for patients with each finding, with an all-patient reference | patients |
| 6 | View position (AP/PA) | 100% stacked AP/PA bars per finding, with [n] image counts and the overall AP share | % of images |

Pages 3–6 share one filter state: up to 3 findings, recorded gender, view position and an age range. The state is kept when you switch pages and is written to the URL, so a reload or a shared link restores it. Page 6 ignores the view-position filter, since applying it would make every bar a single colour.

Charts use a colour-blind-safe, Viridis-derived palette. Line styles, labels and UpSet membership dots provide redundant encodings where series need to be distinguished.

## Data handling

* The original CSV is **only read**. `preprocess/preprocess.py` (pandas) writes a compact column table to `public/data/images.json`. Each image's 14 findings are stored as a bitmask, and patient IDs are mapped to an index.
* Recorded ages above 100 (16 images, with values 148–414) are data-entry errors and are treated as **missing**. They are included while the age filter covers its full range and excluded once you narrow it. The UI says this.
* The data has no missing gender or view values, but the code handles them (`-1`).
* Patient-level age (pages 1–2) is the age at the patient's earliest image with a plausible age.
* Empty selections and filter combinations with no matches show explanatory empty states.

## Setup

Requirements: Node ≥ 18 and Python 3 with pandas (pandas is only needed to regenerate the data).

```bash
npm install
npm run preprocess        # optional: regenerates public/data/images.json and tests/reference.json
                          # from ../Data_Entry_2017.csv (or: python3 preprocess/preprocess.py path/to/csv)
npm run dev               # http://localhost:5173
npm run build             # static site in dist/
```

## Tests

```bash
npm test                  # 43 unit tests: TypeScript aggregations vs. independent pandas results
npx playwright install chromium
npm run build && npm run e2e   # 54 browser checks on desktop + phone widths, screenshots in tests/screenshots/
```

## Deploying to GitHub Pages

The repository includes `.github/workflows/deploy.yml`. On every push to `main` it runs the tests, builds the site and publishes it.

1. Create an empty **public** repository on GitHub, e.g. `nih-cxr-explorer`.
2. `git remote add origin https://github.com/<you>/nih-cxr-explorer.git && git push -u origin main`
3. On GitHub, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**. If the first run started before this was set, re-run it from the Actions tab.
4. The site is published at `https://<you>.github.io/nih-cxr-explorer/`. The build uses relative paths, so any repository name works.

## Data source and citation

NIH ChestX-ray14: [original download site](https://nihcc.app.box.com/v/ChestXray-NIHCC), courtesy of the **NIH Clinical Center**.

> X. Wang, Y. Peng, L. Lu, Z. Lu, M. Bagheri, R. M. Summers. "ChestX-ray8: Hospital-scale Chest X-ray Database and Benchmarks on Weakly-Supervised Classification and Localization of Common Thorax Diseases." *IEEE CVPR*, 2017, pp. 3462–3471. doi:10.1109/CVPR.2017.369

The finding labels were text-mined from radiology reports and are imperfect. This is a course prototype and is not for clinical use.
