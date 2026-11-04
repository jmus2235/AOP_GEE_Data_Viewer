# README: cog_vs_ingested_perf_test.js

An Earth Engine Code Editor script that measures how long common analyses take on NEON AOP data stored in two ways, so the two can be compared fairly:

- **Ingested**: one Earth Engine image per site-year (the current production data).
- **Registered COG**: many 1 km Cloud Optimized GeoTIFF tiles per site-year, registered in place and combined into one image on the fly.

The script runs the same analysis on the same ground area against each form, times it, and prints a table you can copy into a spreadsheet. Results live in this folder next to the notes in `COG_migration_notes.md`.

## What gets compared (the "forms")

| Form | What it is |
|---|---|
| `ING` | The ingested image for the site-year, picked by `system:index`. |
| `REG@<version>` | Registered tiles for the site-year from collection `<version>` (e.g. `901`). Only the tiles that touch the test region are mosaicked together. This is what a typical analysis script would do. |
| `REG_FULL@<version>` | All registered tiles for the site-year are mosaicked and clipped to the tile bounds. This is how the data viewer builds its image (`mosaicCogTiles`). |

| `REG_TILES@<version>` | Optional. The registered tiles touching the region are reduced one at a time and the pieces are combined into the same mean, standard deviation, minimum and maximum, with **no mosaic**. It exists because the Profiler showed that about 90 to 95% of the registered compute is the mosaic step. Comparing it with `REG` shows how much of the cost comes from mosaicking and how much from reading the COG tiles. It only supports the `stats` analysis (other analyses are skipped for this form). |

`REG`, `REG_FULL` and `REG_TILES` are repeated once for every version listed in `REG_VERSIONS`, so `['901', '900']` with `FORMS = ['ING', 'REG', 'REG_FULL']` gives five forms: `ING`, `REG@901`, `REG@900`, `REG_FULL@901`, `REG_FULL@900`. Add `'REG_TILES'` to `FORMS` to include the per-tile form.

How `REG_TILES` combines the tiles: for each band, each tile returns its pixel count, mean, variance, minimum and maximum over the region. The script combines these across tiles, weighting by pixel count: the overall mean is the count-weighted mean of the tile means, and the overall variance is the count-weighted mean of (tile variance + tile mean squared) minus the overall mean squared. The standard deviation is the square root of that population variance (the same definition Earth Engine's own standard-deviation reducer uses). The result should match `REG` closely at native scale. Small differences at coarse scales are possible, because each tile is reduced on its own pixel grid and pixels on tile edges are split differently.

## How to run it

1. Open the script in the Code Editor.
2. Edit the **CONFIG** block at the top (see below).
3. Press Run, and keep the tab open until the Console says `Done`. Closing or reloading the tab loses the run, because results are only printed at the end.
4. Copy the Summary and the CSV from the Console into a file in this folder.

A progress label in the Console shows the current case (for example `17/100 REG@901 RGB stats 9km 1m rep2`).

## Settings you will change most often

| Setting | Meaning |
|---|---|
| `PRODUCT_LIST` | Which products to test: `RGB`, `CHM`, `DSM`, `DTM`. |
| `OP_LIST` | Which analyses to run (see "The analyses"). |
| `SIZES_KM` | Side length of the square test region, in km (e.g. `[1, 9]`). |
| `SCALES` | Pixel sizes, in metres, at which the scale-dependent analyses are run, per product. |
| `REPS` | How many times each case is repeated. More repeats give a steadier median. |
| `REG_VERSIONS`, `ANCHOR_VERSION` | Registered collections to compare, and which one's footprint centre the regions are placed on. |
| `REG_ID`, `ING_ID` | The site-year in each form (both `2026_JERC_9` at the moment). |
| `SHARED_ANCHOR` | `true` puts every form's region on the same ground (see step 3). |
| `MAX_PIXELS`, `MAX_CASES` | Safety limits that skip very heavy cases or refuse a very long run. |
| `RUN_LABEL` | Text written to the `run` column of every CSV row. Leave empty to use the date and time of the run. Use it to tell repeat runs of the same configuration apart when their CSVs are combined. |
| `MODE` | `'matrix'` (the full run), `'single'` (one case for the Profiler), or `'centres'` (only print dataset centres and footprint sizes). |

## What the script does, step by step

### 1. Check that the data exists
For each product the script counts how many ingested images match `ING_ID` and how many registered tiles match `REG_ID` in each version. If anything is missing it says so (and, for the ingested side, prints the site-years that do exist) and stops, rather than running a long matrix that cannot work.

### 2. Find where each dataset is
It asks Earth Engine for the bounding box of the ingested image and of each registered version. From each box it works out the centre and the length of the shorter side in metres. These are printed so you can see them, and they are used for placing and limiting the test regions.

### 3. Build the list of cases
A "case" is one form × product × analysis × region size × scale × repeat. The script lays them out as follows:

- Analyses that do not apply to a product are dropped (for example the DTM slope test does not apply to RGB).
- Analyses that depend on scale are run at every scale in `SCALES`. Analyses that work on plots or sampled points always run at the product's own pixel size (RGB 0.1 m, lidar products 1 m).
- A case is **skipped** if the region would contain more pixels than `MAX_PIXELS` at that scale (this is what keeps 0.1 m RGB off large regions), or if the region is bigger than 95% of the smallest footprint involved. Skipped cases are listed in the Console.
- Each repeat runs the forms in a **rotated order** (rep 1 starts with `ING`, rep 2 with the next form, and so on). This stops any one form always being first, which would make it pay the cost of reading the data cold.
- If the total is above `MAX_CASES` the script prints a message and stops.

### 4. Place the test regions
Each region is a square, centred on one point and sized in km. With `SHARED_ANCHOR = true` the centre is the centre of the `ANCHOR_VERSION` footprint for every form, so all forms read exactly the same ground. This only makes sense when `ING_ID` and `REG_ID` are the same flight. The region edges are drawn in latitude/longitude, so they are approximately square, and they are not lined up with the 1 km tile grid. That is why a "1 km" region touches 4 tiles.

### 5. Run each case, one at a time
Cases run strictly one after the other so that the script's own requests do not compete with each other. For each case:

1. **Count tiles touched** (registered forms only). This is a quick query done before timing starts, and it is remembered so it is only done once per product, version and size.
2. **Build the image for that form** (see the table above), then attach a unique, meaningless image property. That property makes the request look new to Earth Engine each time, so a repeat is not answered from Earth Engine's result cache. Without it, repeats of the ingested case came back in about 0.2 s instead of about 5 s, which made ingested look far faster than it is.
3. **Apply the analysis** (see below) to build the request.
4. **Start the clock, ask Earth Engine for the answer, and stop the clock when the answer arrives.** The recorded time is wall-clock time from request to response.
5. Record the form, product, analysis, size, scale, repeat, tiles touched, milliseconds, `ok` or `error`, and a **check value** (see below).

If a case fails (for example a memory limit), the error text is stored and the run carries on.

### 6. Print the results
- **Summary**: one line per product/analysis/size/scale showing the median time in seconds for each form, followed in brackets by the fastest and slowest repeat and the ratio of the median to `ING`, for example `6.4s (3.8-11.3; 5.4x)` (median 6.4 s, repeats from 3.8 to 11.3 s, 5.4 times slower than ingested). It also shows the number of tiles touched and the number of errors if any. A wide fastest-slowest range means the median is less trustworthy.
- **Statistics by form**: one line per product/analysis/size/scale showing, for each form, the mean, standard deviation and maximum of the result, with the percentage difference from `ING` in brackets. This is where the effect of overview resampling (averaged versus nearest-neighbour) shows up: at coarse scales an averaged pyramid has a smaller spread and lower maximum than one made by nearest-neighbour. `math` and `focal` give a standard deviation only, and `plots` and `points` give only a mean.
- **CSV**: every individual case, for later analysis. Columns: `run, form, product, op, size_km, scale_m, rep, tiles, ms, status, value, std, min, max, note`. `run` is the run label (see `RUN_LABEL`). `value` is the mean; `std`, `min` and `max` are filled for `stats` (`math` and `focal` fill `std` only) and are blank otherwise.

## The analyses

All of them run on the test region and return a small result; the time is how long that took.

| Name | What it does |
|---|---|
| `stats` | Mean, standard deviation, minimum and maximum of the product's bands over the whole region (`reduceRegion`), at each scale in `SCALES`. |
| `hist` | A 50-bin histogram of one band, plus its mean, over the region, at each scale. |
| `plots` | Mean value inside 100 randomly placed 40 m squares (like NEON plots), using `reduceRegions`, at the product's own pixel size. |
| `points` | A random sample of 1000 pixels (`sample`), at the product's own pixel size. |
| `math` | Per-pixel arithmetic, then a mean and standard deviation: excess green for RGB, canopy cover (fraction of CHM above 2 m) for CHM, and DSM minus DTM for DSM. |
| `focal` | A neighbourhood operation, then a mean: a 3-pixel circular focal maximum for CHM, and slope for DTM. |

The random plots and points use a fixed seed, so every form is asked about the same locations.

### Why each analysis is included

The analyses are chosen so that each one stresses a different way of reading the data. If registered COGs are slower than ingested images, the pattern across these tests shows which kind of access is responsible.

| Name | Why it is in the set |
|---|---|
| `stats` | The simplest whole-region read: every pixel in the region is read once and reduced to a few numbers. It is the baseline for everything else. Because it runs at several scales, it is also the test of how the two forms handle coarser pixel sizes (ingested images carry Earth Engine's own pyramid; COGs only have the overviews stored in the file). It is also the same kind of calculation the viewer's legend statistics and "Draw and Generate stats" tool run. |
| `hist` | Reads the same pixels as `stats` but with a heavier reducer (a 50-bin histogram). It checks that any difference between forms comes from reading the data, not from the reducer. If `hist` and `stats` rank the forms the same way, the reducer does not matter. |
| `plots` | The most common researcher workflow: pulling summary values for many small field plots (NEON TOS plots are 40 m). Instead of one large read it makes many small reads scattered across the region and across tile boundaries. This shows whether COG tiles and blocks add a cost per read that a single large read hides. |
| `points` | Extracting values at scattered individual pixels, as when building training data for a model. It is the smallest possible read per location, so it exposes fixed per-request or per-tile overhead more than any other test. |
| `math` | Per-pixel arithmetic on the mosaic before reducing (excess green from three RGB bands, canopy cover from CHM, DSM minus DTM from two bands). It checks that computing on a mosaic of tiles costs no more than computing on one ingested image, and it reads several bands at once, which the single-band tests do not. |
| `focal` | Neighbourhood operations (a focal maximum on CHM, slope from DTM). Each output pixel needs its neighbours, including pixels across the edge of a tile, so this tests whether a mosaic of tiles behaves like one continuous image. The viewer's terrain products (slope, aspect, hillshade) are this kind of calculation. |

Together they cover: one large read at several scales (`stats`, `hist`), many small reads (`plots`), scattered single-pixel reads (`points`), multi-band computation (`math`), and reads that cross tile edges (`focal`).

## The check value and the other statistics

Every case also stores one number taken from its result, normally the mean of the product's check band (G for RGB, otherwise the band itself). Because every form reads the same ground, this number should match across forms. For `stats` cases the standard deviation, minimum and maximum of the same band are stored too.

- At the product's native pixel size the values should agree almost exactly. If they do not, something is wrong with a mosaic or a collection.
- At coarser scales the values can differ slightly, because ingested images and COG overviews are built differently. Small differences there are expected, but systematic ones are worth reporting to whoever builds the COGs.

## Single mode (for EECU-seconds)

With `MODE = 'single'` the script runs just the one case set in `SINGLE` (form, product, analysis, size, scale, anchor) and prints its result straight away. Open the Code Editor's **Profiler** tab and turn it on before pressing Run; it then reports EECU-seconds (Earth Engine compute cost) and peak memory for that case. This is a better measure than wall-clock time, because it does not include waiting in queues. The matrix mode cannot provide it.

**Rendering mode.** Setting `SINGLE.op` to `'render'` adds the image for the chosen form and product to the map, centred on `SINGLE.anchor` at `SINGLE.zoom`, using display settings similar to the viewer's (RGB stretch with gamma, the CHM green palette, grey ramps for DSM and DTM). With the Profiler on, it lists the map tiles drawn for the layer, so it measures what the viewer spends when a user looks at the data, which is different from the `reduceRegion` analyses. The number of tiles depends on the map panel size and zoom, so keep both identical for every form (`ING`, `REG@<version>` and `REG_FULL@<version>`). `REG_TILES` has no image to draw. Whether the Profiler captures map tiles in the same table as other computations should be checked the first time.

To compare forms in single mode, run the script once per form with everything the same except `SINGLE.form`. The region centre `SINGLE.anchor` is required and must be identical every time, otherwise the forms read different ground. To get it, run once with `MODE = 'centres'`, which only prints each dataset's centre as `[lon, lat]` and its shorter footprint side, and paste the centre of the registered version you use as `ANCHOR_VERSION`.

## Checking how much of the variation is the Earth Engine backend

The repeats inside one run happen within a few minutes of each other, so they share the same backend conditions. Shared capacity changes over minutes and hours, and that part of the variation is not visible inside one run. To measure it:

1. Choose a compact benchmark (about 60 to 100 cases, for example RGB and CHM `stats` at 10 m, 9 km and 20 km, forms `ING`, `REG@900` and `REG_TILES@900`, 5 repeats) and do not change it.
2. Run it at least three times, spread over different times of day and ideally different days, not back to back.
3. Save each run's CSV with its `run` label.
4. Compare the run medians for each case. If they agree within about 20%, one run's median can be trusted. If they differ by 2x or more, differences of that size between forms are not meaningful.

For the Profiler (EECU) single-mode numbers, repeat the key cases 2 or 3 times. EECU measures compute, not waiting, so it should vary much less than wall-clock time.

## Do not start a second run while one is still running

Pressing Run again in the Code Editor does not cancel the earlier run's pending Earth Engine requests. The old run keeps executing and keeps printing to the Console, and the two runs compete for capacity, which inflates the timings of both (and mixes their output in one Console). Wait until the Console shows `Done: N cases` before pressing Run again. To stop a run that is already going, reload the Code Editor tab.

## Reading the results with care

- **Wall-clock time is noisy.** It includes waiting for shared Earth Engine capacity. Use the median of several repeats and ignore differences smaller than about 2× when absolute times are under a second or two. Many small cases sit at a floor of roughly 0.2 to 0.3 s that is just request round-trip time.
- **Compare like with like.** `ING` and `REG` must be the same flight and the same ground. The script does the second part (shared anchor) but cannot check the first: it assumes `REG_ID` and `ING_ID` hold the same flight, and that every version in `REG_VERSIONS` holds the same site-year.
- **The ingested image is the whole site.** The registered versions may cover less (for example `901` is a 100-tile subset). Regions are sized to fit the smallest footprint.
- **Cold versus warm.** Earth Engine caches some data lower down than the script can reach, so a case right after another that read the same files can be faster. Rotating the form order spreads that effect but does not remove it.
- **One site-year, one product at a time.** Results do not yet say anything about other sites, or about hyperspectral data.

## Not covered yet

- Hyperspectral (HSI) products and band-subset or spectrum-extraction tests.
- Export to Drive or asset.
- Tests that vary the COG tile size (2000×2000 px versus 1000×1000 px).
- Stress tests that push the region size until a case fails.
