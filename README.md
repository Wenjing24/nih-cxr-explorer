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

On Windows, open PowerShell in the repository directory and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

No prior Conda, Python, Node.js or npm installation is required. The script
downloads isolated copies of uv, Python 3.11 and the current Node.js LTS release
into this repository, creates `.venv`, installs the Python dependencies from
`requirements.txt`, installs the web dependencies and starts the development
server. An internet connection is required the first time it runs.

Open the URL shown in the terminal, normally <http://localhost:5173>. Press
`Ctrl+C` to stop the server. The preprocessed data is already included, so the
original CSV is only needed when regenerating it.

Additional commands:

```powershell
.\.tools\node\npm.cmd run preprocess   # optional: regenerate the JSON data
.\.tools\node\npm.cmd run build        # create the static site in dist/
```

To preprocess a CSV in another location, append its path after `--`, for example:

```powershell
.\.tools\node\npm.cmd run preprocess -- C:\data\Data_Entry_2017.csv
```

## Tests

```powershell
.\.tools\node\npm.cmd test
.\.tools\node\npx.cmd playwright install chromium
.\.tools\node\npm.cmd run build
.\.tools\node\npm.cmd run e2e
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
