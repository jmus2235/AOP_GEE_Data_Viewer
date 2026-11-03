# AOP GEE Data Viewer: COG migration notes

Working notes for moving the viewer from ingested images to registered COG tile collections.
Test build: `Display_AOP_Image_Collections_app_11G_COG_test.js` (copy of 11G; 11G is unchanged).
Last updated: 2026-11-02.

## Scope

- **Phase 1 (this test build):** RGB, CHM and DEM (DSM, DTM, Derived Terrain) read from registered COG tiles.
- **Phase 2 (not started):** hyperspectral (HSI) products. HSI and CNC are still read from the prod ingested collections.

## Collections

| Product | Ingested (prod) | Registered (test) |
|---|---|---|
| RGB | `projects/neon-prod-earthengine/assets/RGB/001` | `projects/neon-nonprod-earthengine/assets/testRGB/REG` |
| CHM | `.../CHM/001` | `.../testCHM/REG` |
| DEM | `.../DEM/001` | `.../testDEM/REG` |

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
- Map rendering is close to ingested; rendering is not the problem.
- Interpretation (hypothesis, not proven): cost scales with the number of tiles touched and with the overview level that has to be read. With capped overviews the coarsest RGB level is 1.6 m, so a 10 m export reads a much finer level than it needs; CHM and DEM stop at 8 m, which is close to what the export needs. A per-file open cost also appears to remain, since the deeper-overview RGB export is still about 5x slower than ingested.

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
