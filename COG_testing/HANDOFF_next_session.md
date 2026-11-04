# Handoff: COG vs ingested performance testing

Written at the end of the session of 2026-11-03 (local; the latest runs are labelled 2026-11-04 UTC). Read this first, then the "Headline results and implications" section at the top of `COG_migration_notes.md`.

## RESUME HERE (written the evening of 2026-11-04; testing paused mid-plan)

**Where the 13-run finishing plan stands.** Done: re-profile of the new `REG_TILES` (about 1.6 EECU·s), render profiles 5a and 5b (ING about 1.58, REG_FULL about 4.53 EECU·s for 21 map tiles), reflectance light run (run 14, clean). **Remaining: run 3, run 4, and the optional run 1b.** Then the separate end-user lessons summary (see "Standing deliverable" below; only when the user says testing is done). Results so far, with site-years and files, are in `COG_migration_notes.md` (sections "REDB test set", "Run 12", "Profiler runs, REDB", "Render profiles, REDB", "Run 13", "Run 14").

**Before any run:** reload the Code Editor tab (so no old run is active), paste the ENTIRE current script from disk into it (the Code Editor does not read this folder), press Run once, and never start a second run while one is going (every progress line carries a run id, `[xxxx]`; two ids in the console means two overlapping runs and invalid timings). Claude cannot run Earth Engine; never assume a run happened without pasted output. Save each run's CSV into `COG_testing/` (ask Claude to write it if the text file is not on disk).

### Run 3: heavy reflectance operations, wall-clock (matrix mode, Profiler OFF), about 30 requests, about 15 minutes

Script `cog_refl_perf_test.js`. Change only these settings (the rest stays at its defaults: `REG_FILTER_PROP = 'AOP_ID'`, `REG_ID = ING_ID = '2026_REDB_6'`, `FORMS = ['ING','BAND','PIX']`):
```js
var MODE = 'matrix';
var OP_LIST = ['bandsAll', 'points'];
var SIZES_KM = [1, 3];
var SCALES = [1, 10];
var REPS = 2;
var TILE_SCALE = 4;                      // applies to ALL forms
var ANCHOR = [-111.780094, 40.800975];   // must be set, not null
var RUN_LABEL = 'REDB_REFL_heavy_run1';
```
- **Question:** in the invalid run 13 (two overlapping runs), the band-interleaved form (BAND) failed with "User memory limit exceeded" for all 426 bands over 1 km at 1 m and for 1000 random pixels (all bands) over 3 km, while PIX and ING completed. Does `TILE_SCALE = 4` let BAND finish? (`bandsAll` 3 km at 1 m is skipped automatically as too large.)
- **Look for:** failures per form (paste the error text), timings for the cases that finish, ING vs PIX for `points` (PIX took 40 to 140 s in run 13 against 2 to 8 s for ING; the overlapping runs make those numbers unreliable).
- **Paste back:** the summary block and the CSV lines. Claude records it as run 15 and saves `results_2026-11-04_REFL_REDB_heavy_run1.csv`.

### Run 4: reflectance EECU, single mode (Profiler ON), six short runs

Same script, same file. Settings:
```js
var MODE = 'single';
var TILE_SCALE = 1;                      // default; if run 3 shows BAND needs 4 for bandsAll, also profile bandsAll at 4 for all three forms
var ANCHOR = [-111.780094, 40.800975];   // must be set, so the first request starts inside the script run and the Profiler records it
var SINGLE = {form: 'ING', op: 'bands3', sizeKm: 1, scale: 10};
```
Run it for `op: 'bands3'` and then `op: 'bandsAll'` (both `sizeKm: 1`, `scale: 10`), each with `form: 'ING'`, then `'BAND'`, then `'PIX'` (6 runs). For each: switch the Profiler on BEFORE pressing Run, press Run once, wait until the progress line `[id] 1/1 ...` and the summary appear, then copy the Profiler table.
- **Paste back:** the Profiler table (EECU·s, peak memory, counts; Claude sums the rows by hand because the Profiler shows rows, not a total) and the `1/1` progress line, for each of the six runs.
- **Compare with (REDB RGB, 5 km @10 m):** ING 0.46, REG 5.0, REG_TILES about 1.6 EECU·s. No prediction exists for reflectance; Claude records it as run 16.

### Run 1b (optional, 9 requests, about 2 minutes): wall-clock of the new `REG_TILES`

Script `cog_vs_ingested_perf_test.js` (paste the whole current file; it contains `TILES_CLIENT_COMBINE = true`). Settings: `MODE = 'matrix'`, `STAGING = false`, `REG_VERSIONS = ['REG']`, `ANCHOR_VERSION = 'REG'`, `REG_ID = ING_ID = '2026_REDB_6'`, `FORMS = ['ING','REG','REG_TILES']`, `PRODUCT_LIST = ['RGB']`, `OP_LIST = ['stats']`, `SIZES_KM = [5]`, `SCALES = {RGB: [10]}`, `EXTENT_OVERRIDE = {lon: -111.780094, lat: 40.800975, shortSideM: 7000}`, `REPS = 3`, `RUN_LABEL = 'REDB_RGB_REG_tiles_v2'`. Compare with run 12 (5 km @10 m: ING 0.4 s, REG 1.9 s, old REG_TILES 0.8 s). Needed only so the final summary does not quote the old REG_TILES timing.

### After the runs

1. Claude adds runs 15 and 16 (and 1b) to `COG_migration_notes.md` with site-year, files and conditions, and saves the CSVs.
2. Optional extras if time allows (not required): locate the 5 km maximum anomaly (REG 213 vs ING 160 at 32 m); profile `REG@REG` render; repeat the REG EECU run for spread.
3. When the user says testing is finished: write the separate end-user lessons summary (standing deliverable below).
4. Questions for the data owner to list in the summary, not runs: what differs in the tile metadata between `RGB/REG` and the `900` collections (asset load about 4.6 ms vs 0.14 ms), the `901` resampling, whether CHM stays NEAREST, whether the final reflectance tiles will carry `YEAR_SITE_VISIT` and wavelengths in the pixel-interleaved form.

**Repository state:** branch `cog-migration-test`, committed and pushed on 2026-11-04 (evening). `COG_testing/README_cog_vs_ingested_perf_test.pdf` (an out-of-date snapshot made by the user) was left uncommitted on purpose.

## Update, session of 2026-11-04 (details; the rest below dates from 2026-11-03)

- **New site REDB** (`2026_REDB_6`): registered RGB/CHM/DEM in `.../assets/{RGB,CHM,DEM}/REG` (shared with `2026_JERC_9`; RGB is the semi-final build with 63 and 32 m overviews), registered reflectance in `.../REFL/REG` (band-interleaved) and `.../testREFL/PIX` (pixel-interleaved; 50 tiles each, entire site, no `YEAR_SITE_VISIT` yet, select with `AOP_ID`). Ingested pairs: RGB `RGB/001/2026_REDB_6`, reflectance `HSI_REFL/002/2026_REDB_6` (BRDF); ingested CHM/DEM end at 2023. Details in `COG_migration_notes.md`, section "REDB test set".
- **Done:** paired RGB `stats` run on REDB (run 12, clean, CSV `results_2026-11-04_RGB_REDB_REG_run1.csv`); first reflectance run (run 13) is INVALID (the script was started twice at once).
- **New files:** `cog_redb_inventory.js` (v3 inventory), `cog_redb_anchor.js` (site centre from tile names, fast), `cog_refl_perf_test.js` (ING vs band-interleaved vs pixel-interleaved reflectance; ops `bands3/10/50/All`, `ndvi`, `spec_point`, `spec_poly`, `points`; has `TILE_SCALE` and a per-run id). Harness `cog_vs_ingested_perf_test.js` gained `EXTENT_OVERRIDE` (skip the slow footprint lookup) and stage timers; both scripts now write `site_year_*`, `source` columns to the CSV.
- **App:** `Display_AOP_Image_Collections_app_11G_COG_test.js` now has `COG_STAGING = false` (reads `{RGB,CHM,DEM}/REG`: JERC 2026 + REDB 2026; HOPB 2025 only in the older `test*/REG`). Not run by Claude.
- **EECU measured (single runs, REDB RGB `stats`, 5 km @10 m, 35 tiles):** ING about 0.46, REG about 5.0 (72% mosaic), REG_TILES about 3.9 (old implementation, about 45 aggregations re-evaluating the per-tile map). A repeat of the old REG_TILES gave about 4.1 (5% spread). Diagnosis revised: the per-tile reduction runs about 45 times per tile because `val()` reads the dictionary 15 x 3 times (1,576 `Image.select` = 35 x 45). `tilesStats` now returns one feature per tile (single `reduceRegion` each) and `combineTiles` combines in the browser (`TILES_CLIENT_COMBINE = true`). **Re-profiled: about 1.6 EECU·s (was 3.9 to 4.1), identical result.** Remember to paste the WHOLE updated script into the Code Editor after any change; the file on disk does not sync.
- **Render profile done (2026-11-04, REDB RGB, zoom 13, 21 map tiles, single runs):** ING about 1.58 EECU·s, REG_FULL@REG about 4.53 (2.9x; mosaic 43%, tile loads 26%). The Profiler keeps accumulating as tiles load, so copy it only when `Encoding pixels to image` stops changing. `REG@REG` render deliberately not run. Details in the notes ("Render profiles, REDB").
- **Reflectance light run done (run 14, clean, 126 requests, id `i74l`):** values agree across ING/BAND/PIX; registered 1.5x to 2.5x ING in small cases (about 1 s), 0.6x for `bands50` 3 km @1 m; no consistent BAND vs PIX winner. Raw data: `results_2026-11-04_REFL_REDB_light_run1.csv` in this folder. Remaining reflectance runs: heavy ops with `TILE_SCALE = 4` (run 15) and EECU single mode (run 16).
- **(Superseded by "RESUME HERE" above.) Agreed finishing plan (2026-11-04, about 12 more runs):** (1b) optional 9-request matrix to time the new REG_TILES at 5 km @10 m; (5) render profile RGB, `ING` vs `REG_FULL@REG`, zoom 13 (is the Profiler capturing map tiles?); (2) clean reflectance wall-clock, light ops, `REPS = 3`; (3) heavy ops (`bandsAll` 1 km @10 m, `points` 1 km), `TILE_SCALE = 4`, `REPS = 2`; (4) reflectance EECU single mode: `bands3` and `bandsAll` 1 km @10 m x ING/BAND/PIX (needs `ANCHOR` set, not null, so the first request starts inside the script run). Not planned: REDB lidar timing, 2000 px tiles, GRSM, full-cube exports. Details in the notes ("Profiler runs, REDB").
- **(Superseded by "RESUME HERE" above.) Next, in order:** (1) re-profile the new REG_TILES (and check its result still matches: G mean 85.41157, SD 19.22572, `n` 240255); then repeat each form once for spread; (2) clean reflectance rerun (one copy; light ops first, then `bandsAll` and `points` with `TILE_SCALE = 4`), then single-mode EECU for `bands3` 1 km @10 m, `spec_point`, `bandsAll` 1 km @10 m; (3) locate the 5 km maximum anomaly (REG 213 vs ING 160 at 32 m); (4) render profile (`op: 'render'`); (5) REDB CHM/DEM timing against `2023_REDB_5` (timing only).
- **Standing deliverable (user request, 2026-11-04):** when testing is finished, write a SEPARATE summary of the headline lessons learned and what they mean for an end user accessing and analysing AOP data, comparing ingested and registered images. Not started on purpose; the notes' headline section is the evidence base. Track the site-year and image files used for every result quoted.
- **Rules that still apply:** one run at a time; reload the tab to stop a run; Profiler on before Run for single mode; never assume a run happened without pasted output.

## Where we are in one paragraph

We are comparing NEON AOP data stored as ingested Earth Engine images with the same data registered as 1 km Cloud Optimized GeoTIFF (COG) tiles. Test site-year: `2026_JERC_9` (paired: both forms exist for RGB, CHM and DEM). A Code Editor harness (`cog_vs_ingested_perf_test.js`) times common analyses (wall-clock) and, in single mode, reports compute (EECU-seconds) through the Profiler. Main finding so far: registered data is about as fast as ingested for small regions and for expensive native-scale work, but 5x to 12x slower in wall-clock and about 17x to 26x more compute for coarse-scale statistics over large regions, almost entirely because of the `ImageCollection.mosaic` step. Reducing each tile separately without mosaicking (`REG_TILES`) removes most of that in wall-clock time. Overview resampling (NEAREST vs averaged) changes coarse-scale statistics. The user runs the scripts in the Code Editor and pastes the output back; Claude cannot run Earth Engine.

## Files in this folder

| File | What it is |
|---|---|
| `COG_migration_notes.md` | The running record: headline results and implications (top), collection specs, then Runs 1 to 11 and the Profiler runs in detail. Source of truth for numbers. |
| `cog_vs_ingested_perf_test.js` | The Code Editor test harness (matrix mode, single mode with Profiler, centres mode, render case). |
| `README_cog_vs_ingested_perf_test.md` | Plain-English description of what the harness does, why each analysis is included, how to run it, variability advice. |
| `cog_collection_inventory.js` | Prints tile counts, site-years and first-tile properties of the registered collections. |
| `results_2026-11-03_CHM_JERC2026_run1.csv`, `results_2026-11-03_RGB_JERC2026_9km_run3.csv` | The only raw CSVs saved. Runs 2 and 4 to 11 exist only in the Code Editor console output (the user's console, not in this folder). |
| `README_cog_vs_ingested_perf_test.pdf` | A PDF snapshot of an earlier README, created by the user; out of date. |
| `HANDOFF_next_session.md` | This file. |
| `../Display_AOP_Image_Collections_app_11G_COG_test.js` | The viewer test build that reads registered RGB/CHM/DEM; stays in the parent folder. |

## Key facts to have in your head

**Collections** (non-prod project `projects/neon-nonprod-earthengine/assets`, `test{RGB|CHM|DEM}/<version>`; ingested paths `projects/neon-prod-earthengine/assets/{RGB|CHM|DEM}/001`, image id `2026_JERC_9`):

| Version | Content | Overviews / resampling |
|---|---|---|
| `900` | Whole JERC 2026 (359 RGB, 352 CHM/DEM tiles), legacy build | 8 overviews, NEAREST for every product |
| `901` | 10 x 10 km JERC block (100 tiles) | `ceil` layout, RGB/DTM averaged (spec cell says "same as above"; data shows RGB averaged), 8 RGB overviews, 5 lidar overviews. Probably the final spec. |
| `902` | Whole JERC, SJER 2026, HOPB 2025 | Rounded down, CHM NEAREST, DTM/DSM/RGB averaged |
| `REG` | HOPB 2025 + JERC 2026 | Aligned cap: RGB 4 overviews, lidar 3 |
| unprefixed `{RGB,CHM,DEM}/REG` | Empty (0 tiles) although the spec table lists sites | |

**Geometry for single-mode runs:** anchor `[-84.463513, 31.244943]` is the centre of the `900` RGB footprint (use for `900`/`902` and large regions); `[-84.469531, 31.240337]` is the centre of the `901` block (use for 9 km regions that must fit inside `901`). 20 km regions fit only in `900`/`902` and the ingested image (shorter sides about 21 km).

**Measured Profiler numbers (RGB `stats` at 10 m, single runs):** ING 9 km 1.46 EECU·s, 20 km about 6.5; REG@901 9 km about 25.4; REG@900 9 km 23.8; REG@900 20 km about 171 (about 95% is the mosaic); REG_FULL@901 9 km 27.6; REG_TILES (first implementation) 20 km 34.6. Quota context: Community tier is 150 EECU-hours per month (540,000 EECU·s), charged to the project making the request; Earth Engine Apps are charged to the app's parent project (see the headline section for sources).

## State of the harness (what changed during the session; what is untested)

- Forms: `ING`, `REG@<v>`, `REG_FULL@<v>`, `REG_TILES@<v>` (stats only). Shared anchor, rotated form order per repeat, cache busting via a unique image property (a collection filter alone did NOT stop result caching for the single ingested image).
- Summary shows median with fastest-slowest and ratio to ING; CSV has a `run` column (`RUN_LABEL`, defaults to the date and time). A "Statistics by form" block compares mean, standard deviation and maximum with ING.
- `REG_TILES` was rewritten twice. Current version: per tile count, mean, variance, min, max; combined with count weighting; empty edge tiles get neutral values; returns total count `n` and a case with `n = 0` is recorded as an error. It works for RGB and CHM (run 11), but it is 2x to 4x slower in wall-clock time than the first version (which was fast, 34.6 EECU·s, and biased the mean about 0.2% low). Its EECU has not been measured.
- **Single mode `op: 'render'` (map-tile rendering for the Profiler) has never been run.** Whether the Profiler records map tiles in the same table is unknown.
- `REG_VERSIONS` accepts any collection name, but `'REG'` and `'902'` as version names have never been run.
- Defaults in the file (CHM, stats/focal/plots, 1 and 9 km, versions 901 and 900) are only defaults; the user pastes their own CONFIG each time.
- **Operating rules learned the hard way:** do not press Run again while a run is going (the old run keeps executing and contaminates timings; reload the tab to stop it); single mode needs `SINGLE.anchor`; the Profiler must be switched on before Run; wall-clock single repeats can be off by 2x to 7x, so compare medians and ignore differences under about 25%.

## Suggested runs (revise as results arrive)

In rough priority order. Matrix = wall-clock, single = Profiler EECU.

1. **EECU of the current `REG_TILES` at 20 km** (single). `SINGLE = {form: 'REG_TILES@900', product: 'RGB', op: 'stats', sizeKm: 20, scale: 10, anchor: [-84.463513, 31.244943]}`, `REG_VERSIONS = ['900']`. Check `n` > 0. Compare with 34.6 (first version), 171 (mosaic), 6.5 (ING). Look at the operation counts in the Profiler: if tiny server operations dominate, try the weighted-reducer variant (each tile returns count, mean, variance, min, max unchanged; combine with `reduceColumns` weighted mean of the means plus weighted variance of the means; untested idea, check that `variance()` accepts weights).
2. **Render profile** (single, `op: 'render'`): ING vs `REG_FULL@901`, RGB, 9 km, `zoom: 13`, anchor `[-84.469531, 31.240337]`, identical map panel size and zoom. First check that the Profiler captures tiles; then repeat for CHM. This is the measurement that matters most for the viewer's quota.
3. **EECU repeatability** (single): repeat `REG@900` 20 km, `ING` 20 km and `REG_TILES@900` 20 km 2 more times each; note the spread.
4. **Version `902` comparison** (matrix, then single): `REG_VERSIONS = ['902', '900']`, `ANCHOR_VERSION = '902'`, RGB and CHM `stats`, 9 and 20 km, 10 m, forms `ING`, `REG`, `REG_TILES`. Then EECU of `REG@902` at 20 km. 902 is the averaged, rounded-down build for the whole site and the cleanest comparison for statistics.
5. **Lidar EECU** (single): CHM `stats`, 9 km, 10 m, `ING` vs `REG@901` vs `REG_TILES@901`, to see whether lidar behaves like RGB in compute.
6. **Overview-depth check** (matrix): add the aligned-cap collection `REG` (4 RGB overviews) to `REG_VERSIONS`, RGB `stats`, 9 km, scales 1, 2, 10, 100 m; it should be much slower at 10 m if overview depth matters. Unverified that `'REG'` works as a version name.
7. **Variability** (matrix, several times on different days or hours): fixed benchmark `FORMS = ['ING','REG','REG_TILES']`, `REG_VERSIONS = ['900']`, RGB and CHM, 9 and 20 km, 10 m, 5 repeats, with `RUN_LABEL` set. Runs 6, 7, 8 and 11 already show registered medians within about 15% to 25% over one day.
8. **More operations** (matrix): `hist`, `points`, and `math` for RGB and DSM at native scale and 10 m (not run yet; `focal` and `plots` were run for CHM only). DTM `focal` (slope) not run.
9. **`REG_FULL@900` EECU** (single) at 20 km: it also reads all 359 tile footprints.
10. **When available:** (a) the 2000 x 2000 px (20000 for RGB) COG set: repeat the Run 6 size sweep and the 9/20 km profiles; tiles touched drive the cost, so this is the key test of the tile size. (b) REDB or HOPB/JERC registered HSI and BRDF data (426 bands): band-subset scaling (3, 10, 50, all bands), spectrum extraction, a spectral index, full-cube export; check whether the COGs are band- or pixel-interleaved. (c) The largest site (GRSM checklist in the notes) to see how cost grows beyond about 356 tiles.

## Open questions

For the user / data owner:
- What is the `901` resampling really (the spec cell says "same as above")? Data say averaged for RGB and DTM.
- Why are the unprefixed `{RGB,CHM,DEM}/REG` collections empty, and is "2025_JERC_9" in that row a typo?
- Why does `901` cost far more per asset load than `900` (about 3.8 ms vs 0.14 ms of EECU per load)? Different tile metadata?
- Which Cloud project and quota tier does the viewer's compute use, and what is its traffic?
- Is NEAREST for CHM intended to stay (it makes coarse-scale CHM standard deviation, maximum and focal results differ from ingested)?

For the notes (housekeeping):
- Save raw CSVs from the console for the clean runs (8, 11) if wanted; Runs 2 and 4 to 11 are not in the folder.
- The "Decisions" section still says to keep the capped-overview collections; it is flagged as outdated in the headline section but not rewritten.
- If the headline results change after tomorrow's runs, update the headline section, not only the run sections.

## Known pitfalls in the results

- Early ingested timings (before the cache fix) are invalid; Run 2 is documented as such.
- Run 9's "backend stall" and Run 10 were affected by overlapping runs; Run 11 replaces Run 10.
- NEAREST overviews (`900` for all products, CHM everywhere) give biased or noisy coarse-scale statistics; at native scale all forms agree to about 15 digits.
