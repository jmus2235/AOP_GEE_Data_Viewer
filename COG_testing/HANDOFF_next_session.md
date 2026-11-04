# Handoff: COG vs ingested performance testing

Written at the end of the session of 2026-11-03 (local; the latest runs are labelled 2026-11-04 UTC). Read this first, then the "Headline results and implications" section at the top of `COG_migration_notes.md`.

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
