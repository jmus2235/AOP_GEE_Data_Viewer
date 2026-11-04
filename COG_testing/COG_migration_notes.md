# AOP GEE Data Viewer: COG migration notes

Working notes for moving the viewer from ingested images to registered COG tile collections.
Test build: `Display_AOP_Image_Collections_app_11G_COG_test.js` (copy of 11G; 11G is unchanged).
Last updated: 2026-11-03.

## Headline results and implications (as of 2026-11-03)

Evidence is detailed in the run sections below. All timings come from one site-year (JERC 2026, ingested vs registered), products RGB, CHM and DTM, mostly `stats` over regions of 1 to 20 km. Profiler (EECU) numbers are single runs.

### Headline results

1. **Correctness.** At native pixel size, registered and ingested values agree to about 15 digits for every product and every registered collection, so the tile mosaics are correct.
2. **Wall-clock performance.** For regions up to about 3 km (up to 17 tiles) registered is within about 1x to 2x of ingested. At native scale over a 9 km region it is about 1.0x to 2.3x. At coarse scales over large regions it is 5x to 17x slower (9 km at 10 m: RGB about 7x, CHM and DTM 7x to 17x). The whole JERC site (about 356 tiles) at 10 m takes about 8 to 12 s registered against about 1.5 s ingested. For expensive native-scale operations the gap closes: CHM focal maximum at 1 m over 9 km took 14 to 19 s registered against 16 s ingested, and CHM plot extraction (100 plots) was 1.2x to 1.4x.
3. **Compute (EECU) is the larger gap.** RGB `stats` at 10 m: 9 km region about 25 EECU·s registered vs 1.46 ingested (17x); whole site (20 km) about 171 vs 6.5 (26x). About 90 to 95% of the registered cost is the `ImageCollection.mosaic` step. Wall-clock time understates this because the platform runs about 15 computations in parallel.
4. **What drives the cost.** Cost follows the number of tiles touched, not the output pixel count or the scale (flat from about 2 m to 16 m over 100 tiles, then falls at 32 m and above). It grows faster than linearly with site size (cost per mosaic computation +74% from 9 km to 20 km). `REG_FULL` (the viewer's whole-site mosaic) costs the same as `REG`. Collections `900` and `901` cost the same. The on-level-overview idea was tested and rejected.
5. **Statistics at coarse scales depend on the overview resampling.** `901` (averaged RGB and DTM overviews) tracks the ingested pyramid closely (RGB within a few percent, DTM within 1%). `900` (NEAREST for all products) differs strongly for RGB (mean about -0.8%, standard deviation +25% to +43%, extremes preserved). CHM uses NEAREST by design in the recommended profile, so registered CHM keeps the pixel-level spread (standard deviation about 9.2 m at every scale vs 5.7 to 8.5 m ingested) and a noisy maximum (36 to 70 m across scales against 32 to 37 m ingested). Neighbourhood operations are affected too: the CHM focal maximum is 9% to 11% higher with registered data at 10 m and 51% higher at 100 m (identical at 1 m).
6. **Method findings.** Repeats of the ingested case were served from the Earth Engine result cache until the harness set a unique image property; early ingested timings are invalid. Wall-clock single runs vary by 2x or more, so small differences are not meaningful.

7. **Per-tile reduction avoids most of the mosaic cost.** Reducing each tile separately and combining the results (`REG_TILES`, mean, standard deviation, minimum and maximum only) is 2x to 7x faster in wall-clock time than the mosaicked form (clean run 11: CHM 0.7 s at 9 km and 1.5 s at 20 km against 3.2 s and 10.1 s; RGB 2.7 s and 7.5 s against 7.5 s and 13.2 s), at 1.7x to 3.5x the ingested time (CHM about 1.7x to 1.8x, RGB 2.6x to 3.5x), and it did not hit the memory error the mosaic form hit once at 13 km. Its statistics agree with the mosaic (RGB and CHM means within 0.02%, standard deviations within 0.01%, minimum and maximum identical). In compute the first implementation cost about 34.6 EECU·s at 20 km (356 tiles) against about 171 for the mosaic and about 6.5 for ingested; the current leaner implementation is 2x to 4x slower in wall-clock time than that first one and its EECU has not been measured.

### Implications

**Quota (Google Earth Engine noncommercial tiers).** Per Google's documentation, quota is counted in EECU-hours (1 EECU-hour = 3,600 EECU·s) for both online (Code Editor, scripts, apps) and batch (export) computation, per Cloud project, and cannot be transferred. Tiers: Community 150, Contributor 1,000, Partner 100,000 EECU-hours per month. Earth Engine Apps are tracked against the parent project of the app, not the visitor. At the limit the project is not stopped but runs in restricted mode (lower concurrency and fewer compute workers) until the monthly reset. The documentation does not say whether the project requesting a computation or the project owning the assets is charged; the wording ("on behalf of your project") suggests the requester, to be confirmed.

| RGB `stats`, 10 m | Ingested | Registered | Runs per 150 EECU-hours (ingested vs registered) |
|---|---|---|---|
| 9 km (100 tiles) | 1.46 EECU·s | about 25 | about 370,000 vs about 21,000 |
| 20 km, whole JERC (356 tiles) | about 6.5 | about 171 | about 83,000 vs about 3,200 |

- **Analysts** running their own scripts on registered tiles use their own project's allowance up to about 17x to 26x faster for large mosaic statistics. Small field-plot work is probably much cheaper (cost scales with tiles touched), but EECU at small sizes has not been profiled.
- **The viewer** spends the app's parent project quota, not the visitors'. Whether the cost of rendering map tiles is similarly higher has not been measured (`reduceRegion` is not the same operation as drawing a tile); the `render` case of single mode was added for this. If the project is on a low tier, heavy use of registered data could push the whole app into restricted mode. The project's tier and the app's traffic are not known here.
- **Large sites.** The superlinear growth means sites with many more tiles than JERC (356) could cost disproportionately more. Not measured; see the GRSM checklist.

**Viewer behaviour.** The statistics tool reduces at 10 m. For CHM the mean and maximum barely change but the standard deviation will be about 17% higher with registered data (closer to the true pixel-level spread). Not yet checked in the viewer.

**Query pattern.** Reducing each tile and combining the results (`REG_TILES`) instead of mosaicking first removes most of the wall-clock penalty (CHM about 1.7x ingested, RGB 2.6x to 3.5x, against 6x to 12x for the mosaic) and, in its first implementation, cut compute about 5x at whole-site size (about 34.6 vs 171 EECU·s), but that is still about 5x ingested in compute. Analysts and the viewer's statistics tool can use it for mean, standard deviation, minimum and maximum. Drawing map layers still needs the mosaic (but only for the few tiles in view); percentile statistics (the viewer's stretch) need histogram combining. Also relevant for reliability: the mosaic form hit "Earth Engine memory capacity exceeded" once at 13 km.

**Data specification.**
- Averaged overviews (`901`-style) are preferable to NEAREST for RGB and DTM/DSM if coarse-scale statistics and zoomed-out maps are to resemble the ingested products; the legacy `900` build is not.
- NEAREST for CHM is a design choice: it preserves canopy-height peaks but makes coarse-scale CHM maximum and standard deviation depend on which pixels the overview keeps.
- The earlier decision to keep the capped-overview collections (see Decisions) should be revisited: `901` (rounded up) was reported to remove the seams.
- The planned 2000x2000 px (20000 for RGB) tile test is the most informative next step: tiles touched drive the cost, and this sweep is its baseline.

### Open questions
- EECU cost of map-tile rendering in the viewer (use single mode with `op: 'render'`).
- EECU of the leaner per-tile implementation (first version 34.6 EECU·s at 20 km, about 8 of it the squaring step), and whether it can be made faster in wall-clock time (it is 2x to 4x slower than the first version, probably because of the many small server operations per tile).
- Behaviour on the largest site (GRSM) and with hyperspectral data (426 bands).
- Which project the viewer's compute is charged to, and its quota tier.
- Run-to-run variability: partly answered by runs 6, 7 and 8 (registered medians reproduce within about 15% to 25% over one day; ratios of 5x to 8x for RGB are robust). Still to do: repeats on other days or busy periods, and repeat the key Profiler cases 2 or 3 times.

Sources for the quota text: [Earth Engine Noncommercial Tiers](https://developers.google.com/earth-engine/guides/noncommercial_tiers), [Earth Engine quotas](https://developers.google.com/earth-engine/guides/usage).

## Scope

- **Phase 1 (this test build):** RGB, CHM and DEM (DSM, DTM, Derived Terrain) read from registered COG tiles.
- **Phase 2 (not started):** hyperspectral (HSI) products. HSI and CNC are still read from the prod ingested collections.

## Collections

| Product | Ingested (prod) | Registered (test) |
|---|---|---|
| RGB | `projects/neon-prod-earthengine/assets/RGB/001` | `projects/neon-nonprod-earthengine/assets/testRGB/REG` |
| CHM | `.../CHM/001` | `.../testCHM/REG` |
| DEM | `.../DEM/001` | `.../testDEM/REG` |

- Non-prod asset tree (seen 2026-11-03): `CHM/REG`, `DEM/REG`, `RGB/REG`; `testCHM`, `testDEM`, `testRGB` each with `900`, `901`, `902`, `REG`; `testLIDAR_QA/902`; `LIDAR_QA`; and a `zCOG_TESTS` folder (HOPB_ASPECT_02, HOPB_RGB_01/02, JERC_RGB_01, JERC_RGB_PUB, SJER_QA_01, WOOD_CHM_01, WOOD_DSM_01, WOOD_DTM_01, ...). What distinguishes `900`/`901`/`902` is recorded in the inventory output (`cog_collection_inventory.js`) once run.
- Inventory run (2026-11-03, tile counts; per-site-year counts not yet read):

  | Collection | RGB tiles | CHM / DEM tiles | Site-years |
  |---|---|---|---|
  | `test*/900` | 359 | 352 | 1 |
  | `test*/901` | 100 | 100 | 1 |
  | `test*/902` | 555 | 547 | 3 |
  | `test*/REG` | 399 | 391 | 2 |
  | unprefixed `{RGB,CHM,DEM}/REG` | 0 | 0 | empty |

  The unprefixed `/REG` collections are empty in the inventory, so `COG_STAGING = false` in the viewer would return no data.

#### Collection specs (data owner, `2026_COG_specs.csv`, received 2026-11-03)

This confirms what the tile counts suggested (900 = whole JERC 2026, 901 = 10x10 km block, `test*/REG` = HOPB 2025 + JERC 2026, 902 = three whole sites).

| Collection | Sites | Build | Lidar overviews (px per 500 px tile) | RGB overviews (px per 5000 px tile) | Overview resampling |
|---|---|---|---|---|---|
| `{CHM,DEM,RGB}/REG` | 2025_JERC_9 (sic), 2026_REDB | Recommended profile, rounded up (`--overview_layout ceil`) | not listed | not listed | not listed |
| `test*/REG` | 2025_HOPB_6, 2026_JERC_9 (whole sites) | Recommended profile, capped at levels that divide the tile exactly (`--overview_cap aligned`) | 3: 500, 250, 125 | 4: 5000, 2500, 1250, 625 | as recommended profile |
| `test*/900` | 2026_JERC_9 (whole site) | Published files as they are (legacy `raster2cog.py`) | 8: 500 to 4 | 8: 5000 to 40 | **NEAREST for every product** (SAMPLE) |
| `test*/901` | 2026_JERC_9, 10x10 km block only (736 to 746 km E, 3454 to 3464 km N; 100 tiles) | Recommended profile, rounded up (`--overview_layout ceil`) | 5: 500, 250, 125, 63, 32 | 8: 5000 to 40 | "same as above" (see below) |
| `test*/902`, `testLIDAR_QA/902` | 2026_JERC_9, 2026_SJER_8, 2025_HOPB_6 (whole sites) | Recommended profile, rounded down (COG driver builds the overviews) | 5: 500, 250, 125, 62, 31 | 8: 5000 to 39 | CHM NEAREST (SAMPLE); DTM/DSM and RGB AVERAGE (MEAN) |

Notes:

- The 901 resampling cell says "same as above". Read literally that is NEAREST for everything (the 900 row), but the data show 901 RGB matching the ingested mean to 6 to 7 digits at 1 m and 2 m, which only happens with averaging. So it presumably means the recommended profile (as in the 902 row: CHM NEAREST, DTM/DSM and RGB AVERAGE). To be confirmed with the data owner.
- RGB overviews run from 0.2 m to about 25 m in 900, 901 and 902 (10000 px native at 0.1 m, 5000 px first overview, 40 px last). Only `test*/REG` stops at 4 overviews (coarsest 1.6 m).
- The `{CHM,DEM,RGB}/REG` row lists sites 2025_JERC_9 and 2026_REDB, but the inventory found those collections empty; 2025_JERC_9 may be a typo for 2026_JERC_9.
- Registered collections hold one asset per 1 km tile, tagged `YEAR_SITE_VISIT` (e.g. `2026_JERC_9`).
- Unprefixed `projects/neon-nonprod-earthengine/assets/{RGB,CHM,DEM}/REG` also exist. They have deeper overviews but show grid seams when zoomed out (see Decisions).
- Registered test data currently exists only for `2026_JERC_9` and `2025_HOPB_6`.
- Config lives at the top of the test file: `COG_ROOT`, `COG_STAGING`, `COG_VERSION`, `COG_SITE_PROP`.

## What changed in the test build

- `getSelectedImage(collectionName, idx)` replaces every `filter(system:index).first()`. For registered products it filters on `YEAR_SITE_VISIT` and mosaics the tiles.
- `mosaicCogTiles` details that matter:
  - restores the native projection after `mosaic()` (`setDefaultProjection`);
  - casts back to `ee.Image` after `copyProperties()`/`set()`, which return `ee.Element`;
  - does **not** copy `system:footprint` from the first tile (that made centering and the stretch statistics cover one tile only);
  - clips to `tiles.geometry().bounds()`, because a bare `mosaic()` footprint is unbounded and `reduceRegion` fails without a geometry;
  - sets `FLIGHT_YEAR`, `NEON_SITE`, `YEAR_SITE_VISIT` and `system:index` from the site-year ID.
- `getImageIdsForSite` builds the image dropdowns from distinct `YEAR_SITE_VISIT` values (matched by `_SITE_`), because tiles may not carry `NEON_SITE`.
- The site dropdown is built from the ingested HSI/CNC collections only (scanning tiles would be slow and tiles may lack `NEON_SITE_NAME`).
- Terrain from an HSI image mosaics the registered DEM tiles for the flight year first, then computes terrain on the mosaic (continuous across tile edges), then clips to the HSI bounds.
- Sample-script generator emits the collection path, a `YEAR_SITE_VISIT` filter, `mosaic()` and `setDefaultProjection`, and centers on the tile collection.
- Download panel ("Export ready") shows a notice for full-site exports of registered products. Crop vs full-site uses a new flag, `cropDrawnByUser`, set only when the user actually draws or edits a crop box.

## Findings: export performance (JERC, full-site RGB unless noted)

Measured by the data owner; single runs, so treat as indicative. Interactive downloads run on shared EE capacity and results are cached, so small differences are not reliable.

| Configuration | Download time after clicking link |
|---|---|
| Ingested RGB | 12 s |
| Registered RGB, capped overviews (`test*`) | 3 min 25 s |
| Registered RGB, deeper overviews (8, unprefixed) | 1 min 6 s |
| Registered RGB crop, ~5% of the site | 15 s (ingested crop: 6 s) |

- Registered CHM is slower than ingested CHM but much faster than registered RGB.

### 100 km² subset test (2026-11-03)

Measured by the data owner; single runs. Registered subset: `SITE = '2026_JERC_9'`, 10 x 10 1 km tiles (100 km²), `VERSION = '901'`, `STAGING = true` (`testCHM`/`testRGB`), `REGISTERED = projects/neon-nonprod-earthengine/assets`. Ingested comparison: CPER 2024, full 10 km x 10 km site (100 km²), from `projects/neon-prod-earthengine/assets`.

| Product | Registered, JERC 2026 (100 tiles) | Ingested, CPER 2024 (1 image) | Ratio |
|---|---|---|---|
| RGB export | 24 s | 7 s | ~3.4x |
| CHM export | 26 s | 6 s | ~4.3x |

- Equal area, so the gap is not explained by area. It is consistent with a per-tile cost (100 file opens vs one image).
- Registered CHM (26 s) is now about the same as registered RGB (24 s) at this size, unlike the full-site JERC comparison above where RGB was far slower. The earlier RGB penalty may depend on the overview level read, which needs a controlled test.
- Confounded comparison: different site, year, and sensor flight (CPER 2024 vs JERC 2026), and different cache state. Follow-up tests should use the same site-year in both forms.
- Map rendering is close to ingested; rendering is not the problem.
- Interpretation (hypothesis, not proven): cost scales with the number of tiles touched and with the overview level that has to be read. With capped overviews the coarsest RGB level is 1.6 m, so a 10 m export reads a much finer level than it needs; CHM and DEM stop at 8 m, which is close to what the export needs. A per-file open cost also appears to remain, since the deeper-overview RGB export is still about 5x slower than ingested.

### Collection `901`: overviews rounded up (2026-11-03)

- The `VERSION = '901'` collections round the overview count **up** instead of down. This removes the visible tile seams, so it is probably the COG spec that will be used.
- Per the data owner, performance is on par with "the rounded-up version". The spec table lists the unprefixed `{CHM,DEM,RGB}/REG` as rounded up (`ceil`), the same build as 901, so this most likely refers to the earlier deeper-overview unprefixed collections (66 s export). To be confirmed. The 100 km² numbers above come from this collection.
- Tile size stays at 1 km x 1 km (1000x1000 px for HSI/CHM/DTM/DSM, 10000x10000 px for RGB), set by NEON Data Portal download needs. A 2000x2000 (20000x20000 for RGB) tile test is a possible later side test; tile size is not a variable in the main tests.

### COG configuration (from the data owner)

| Setting | CHM | DTM / DSM | RGB |
|---|---|---|---|
| Driver, compression | GDAL COG, ZSTD level 9 | same | same |
| Block size | 512 | 512 | 512 |
| Data type | float32 | float32 | uint8 |
| Overview resampling | NEAREST | AVERAGE | AVERAGE |
| Overview count, default | 5 (500 to 32 px) | 5 | 8 (5000 to 39 px) |
| Overview count, `--overview_cap aligned` | 3 (500 to 125 px) | 3 | 4 (5000 to 625 px) |
| EE pyramiding policy | SAMPLE | MEAN | MEAN |

The `test*` collections use the `aligned` cap. The aligned cap keeps overview grids lined up between adjacent tiles; the deeper overviews do not, which is what produces the seams.

## Analytical performance tests: ingested vs registered

Script: `cog_vs_ingested_perf_test.js` (Code Editor). Plan agreed 2026-11-03:

- Variables: operation, region size, scale. Tile size is fixed at 1 km. Tiles touched is logged for registered runs as a covariate, not swept.
- Scale sweep rationale: ingested images have Earth Engine-built pyramids, so cost should stay roughly flat as scale coarsens. Registered COGs only have the overviews in the file, so a request coarser than the coarsest overview reads that level and aggregates. Prediction: registered/ingested ratio near 1 at native scale and growing at coarser scales, more so for RGB than lidar. If the ratio stays flat, per-file overhead is the cause instead.
- Forms compared: `ING` (ingested), `REG` (mosaic only tiles touching the region), `REG_FULL` (whole site-year mosaic with clip, as the viewer does; also tests the open item about `tiles.geometry()` cost).
- Operations: `stats`, `hist`, `plots` (reduceRegions over 40 m plots), `points` (random sample), `math` (ExG / canopy cover / DSM-DTM), `focal` (CHM focal max / DTM slope).
- Timing: matrix mode logs wall-clock per case and prints a CSV. EECU-seconds and peak memory come from the Profiler tab using `MODE = 'single'`. A Python harness is the fallback if Profiler numbers are not usable.
- Pairing: the ingested lists (RGB, CHM, DEM) all contain `2026_JERC_9` and `2025_HOPB_6`, the same site-years registered in the test collections, so a paired comparison is possible now. BRDF reflectance is also ingested for both (the SDR list stops at 2021), which will matter for the hyperspectral phase. The ingested CPER 2024 image is `2024_CPER_10`. REDB is ingested as CHM/DEM/RGB 2017 to 2023 and BRDF 2022/2023.
- `SHARED_ANCHOR = true` (default) centres every form's region on the registered footprint, so ING, REG and REG_FULL read the same pixels and the check values should agree. Sizes are capped to the smaller of the two footprints' short sides.
- Limitation: the 100 km² timings above compared different sites and years (JERC 2026 registered vs CPER 2024 ingested). Paired runs on `2026_JERC_9` supersede them. HSI pairing needs the planned REDB test set (or a registered HOPB/JERC BRDF set).
- Not yet covered: hyperspectral (band-subset scaling, spectrum extraction), full-cube export, stress/limit tests.

### Run 1 (2026-11-03): CHM, `2026_JERC_9` paired, `VERSION = '901'`

Raw data: `results_2026-11-03_CHM_JERC2026_run1.csv`. 72 cases, 3 reps, shared anchor, regions 1 km (4 tiles) and 5 km (36 tiles). Ingested image is one image (the full ingested footprint); registered is the 100-tile subset.

Medians (s), ratio to ING in brackets:

| Op, size, scale | ING | REG | REG_FULL |
|---|---|---|---|
| stats 1 km, 1 m | 0.4 | 0.9 (2.1x) | 1.2 (2.7x) |
| stats 1 km, 10 m | 0.3 | 0.4 (1.8x) | 0.6 (2.2x) |
| stats 1 km, 100 m | 0.3 | 0.4 (1.4x) | 0.4 (1.3x) |
| stats 5 km, 1 m | 1.1 | 1.7 (1.5x) | 1.3 (1.2x) |
| stats 5 km, 10 m | 0.3 | 1.0 (3.7x) | 1.2 (4.3x) |
| stats 5 km, 100 m | 0.2 | 0.5 (2.2x) | 0.4 (1.6x) |
| plots 1 km, 1 m | 0.4 | 0.6 (1.6x) | 0.4 (1.0x) |
| plots 5 km, 1 m | 0.4 | 0.6 (1.4x) | 0.9 (1.9x) |

Findings and caveats:

- **Values agree at native scale.** All three forms return the same mean at 1 m (e.g. 11.6912 for 1 km stats, 9.1818 for 5 km), so the shared-anchor pairing works and the mosaic is correct. At 10 m and 100 m they differ by up to about 3% (100 m, 1 km: ING 11.85 vs REG 11.46), consistent with different pyramid construction (EE-built pyramid vs COG overviews, CHM overview resampling NEAREST / pyramiding SAMPLE). Not a performance issue, but a reproducibility one for coarse-scale statistics.
- **Absolute times are small (0.2 to 2 s) and noisy.** Single-case spread is as large as the median (ING stats 5 km 1 m: 1.1, 0.2, 1.4 s; REG plots 1 km first rep 4.9 s vs 0.5 and 0.6 s later). Ratios below about 2x are not distinguishable from noise with 3 reps. Many ING cases sit at a ~0.2 s round-trip floor.
- **The scale hypothesis is not supported for CHM.** The ratio does not grow as scale coarsens; 100 m ratios are the lowest. Expected for lidar (coarsest overview near what coarse scales need), but RGB is the real test.
- **Possible per-tile cost.** At 10 m and 100 m (few pixels, so pixel volume is negligible) REG is slower than ING by about 0.7 s and 0.3 s at 36 tiles, and by about 0.1 s at 4 tiles. That is roughly 10 to 20 ms per tile touched. Hypothesis only; needs more reps and larger tile counts.
- **REG_FULL is not consistently slower than REG** at 100 tiles, so the `tiles.geometry()` union / clip does not show up here.
- **Run-order bias.** Within each repeat the order is always ING, REG, REG_FULL, so REG pays the first (cold) read of the registered files. Rotate the order in later runs.
- Cache busting may not be effective: ING 5 km 1 m reduced 25 M pixels in 0.2 s on one rep. Compare with `BUST_CACHE = false` before trusting sub-second numbers.

### Run 2 (2026-11-03): RGB, `2026_JERC_9`, 1 km region, versions 901 and 900

225 cases, 5 reps, rotated form order, regions centred on the 901 footprint (4 tiles touched). Raw CSV not saved: the ingested times are invalid (see below); rerun after the cache fix.

**Invalid ingested baseline.** The ingested (ING) case repeated the same work but returned in ~0.2 s on most repeats and ~5 s on others, e.g. stats at 0.1 m: 5199, 297, 285, 244, 5916 ms. Reading 100 M pixels x 3 bands in 0.25 s is not possible, so those repeats were served from the result cache. The cache-bust filter on `system:index` is evidently resolved when the request is compiled for a single-image lookup, so it never changed the ING expression. The registered forms were not affected (stable 6 to 9 s across reps). The summary ratios (24x to 30x at 0.1 m) are therefore inflated and should not be used. The harness now sets a unique image property instead (`getImage`).

**Cold ING (rep 1 only, and rep 5 where it also ran uncached) vs registered medians, 0.1 m:**

| Case | ING cold (s) | REG@901 | REG@900 | REG_FULL@901 | REG_FULL@900 |
|---|---|---|---|---|---|
| stats 0.1 m | 5.2, 5.9 | 8.9 | 7.3 | 7.1 | 7.3 |
| math 0.1 m | 5.3 | 6.2 | 6.1 | 5.8 | 6.5 |
| stats 1 m | 1.2, 2.6 | 1.5 | 2.0 | 1.2 | 1.6 |
| math 1 m | 1.5 | 1.1 | 1.4 | 1.2 | 1.1 |
| plots 0.1 m | 1.0 | 2.4 | 2.2 | 1.9 | 2.4 |

So on a 1 km region registered RGB is roughly 1.1x to 1.7x the cost of ingested for whole-region reductions at native and 1 m scale, not 24x. `plots` (100 small windows) is about 2x to 2.5x, possibly because each plot decompresses 512 px COG blocks (hypothesis, one cold ING sample).

Other findings:

- **Native-scale values agree** across all five forms (stats mean 89.0752464 at 0.1 m), so mosaics are correct.
- **At 1 m, 901 matches ING almost exactly** (89.47124 vs 89.47123) while **900 differs** (89.12). At 10 m and 100 m none agree closely (e.g. 100 m: ING 91.61, 901 91.02, 900 92.38), although a 1 km region is only 10x10 pixels at 100 m, so edge effects are large. Explained by the specs: 900 was built with NEAREST overviews (it takes every Nth pixel), while 901 uses averaging like the ingested pyramid.
- **Coarse scales are fast for every registered version at 1 km** (10 m and 100 m: ~0.3 to 0.5 s, near the latency floor). A 1 km region at 10 m is only 100x100 pixels, so this does not test overview depth. The earlier slow full-site RGB export (205 s on the capped-overview collection) needs a large region at a coarse scale to reproduce: use 9 km or more at 1 m, 2 m, 10 m and 100 m.
- **REG_FULL is not slower than REG** even with the 359-tile full-site mosaic (900), so the whole-site mosaic and clip cost is not visible for regional reductions.
- 900 and 901 times are the same within noise at this size.

### Run 3 (2026-11-03): RGB stats, 9 km region (100 tiles), cache fix applied

Raw data: `results_2026-11-03_RGB_JERC2026_9km_run3.csv`. 100 cases, 5 reps, 81 km² region, `stats` at 1, 2, 10 and 100 m. The cache fix worked: ING at 1 m is now 4.9 to 6.4 s on every rep (previously collapsed to ~0.2 s).

Medians (s), ratio to ING in brackets:

| Scale | ING | REG@901 | REG@900 | REG_FULL@901 | REG_FULL@900 |
|---|---|---|---|---|---|
| 1 m | 5.9 | 8.7 (1.5x) | 5.9 (1.0x) | 6.7 (1.1x) | 7.2 (1.2x) |
| 2 m | 2.8 | 4.3 (1.5x) | 4.0 (1.4x) | 2.9 (1.0x) | 3.3 (1.2x) |
| 10 m | 0.7 | 3.7 (5.1x) | 4.3 (5.9x) | 3.6 (4.9x) | 4.8 (6.7x) |
| 100 m | 0.3 | 0.9 (3.1x) | 0.3 (1.1x) | 0.6 (2.1x) | 0.3 (1.0x) |

Findings:

- **The scale prediction holds for RGB.** Registered is at parity with ingested at 1 to 2 m (1.0x to 1.5x, within the noise), but about 5x to 7x slower at 10 m. Ingested cost falls smoothly with scale (5.9, 2.8, 0.7, 0.3 s); registered cost is flat from 2 m to 10 m (about 3.7 to 4.8 s) and only drops at 100 m. I first suspected the registered forms were reading the same coarsest overview level for requests between 2 m and 10 m, but the specs rule that out for 900 and 901: both have 8 RGB overviews down to about 25 m, so a 10 m request has a 6.4 m level available. The cause of the 3.7 to 4.8 s at 10 m is therefore not overview depth. Leading candidate is a per-tile overhead (about 3 s over 100 tiles, roughly 30 ms per tile, similar to the 10 to 20 ms per tile estimated from the CHM run), but that does not explain why the cost drops to 0.3 s at 100 m. Unexplained; needs EECU-seconds from the Profiler (single mode).
- **Consistent with the earlier export timings.** The 5x to 7x at 10 m is close to the earlier full-site export ratio for the deeper-overview collection (66 s vs 12 s ingested, 5.5x), and much lower than the capped-overview collection (205 s, 17x). Both 900 and 901 behave like the deeper-overview case, which matches the specs (8 RGB overviews in both; the capped `test*/REG` has 4). Indicative only; different operation and region. A direct check is to add `'REG'` and `'902'` to `REG_VERSIONS`: `test*/REG` should be much slower than the others at 10 m if overview depth is what matters.
- **Absolute cost is a few seconds** (3.7 to 4.8 s vs 0.7 s for a 10 m reduction over 81 km²), not minutes.
- **901 matches the ingested pyramid; 900 does not.** At 1 m and 2 m the 901 mean equals the ING mean to 6 to 7 digits (91.67234 vs 91.67234; 91.79498 vs 91.79495). The 900 mean is lower by about 0.4 (91.29 at 1 m, 2 m and 10 m). The same offset was seen in run 2 on a 1 km region (89.12 vs 89.47). At native 0.1 m all forms agree, so the difference is in 900's overview content (about 0.4% lower), not in the tiles. At 10 m and 100 m even 901 departs from ING by 0.3% and 1.3% (10 m: 91.80 vs 92.08; 100 m: 91.49 vs 92.66), so coarse-scale values are not reproducible across forms.
- **At 100 m, 900 is faster than 901** (0.3 s vs 0.6 to 0.9 s; the two distributions do not overlap on REG), but the specs list identical RGB overview sizes for the two, so overview depth does not explain it. Possible causes: NEAREST vs AVERAGE overviews, or different tools writing the files (legacy `raster2cog.py` vs the GDAL COG driver). Unexplained.
- **REG_FULL is not slower than REG**, including the 359-tile mosaic (900). 
- One outlier: REG@900 at 1 m rep 2 took 38.6 s (others 5.8 to 7.7 s).

### Test geometry (2026-11-03, `MODE = 'centres'`, RGB, `2026_JERC_9`)

| Footprint | Centre [lon, lat] | Shorter side |
|---|---|---|
| Ingested image (bounding box) | [-84.464071, 31.244701] | 21,602 m |
| `901` block (100 tiles) | [-84.469531, 31.240337] | 10,214 m |

Anchor for the paired single-mode (Profiler) runs: `[-84.469531, 31.240337]` (the `901` centre), region 9 km, RGB `stats` at 10 m, forms `ING`, `REG@901`, `REG_FULL@901`.

### Run 4 (2026-11-03): CHM and DTM `stats`, 9 km (100 tiles), scales 1, 4, 10, 32, 100 m

250 cases, 5 reps, no errors. Forms: ING, REG@901, REG@900, REG_FULL@901, REG_FULL@900. Footprint shorter sides: ING CHM/DEM 21,452 m, REG@900 21,065 m, REG@901 10,215 m. The raw CSV is in the Code Editor console output of the run; it was not copied into this folder.

Median wall-clock (s):

| Product, scale | ING | REG@901 | REG@900 | REG_FULL@901 | REG_FULL@900 |
|---|---|---|---|---|---|
| CHM 1 m | 3.2 | 5.1 | 4.5 | 4.2 | 4.4 |
| CHM 4 m | 0.8 | 2.8 | 1.9 | 2.4 | 2.1 |
| CHM 10 m | 0.4 | 3.9 | 6.9 | 4.5 | 2.9 |
| CHM 32 m | 0.3 | 1.1 | 0.8 | 0.5 | 0.9 |
| CHM 100 m | 0.2 | 0.4 | 0.5 | 0.3 | 0.5 |
| DTM 1 m | 2.4 | 4.6 | 3.6 | 5.4 | 4.2 |
| DTM 4 m | 0.8 | 3.5 | 3.0 | 3.0 | 2.6 |
| DTM 10 m | 0.5 | 4.0 | 4.0 | 6.9 | 5.8 |
| DTM 32 m | 0.3 | 0.7 | 0.8 | 0.9 | 0.7 |
| DTM 100 m | 0.2 | 0.4 | 0.5 | 0.3 | 0.5 |

CHM statistics (mean / standard deviation / max, metres). Registered 900 and 901 agree at 1 to 10 m (both NEAREST):

| Scale | ING | REG@901 | REG@900 |
|---|---|---|---|
| 1 m | 7.2005 / 9.217 / 98.97 | identical | identical |
| 4 m | 7.2005 / 8.548 / 36.90 | 7.2016 / 9.218 / 90.61 | same as 901 |
| 10 m | 7.2036 / 7.891 / 35.79 | 7.2009 / 9.217 / 36.09 | same as 901 |
| 32 m | 7.2014 / 6.334 / 29.43 | 7.1964 / 9.212 / 34.85 | same mean/sd/max as 901 |
| 100 m | 7.2237 / 5.742 / 24.63 | 7.2592 / 9.202 / 33.09 | 7.1944 / 9.189 / 33.61 |

DTM statistics (mean / standard deviation / max, metres):

| Scale | ING | REG@901 | REG@900 |
|---|---|---|---|
| 1 m | 45.634 / 3.8420 / 61.02 | identical | identical |
| 4 m | 45.634 / 3.8399 / 59.23 | identical to ING | 45.635 / 3.8424 / 59.54 |
| 10 m | 45.634 / 3.8372 / 58.51 | identical to ING | 45.637 / 3.8427 / 59.28 |
| 32 m | 45.634 / 3.8182 / 56.79 | 45.642 / 3.8115 / 56.75 | 45.653 / 3.8454 / 57.00 |
| 100 m | 45.634 / 3.7877 / 55.89 | 45.645 / 3.8188 / 56.06 | 45.655 / 3.8563 / 56.48 |

Findings:

- **The NEAREST vs average effect is large for CHM and small for DTM.** The ingested CHM pyramid averages, so its standard deviation falls from 9.22 (1 m) to 8.55 (4 m), 7.89 (10 m), 6.33 (32 m) and 5.74 (100 m), and its maximum from 98.97 to 24.63 m. Registered CHM overviews are NEAREST, so they keep the pixel-level spread (standard deviation about 9.2 at every scale) and a high maximum. Means agree within about 0.1% (0.5% at 100 m). Relative to ingested, registered CHM standard deviation is +7.8% (4 m), +16.8% (10 m), +45% (32 m), +60% (100 m). At 4 m the registered maximum is 90.61 m against 36.90 m: NEAREST kept one extreme pixel; it is a sample, so such values depend on which pixels are picked.
- **DTM follows the spec.** The `901` DTM (averaged overviews) matches ingested exactly at 4 m and 10 m and within 0.8% at 100 m. The `900` DTM (NEAREST) deviates slightly more (standard deviation up to +1.8%, maximum up to +1.3%).
- **Viewer consequence.** The statistics tool reduces CHM at 10 m: mean unchanged (7.20), maximum about the same (36.1 vs 35.8 m), but standard deviation about 17% higher with registered data (9.22 vs 7.89 m), because it is closer to the true pixel-level spread. Not yet checked in the viewer.
- **Cost is not monotonic in scale for registered data.** 10 m is the most expensive coarse scale for lidar as well (CHM 3 to 7 s vs ING 0.4 s, 7x to 17x; DTM 4 to 7 s vs 0.5 s, 8x to 15x), more than 4 m (1.9 to 3.5 s) although it needs 6x fewer pixels. Ingested falls steadily with scale (CHM 3.2, 0.8, 0.4, 0.3, 0.2 s). 4 m, 32 m and 100 m are close to overview levels in the files (901 lidar overviews at about 2, 4, 8, 16, 31 m); 10 m is not. Hypothesis at the time: requests that match an overview level are cheap and in-between requests are expensive. Tested in run 5 and not supported.
- At 1 m (native) registered is 1.3x to 2.3x ING in wall-clock time; at 100 m about 2x at a 0.2 to 0.5 s floor.
- **REG vs REG_FULL.** Mean, standard deviation and maximum are identical for 901. For 900 they differ slightly at 32 m (CHM mean 7.1964 REG vs 7.1935 REG_FULL; DTM standard deviation 3.8454 vs 3.8529), which fits `900`'s overview grids not lining up between tiles (the seam issue); hypothesis. Timing: no consistent difference for CHM; for DTM at 10 m REG_FULL was slower (6.9 and 5.8 s vs 4.0 s) with one 18 s outlier.
- No errors; native-scale values identical across all forms.

### Run 5 (2026-11-03): on-level vs off-level scales, CHM and RGB `stats`, 9 km (100 tiles)

150 cases, 5 reps, no errors. Forms: ING, REG@901, REG@900. Lidar scales 6, 8, 10, 12, 16 m (on-level 8 and 16 m); RGB scales 5, 6.4, 8, 10, 12.8 m (on-level 6.4 and 12.8 m). Raw CSV is in the Code Editor console output of the run, not copied here.

Median wall-clock (s), ratio to ING in brackets:

| Scale | ING | REG@901 | REG@900 |
|---|---|---|---|
| CHM 6 m | 0.4 | 3.8 (8.8x) | 3.7 (8.6x) |
| CHM 8 m (on-level) | 0.7 | 6.9 (9.8x) | 3.9 (5.5x) |
| CHM 10 m | 0.4 | 3.0 (7.1x) | 6.4 (15.3x) |
| CHM 12 m | 0.7 | 3.6 (5.6x) | 3.8 (5.8x) |
| CHM 16 m (on-level) | 0.4 | 2.9 (7.9x) | 3.7 (10.2x) |
| RGB 5 m | 2.0 | 5.1 (2.5x) | 3.7 (1.8x) |
| RGB 6.4 m (on-level) | 1.0 | 3.7 (3.6x) | 4.7 (4.5x) |
| RGB 8 m | 2.0 | 7.7 (3.8x) | 4.1 (2.0x) |
| RGB 10 m | 1.1 | 5.0 (4.6x) | 7.9 (7.3x) |
| RGB 12.8 m (on-level) | 0.9 | 5.4 (6.1x) | 5.1 (5.8x) |

Findings:

- **The on-level hypothesis is rejected.** On-level scales are not cheaper than their neighbours (CHM 8 m on 901 was the slowest at 6.9 s). Combined with runs 3 and 4, registered cost is roughly a plateau of 3 to 7 s from about 2 m to 16 m (lidar) and 2 m to 13 m (RGB) over 100 tiles, then falls at 32 m (CHM about 1 s) and 100 m (0.3 to 0.9 s). Ingested falls steadily (CHM 3.2 s at 1 m, 0.4 s at 6 to 16 m). The 10 m "peak" in run 4 was noise within this plateau. The plateau looks like a cost that does not depend on scale but on the number of tiles and output tiles to mosaic. Hypothesis, not tested: the cost scales with tiles touched.
- Single-run variation is large (for example REG@901 CHM 8 m: 8.2, 3.1, 7.0, 4.3, 6.9 s; REG@900 RGB 10 m: 18.1 s in one rep), so differences under about 2x between versions are not meaningful.
- **CHM NEAREST statistics.** Registered CHM standard deviation stays at 9.2 at every scale (ING 7.05 to 8.55, so +8% to +31%). Registered maximum is erratic across scales: 60.2 m (6 m), 53.3 (8 m), 36.1 (10 m), 53.3 (12 m), 70.0 (16 m), against 31.9 to 36.7 m for ING and 98.97 m at native resolution. NEAREST exposes isolated tall pixels, so the registered CHM maximum at coarse scales depends on which pixels the overview happens to keep. Means agree within 0.1%.
- **RGB: 901 close to ING, 900 not.** 901 vs ING at 5 to 12.8 m: mean -0.1% to -0.4%, standard deviation -1.4% to -2.6%, maximum +0.4% to +3%. 900 (NEAREST) vs ING: mean -0.7% to -1.0%, standard deviation +25% to +43%, minimum 1 to 5 and maximum 255 (ING 17 to 24 and 230 to 251). The `900` RGB overviews are visibly more contrasty and noisier than the averaged pyramids, which would also show when zoomed out on a map.
- The startup existence check cost about 0.06 EECU·s (negligible) and confirmed the counts: RGB 900 359 tiles, CHM/DEM 900 352, 901 100 each, 1 ingested image per product.

### Run 6 (2026-11-03): cost vs region size and tiles touched, `stats` at 10 m, whole JERC 2026 (`900`)

160 cases, 5 reps, forms ING and REG@900, regions 1 to 20 km centred on the 900 footprint, no errors. Raw CSV is in the Code Editor console output of the run, not copied here.

Median wall-clock (s), ratio to ING in brackets; tiles touched for REG@900:

| Region | Tiles (CHM / RGB) | CHM ING | CHM REG@900 | RGB ING | RGB REG@900 |
|---|---|---|---|---|---|
| 1 km | 4 / 4 | 0.3 | 0.3 (1.1x) | 0.3 | 0.3 (1.0x) |
| 3 km | 17 / 17 | 0.3 | 0.7 (2.1x) | 0.3 | 0.7 (2.3x) |
| 5 km | 37 / 37 | 0.4 | 1.1 (2.8x) | 0.4 | 1.1 (2.5x) |
| 7 km | 65 / 64 | 0.5 | 1.9 (4.0x) | 1.1 | 2.7 (2.5x) |
| 9 km | 101 / 99 | 0.5 | 4.3 (9.4x) | 1.2 | 7.8 (6.8x) |
| 13 km | 196 / 196 | 0.8 | 9.5 (12.4x) | 1.7 | 12.1 (6.9x) |
| 17 km | 291 / 292 | 0.7 | 7.4 (10.1x) | 1.7 | 12.3 (7.2x) |
| 20 km | 352 / 356 | 1.3 | 8.4 (6.3x) | 1.5 | 11.7 (8.1x) |

Findings:

- **Registered wall-clock grows roughly linearly with tiles touched up to about 100 to 200 tiles**, about 25 to 45 ms per extra tile (for example CHM: 4 tiles 0.3 s, 37 tiles 1.1 s, 101 tiles 4.3 s). Ingested grows about 10x more slowly (0.3 s to 1.3 s over the same range).
- **Beyond about 200 tiles registered wall-clock levels off** at about 8 to 12 s (CHM 9.5, 7.4, 8.4 s; RGB 12.1, 12.3, 11.7 s). This is probably the platform running all the pieces in parallel, so elapsed time stops growing while total compute (EECU) probably keeps growing. Not measured; needs a Profiler run at 20 km.
- **Cost depends on tiles (area), not on output pixels.** At a fixed 9 km region (100 tiles) wall-clock is flat from about 2 m to 16 m (runs 3 to 5), although the output pixel count changes by about 64x; at a fixed 10 m scale it grows with tiles. Ingested scales with output pixels. Tiles and area cannot be separated here (1 km tiles), so a per-file overhead is the leading hypothesis but not proven; the planned 2000x2000 px tile test (4x fewer files for the same area) would separate them, and this run is its baseline.
- Large run-to-run spread at big sizes (RGB 17 km REG@900: 7.3, 12.3, 21.8, 32.1, 8.8 s; RGB 13 km: one rep 29.8 s).
- **Statistics (900, NEAREST):** CHM mean agrees with ING to 0.2% or better; CHM standard deviation +14% to +18%; maximum 36.1 vs 35.8 m up to 9 km, then 84.9 vs 57.9 m from 13 km (a tall pixel enters the region; NEAREST keeps it). RGB: mean -0.7% to -1.3%, standard deviation +32% to +42%, maximum 255 vs 205 to 247. Same pattern as before.
- The startup existence check was not charged any EECU (Profiler shows 0.054 for plumbing) and again confirmed 359 RGB and 352 CHM tiles in `900`.

### Run 7 (2026-11-03): per-tile reduction without mosaic (`REG_TILES`), RGB `stats` at 10 m, whole JERC (`900`)

60 cases, 5 reps, forms ING, REG@900 and REG_TILES@900, regions 5 to 20 km. Raw CSV is in the Code Editor console output of the run, not copied here (the pasted copy was cut off at the last row).

Median wall-clock (s), ratio to ING in brackets:

| Region (tiles) | ING | REG@900 (mosaic) | REG_TILES@900 (no mosaic) |
|---|---|---|---|
| 5 km (37) | 0.7 | 1.5 (2.0x) | 0.8 (1.1x) |
| 9 km (99) | 1.2 | 6.4 (5.4x) | 1.0 (0.8x) |
| 13 km (196) | 1.5 | 11.8 (7.6x), 1 error | 1.9 (1.2x) |
| 20 km (356) | 1.8 | 9.3 (5.2x) | 2.1 (1.2x) |

- **Without the mosaic, registered is about as fast as ingested** (0.8x to 1.2x in wall-clock time), while the mosaicked form is 2x to 7.6x slower. This supports the Profiler result that the mosaic step, not reading the COG tiles, is the main cost. EECU for `REG_TILES` has not been measured yet (the Profiler table pasted with this run was the startup check, 0.02 EECU·s).
- **The mosaic form failed once:** REG@900 at 13 km, rep 4, "Earth Engine memory capacity exceeded" (after 0.2 s). It is the first error seen in any run. `REG_TILES` had no errors at any size.
- **`REG_TILES` statistics are close to, but not identical to, `REG`.** Mean: 90.147 vs 90.490 (5 km), 91.098 vs 91.290 (9 km), 90.916 vs 91.021 (13 km), 91.248 vs 91.274 (20 km); the gap shrinks from 0.4% to 0.03% as the region grows, standard deviation within 1%, minimum and maximum identical. Both are about 1% below ingested because `900` has NEAREST overviews. I suggested this was edge effects rather than a combine error; run 8 shows the gap came from the first implementation (it disappears with the leaner version), so that explanation was wrong.
- Limits of the pattern: only `stats` (mean, standard deviation, minimum, maximum) combine simply; percentiles (used by the viewer's stretch) would need histograms to be combined.

### Run 8 (2026-11-04 01:38 UTC): repeat of the benchmark, RGB and CHM `stats` at 10 m, 9 km and 20 km (`900`)

60 cases, 5 reps, forms ING, REG@900, REG_TILES@900. First run with the `run` label and the fastest-slowest range in the Summary. Raw CSV is in the Code Editor console output, not copied here.

Median wall-clock (s), with fastest-slowest and ratio to ING:

| Case | ING | REG@900 | REG_TILES@900 |
|---|---|---|---|
| RGB 9 km (99 tiles) | 1.2 (0.6-1.5) | 6.2 (3.3-9.4; 5.0x) | 1.4 (0.9-2.5; 1.1x) |
| RGB 20 km (356 tiles) | 1.9 (1.8-2.5) | 10.0 (8.0-16.1; 5.2x) | failed |
| CHM 9 km (101 tiles) | 0.5 (0.4-0.6) | 6.2 (2.6-17.6; 12.6x) | failed |
| CHM 20 km (352 tiles) | 1.1 (0.7-1.4) | 10.1 (9.1-13.8; 9.2x) | failed |

- **REG_TILES failed in 15 of 20 cases because of a bug in my leaner implementation.** A tile that only touches the edge of the region contains no pixels, and `reduceRegion` then returns missing keys (CHM: "Dictionary does not contain key: 'min'") or null values (RGB: "Number.multiply: Parameter 'right' is required and may not be null"). RGB 9 km happened to have no such tile. The first implementation did not fail because it aggregated the dictionaries directly. Fixed in the script (neutral values for empty tiles); not yet re-run.
- **Correction to run 7.** The leaner version agrees with the mosaic almost exactly where it ran (RGB 9 km: mean 91.2927 vs 91.2904, standard deviation 38.5840 vs 38.5836, minimum and maximum identical), whereas the first version differed by about 0.2% (91.098). So the earlier gap came from the first implementation (squared double-precision image), not from edge effects at coarse scale as suggested in run 7. The combine logic is therefore validated at 10 m for RGB 9 km; validation at native scale is no longer essential.
- **Between-run variability (identical cases in runs 6, 7 and 8, hours apart).** Medians (s):

  | Case | ING (run 6 / 7 / 8) | REG@900 (run 6 / 7 / 8) | Ratio REG/ING |
  |---|---|---|---|
  | RGB 9 km | 1.2 / 1.2 / 1.2 | 7.8 / 6.4 / 6.2 | 6.8x / 5.4x / 5.0x |
  | RGB 20 km | 1.5 / 1.8 / 1.9 | 11.7 / 9.3 / 10.0 | 8.1x / 5.2x / 5.2x |
  | CHM 9 km | 0.5 / - / 0.5 | 4.3 / - / 6.2 | 9.4x / - / 12.6x |
  | CHM 20 km | 1.3 / - / 1.1 | 8.4 / - / 10.1 | 6.3x / - / 9.2x |

  Registered medians reproduce within about 15% to 25% (CHM 9 km differs by 44%, driven by a single 17.6 s repeat), ingested within about 25%. The ratio of 5x to 8x for RGB at 9 to 20 km is robust; differences below about 25% between runs or forms should not be interpreted. These three runs were within one day and do not cover other days or busy periods.
- Within-run spread: REG@900 repeats vary by 2x to 7x between fastest and slowest (CHM 9 km: 2.6 to 17.6 s), ING by about 1.5x to 2.5x.

### Run 9 (2026-11-04): CHM `stats`, `focal` and `plots`, 1 km and 9 km, versions 901 and 900

Default configuration of an earlier script version (no `run` column, no fastest-slowest range): CHM, ops `stats`, `focal`, `plots`, regions 1 and 9 km, scales 1, 10, 100 m, five forms (ING, REG@901, REG@900, REG_FULL@901, REG_FULL@900), 350 cases, no errors. Raw CSV is in the Code Editor console output, not copied here. (It was pasted together with the unfinished output of the `REG_TILES` re-run, which stopped at case 28 of 60 with no results.)

CHM `focal` (focal maximum, radius 3 px) median wall-clock (s):

| Region, scale | ING | REG@901 | REG@900 | REG_FULL@901 | REG_FULL@900 |
|---|---|---|---|---|---|
| 1 km, 1 m | 3.2 | 2.3 | 1.8 | 2.8 | 3.2 |
| 1 km, 10 m | 0.2 | 0.4 | 0.5 | 0.5 | 0.5 |
| 1 km, 100 m | 0.3 | 0.3 | 0.4 | 0.5 | 0.5 |
| 9 km, 1 m | 16.4 | 14.7 | 17.8 | 14.0 | 18.8 |
| 9 km, 10 m | 1.5 | 11.6 | 11.6 | 7.8 | 6.6 |
| 9 km, 100 m | 0.2 | 0.5 | 0.6 | 0.4 | 0.4 |

CHM `plots` (100 random 40 m plots, native 1 m): 1 km ING 0.5, registered 0.5 to 0.7; 9 km ING 0.7, registered 0.9 to 1.0 (1.2x to 1.4x). Plot means agree to about 1e-5 (1 km) and 1e-7 (9 km) relative.

CHM `stats` repeats the earlier pattern (9 km: 1 m ING 3.0 s vs registered 5.2 to 6.4 s; 10 m ING 0.4 s vs registered 3.9 to 7.8 s).

Findings:

- **For expensive native-scale operations registered is at parity.** CHM focal maximum at 1 m over 9 km (81 M pixels) takes 14 to 19 s registered against 16 s ingested (0.9x to 1.2x); plot extraction at native scale is 1.2x to 1.4x. The registered penalty is large only where the work itself is cheap (coarse scales, large regions), because the mosaic cost is a roughly fixed overhead per tile.
- **Neighbourhood results depend on the overview resampling.** Focal maximum means agree exactly at 1 m (17.194 at 1 km; 11.222 at 9 km) but registered is 9% to 11% higher at 10 m (1 km: 25.07 vs 22.98; 9 km: 17.90 vs 16.10) and 51% higher at 100 m (23.59 vs 15.58), because NEAREST overviews keep peaks that the ingested averaged pyramid smooths before the maximum is taken.
- **Backend stall.** In CHM `stats` 9 km at 100 m, five consecutive requests took 22 to 61 s (ING 59.7 s, REG@900 60.7 s, REG_FULL@900 60.2 s, REG_FULL@901 22.0 and 38.8 s) against 0.3 to 1.4 s normally, and it hit every form. A stall of a few minutes affects all forms equally and medians absorb it; it is a reminder that single repeats are unreliable. Caution added later: another run (the `REG_TILES` re-run, run 10) was started while this one was still executing, so some of the slow requests in this run may have been caused by the two runs competing rather than by the backend alone; the timing of the overlap is not known.
- **901 vs 900 at a small region and coarse scale.** CHM `stats` 1 km at 100 m: REG@901 1.1 s (5.3x ING) against REG@900 0.4 s (1.8x), the same direction as the `901` vs `900` difference at 100 m in runs 3 and 6; consistent with the higher per-asset loading cost measured for `901`.

### Run 10 (2026-11-04 01:46 UTC): `REG_TILES` re-run, RGB and CHM `stats` at 10 m, 9 km and 20 km (`900`)

60 cases, 5 reps. **Contaminated by an overlapping run:** the 350-case run 9 was still executing when this run was started (Earth Engine does not cancel the earlier run's pending requests when Run is pressed again), and its Summary appeared in the middle of this one. Both runs competed for capacity, so timings in this run, and possibly the tail of run 9, are inflated. Re-run with nothing else running (reload the Code Editor tab to stop an earlier run).

Median wall-clock (s), fastest-slowest and ratio to ING (contaminated, indicative only):

| Case | ING | REG@900 | REG_TILES@900 |
|---|---|---|---|
| RGB 9 km | 1.1 (0.6-2.7) | 4.3 (3.6-6.8; 4.0x) | 1.9 (1.6-3.7; 1.8x) |
| RGB 20 km | 2.4 (1.9-3.5) | 11.7 (9.6-24.0; 4.8x) | 11.5 (4.6-13.5; 4.7x) |
| CHM 9 km | 0.8 (0.5-1.1) | 5.1 (2.8-11.9; 6.5x) | invalid |
| CHM 20 km | 1.2 (1.0-1.9) | 13.8 (8.3-14.9; 11.3x) | invalid |

- **RGB `REG_TILES` statistics agree with the mosaic:** 9 km mean 91.2927 vs 91.2904, standard deviation 38.5840 vs 38.5836; 20 km mean 91.2750 vs 91.2735, standard deviation 38.3128 vs 38.3121; minimum and maximum identical. The combine logic is validated for RGB at 10 m.
- **CHM `REG_TILES` was a bug, not a result:** mean 0, standard deviation 0, minimum 9.2e18, maximum -9.2e18. With a combined reducer the outputs are prefixed with the band name even for a single-band image (`CHM_count`, `CHM_mean`, ...); the code looked up unsuffixed names and the default values hid the mismatch, so every tile counted as empty. Fixed (band-prefixed names always; the function now also returns the total pixel count and a case with zero pixels is recorded as an error). Not yet re-run. The CHM times (0.6 s, 1.2 s) are meaningless.
- **Do not conclude from the RGB `REG_TILES` timing.** In run 7 the first implementation took 1.0 s (9 km) and 2.1 s (20 km); here the leaner version took 1.9 s and 11.5 s. That may be the leaner implementation (more small server operations per tile, including the empty-tile guard) or the overlapping run. Needs a clean re-run, and an EECU measurement of the leaner version.

### Run 11 (2026-11-04 02:17 UTC): clean `REG_TILES` re-run, RGB and CHM `stats` at 10 m, 9 km and 20 km (`900`)

60 cases, 5 reps, no errors, nothing else running (replaces run 10). Raw CSV is in the Code Editor console output, not copied here.

Median wall-clock (s), fastest-slowest and ratio to ING:

| Case | ING | REG@900 (mosaic) | REG_TILES@900 (no mosaic) |
|---|---|---|---|
| RGB 9 km (99 tiles) | 1.1 (0.6-1.7) | 7.5 (4.8-9.4; 7.1x) | 2.7 (1.6-3.7; 2.6x) |
| RGB 20 km (356 tiles) | 2.1 (1.0-2.7) | 13.2 (11.1-21.7; 6.2x) | 7.5 (5.8-13.3; 3.5x) |
| CHM 9 km (101 tiles) | 0.4 (0.4-0.6) | 3.2 (2.8-11.8; 7.4x) | 0.7 (0.5-0.9; 1.7x) |
| CHM 20 km (352 tiles) | 0.8 (0.6-0.9) | 10.1 (7.9-11.9; 12.3x) | 1.5 (0.9-2.2; 1.8x) |

- **`REG_TILES` is 1.8x to 6.7x faster than the mosaic** and is about 1.7x to 1.8x ingested for CHM and 2.6x to 3.5x for RGB. The CHM bug is fixed.
- **Statistics agree with the mosaic.** CHM 9 km: mean 7.2946 vs 7.2931, standard deviation 9.2004 vs 9.2007; CHM 20 km: mean 6.6656 vs 6.6659, standard deviation 8.85475 vs 8.85480; RGB as in run 10; minimum and maximum identical.
- **Leaner version slower than the first.** RGB `REG_TILES` was 1.0 s (9 km) and 2.1 s (20 km) with the first implementation in run 7, and 2.7 s and 7.5 s now, while ING and REG medians are similar between the runs. The extra server operations per tile (empty-tile guard, arithmetic on each tile's results) are the likely cause; the first version had biased means (about 0.2% low) and cost 34.6 EECU·s. EECU of the current version is not measured.
- Reproducibility of the mosaic medians across clean runs (REG@900): RGB 9 km 7.8, 6.4, 6.2, 7.5 s; RGB 20 km 11.7, 9.3, 10.0, 13.2 s; CHM 9 km 4.3, 6.2, 3.2 s; CHM 20 km 8.4, 10.1, 10.1 s. Ratios to ingested: RGB 9 km 5.0x to 7.1x, RGB 20 km 5.2x to 8.1x, CHM 9 km 7.4x to 12.6x, CHM 20 km 6.3x to 12.3x.

### Profiler runs (2026-11-03): EECU-seconds, RGB `stats`, 9 km, 10 m, anchor [-84.469531, 31.240337]

Single mode (`MODE = 'single'`), Profiler on, one run per form. Single runs, so indicative.

| Item | ING (EECU·s) | REG@901 (EECU·s) |
|---|---|---|
| `ImageCollection.mosaic` | none | 22.828 (14 computations, peak 129k) |
| Loading assets | 0.225 (1 asset, peak 14M) | 1.534 (402 asset loads) |
| `Image.reduceRegion` | 1.211 (peak 838k) | 0.915 (peak 838k) |
| Plumbing and other | 0.025 | 0.114 (peak 14M) |
| **Total** | **about 1.46** | **about 25.4** |

- **Registered costs about 17x ingested in compute**, against about 5x in wall-clock time (3.7 s vs 0.7 s at 10 m in run 3). The platform's parallelism (14 computations of about 1.6 EECU·s each) hides most of the difference in elapsed time.
- **About 90% of the registered cost is `ImageCollection.mosaic`.** Reducing the region costs the same or less than for ingested, and loading the 402 tile assets (each tile is loaded once per computation it overlaps) is about 6%. So the penalty is the mosaic of 100 COG tiles, not file opening or the reduction.
- Result values: G mean 92.0793 (ING), 91.8017 (REG@901), the same as in run 3.
- Earlier wall-clock observations ("map rendering is close to ingested", run 3 ratios) understate the compute cost. Whether viewer map tiles trigger the same mosaic cost has not been measured.
`REG_FULL@901` (same setup, viewer-style whole-site mosaic and clip):

| Item | REG_FULL@901 (EECU·s) |
|---|---|
| `ImageCollection.mosaic` | 24.990 (14 computations, peak 89k) |
| Loading assets | 1.492 (502 asset loads) |
| `Image.reduceRegion` | 0.957 |
| Geometry, bounds, clip, mask | about 0.01 |
| Plumbing and other | 0.134 |
| **Total** | **about 27.6** (about 19x ING) |

- REG_FULL is about 9% above REG@901 (27.6 vs 25.4), probably within run-to-run noise (single runs). The clip and footprint calculation cost about 0.01 EECU·s; the extra 100 asset loads (502 vs 402) are the tile footprints read by `Collection.geometry`. For 901, REG and REG_FULL touch the same 100 tiles; for `900` (359 tiles) REG_FULL would also read all 359 footprints, which has not been profiled.
- Result values are identical to REG@901 (G mean 91.8017).

**REG_FULL@901 across scales** (same region and anchor, single runs):

| Scale | `ImageCollection.mosaic` | `Image.reduceRegion` | Loading assets | Total (EECU·s) |
|---|---|---|---|---|
| 100 m | 0.227 | 0.012 | 1.065 (502 loads) | about 1.5 |
| 10 m | 24.990 | 0.957 | 1.492 (502 loads) | about 27.6 |
| 1 m | 174.244 | 113.588 | 16.227 (2,406 loads) | about 308 |

(1 m total also includes about 3.8 plumbing and about 0.5 of small items. G means: 91.488 at 100 m, 91.802 at 10 m, 91.672 at 1 m.)

- **100 m is a fixed-cost floor**: about 1.5 EECU·s, 70% of it loading the 502 tile assets (about 15 ms of EECU per tile). The mosaic itself is almost free there.
- **The 10 m mosaic cost is out of proportion to the output pixel count.** 100 m to 10 m: 100x more output pixels, mosaic cost 110x. 10 m to 1 m: another 100x more output pixels, mosaic cost only 7x. If cost scales with source pixels read, the 10 m run reads about 14% of what the 1 m run reads, around 18 M source pixels per band against about 0.8 M needed for the 10 m grid (about 20x more), which looks like the 1.6 to 3.2 m overview level rather than the 6.4 m level that `901` also provides. This would also explain the flat wall-clock between 2 m and 10 m in run 3. Inference from cost only; the Profiler does not report which overview was read, and the rule Earth Engine uses to pick an overview level is not known.
- Ingested baseline at 1 m and 100 m not yet profiled, so ratios at those scales are unknown.
**REG@900, 20 km region (356 tiles), RGB `stats` at 10 m**, anchor [-84.463513, 31.244943], single run:

| Item | REG@900 20 km (EECU·s) |
|---|---|
| `ImageCollection.mosaic` | 161.453 (61 computations, peak 152k) |
| `Image.reduceRegion` | 8.317 |
| Loading assets | 0.370 (1,622 loads) |
| Plumbing and other | 0.71 |
| **Total** | **about 170.9** |

- **The mosaic is about 95% of the cost again**, and the wall-clock time for this run (about 12 s in run 6) corresponds to roughly 15x parallelism. This confirms that elapsed time levels off at 200+ tiles while compute keeps growing.
- **Compute grows faster than tiles or area.** Against the 9 km REG@901 run (about 25.4 EECU·s, 100 tiles, 14 computations): 3.6x the tiles, 4.9x the area, 4.4x the mosaic computations, but 6.7x the total EECU·s (mosaic 7.1x). The cost per mosaic computation rose from 1.6 to 2.7 EECU·s. (Later run of REG@900 at 9 km shows the version is not the cause; see below.) Hypothesis for the superlinear growth: each computation has to consider more candidate tiles in a larger collection.
- **ING at 20 km (measured):** `Image.reduceRegion` 5.767 + loading the asset 0.575 + plumbing 0.125 = **about 6.5 EECU·s**. So REG@900 costs about **26x** ING in compute at 20 km (170.9 vs 6.5), against about 8x in wall-clock time (11.7 s vs 1.5 s). The area-scaled extrapolation from 9 km (7 EECU·s) was close.
- **REG@900 at 9 km (measured):** mosaic 21.327 (14 computations) + `reduceRegion` 2.307 + plumbing 0.122 + loading 0.055 + 0.010 = **about 23.8 EECU·s**, vs about 25.4 for REG@901 at 9 km, so **`900` and `901` cost the same** (1.52 vs 1.63 EECU·s per mosaic computation). Therefore the growth from 9 km to 20 km is a size effect, not a version effect: total 7.2x (23.8 to 170.9) for 3.6x the tiles, 4.9x the area and 4.4x the computations, and the cost per mosaic computation rises from 1.52 to 2.65 EECU·s (+74%). Compute grows faster than linearly with site size.
- **Asset loading is much cheaper for 900 than 901.** About 400 tile loads cost 0.055 EECU·s for `900` (REG, 9 km) and 1.534 for `901` (REG, 9 km); 1,622 loads cost 0.37 for `900` at 20 km. That is about 0.14 to 0.23 ms per load for `900` against about 3 to 4 ms for `901`. This explains the `900` vs `901` difference at 100 m in run 3 (0.3 s vs 0.6 to 0.9 s), where asset loading dominates. Cause unknown (possibly different tile metadata; single runs, so a cold-cache effect on the first `901` run is not excluded).
- Per 256 px computation at 10 m: about 1.6 to 2.7 EECU·s registered vs about 0.09 ingested (1.211 EECU·s for 14 computations in `reduceRegion`), about 20x to 30x.
**REG_TILES@900, 20 km region (356 tiles), RGB `stats` at 10 m** (per-tile reduction, no mosaic; first implementation: sum, sum of squares, count, min, max per band), same anchor, single run:

| Item | REG_TILES@900 20 km (EECU·s) |
|---|---|
| `Image.reduceRegion` | 15.878 (19,937 operations) |
| Plumbing | 9.719 (110,512 operations) |
| Squaring step (`Image.double` 3.261, `addBands` 1.561, `multiply` 1.503, `rename` 1.436) | 7.761 |
| Aggregation container, `select`, asset loading, reprojection, other | about 1.2 |
| **Total** | **about 34.6** |

- **About 5x cheaper than the mosaic** (34.6 vs 170.9 for REG@900 at the same size) but **about 5x more than ingested** (6.5). In wall-clock time it matched ingested (run 7), so elapsed time and compute tell different stories again. Per tile: REG_TILES about 0.10 EECU·s, REG about 0.48, ING-equivalent about 0.02. Runs per 150 EECU-hours (540,000 EECU·s): about 15,600 for REG_TILES, 3,200 for REG, 83,000 for ING.
- Results agree with the earlier run: G mean 91.2481 (run 7: 91.2481), standard deviation 38.337.
- **Part of the cost is the implementation, not the pattern.** The squaring step (about 22% of the total) and the double-width image doubling the bands reduced exist only to combine standard deviations. A leaner version that returns count, mean, variance, minimum and maximum per tile avoids it; `tilesStats` was changed accordingly, to be re-measured.
- Not yet profiled: `902`, repeated runs for variance, REG_TILES after the change.

## Decisions

- **Keep the capped-overview collections for the viewer.** Seams in the deeper-overview version are not acceptable. Display quality is prioritised over export speed.
- **Accept slow full-site export.** It is rarely used and still works. The download-panel notice tells users to draw a crop box.
- **No code changes for export speed beyond the notice.** Options considered and not taken: crop-by-default, tile-count notice, mosaicking only the tiles in the crop, export-resolution selector.

## Known issues / open items

- **Production switch is not just `COG_STAGING = false`.** That setting points at the unprefixed collections, which have the seams. The comment near the config block still implies it is the production switch and should be reworded once the final collections are decided.
- **Export filename mislabels full-site exports.** The "Original filename" and the log use `drawingTools.layers().length() > 0` to decide crop vs full, but the drawing tool holds a layer as soon as it opens. Full-site exports are named `..._cropped_...`. Probably also present in 11G. The new `cropDrawnByUser` flag could be used instead; not yet changed.
- **Tile properties on the registered tiles are assumed.** `DOI`, `RELEASE_YEAR`, `PROVISIONAL_RELEASED`, `system:time_start`/`time_end`, `CITATION` are read by the metadata panel, sample scripts and MODIS date. Confirmed so far: the map renders and the dropdowns fill. Not yet confirmed for the metadata panel.
- **Full-site export on the largest site is untested.** It may time out instead of just being slow.
- **Possible slowdown:** `tiles.geometry()` unions every tile footprint on each image selection.
- The legacy `getCogImage` mention in a code comment refers to `getSelectedImage`/`mosaicCogTiles`.

## GRSM test checklist (largest site, once one site-year is registered)

1. `YEAR_SITE_VISIT` on the GRSM tiles is in the same format as JERC (e.g. `2026_GRSM_1`).
2. Site and image dropdowns list the GRSM site-year for RGB, CHM, DSM, DTM, Derived Terrain.
3. Map renders, centers on the full site, and the DSM/DTM/CHM default stretch looks sensible. The stretch reduce is capped at 3e7 pixels at 10 m (about 3,000 km²).
4. Image selection time compared with JERC (watch the footprint union).
5. Full-site RGB export: does the download complete, how long, and does the notice appear?
6. Crop export (small and medium) timings.
7. Sample script runs standalone in the Code Editor.
8. Statistics tool and metadata panel (DOI, dates) behave on the mosaic.
