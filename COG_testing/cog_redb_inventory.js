/**
 * Inventory of the REDB registered COG collections (Earth Engine Code Editor). Version 3 (adds block 6, reflectance details).
 *
 * Purpose: before designing the REDB / hyperspectral tests, find out
 *   1. which collections really hold data (tile counts, site-years per collection),
 *   2. how the band-interleaved (REFL/REG) and pixel-interleaved (testREFL/PIX) reflectance
 *      collections differ (band count, band names, tile size, projection, properties),
 *   3. whether the semi-final RGB overviews (62.5 and 31.25 m rounded up to 63 and 32 m) give
 *      coarse-scale means that agree with the ingested image over the same footprint,
 *   4. which ingested REDB years and which ingested HSI/BRDF collections exist for pairing.
 *
 * Version 2 changes: fixed the band-name slice that crashed for 1 to 3 band products; all results
 * are printed as plain text (JSON) so nothing is collapsed in the console; reflectance property
 * names are listed separately from the per-band properties; the RGB overview check also compares
 * against the ingested image; the prod HSI folders are listed.
 *
 * Each block evaluates independently, so a missing collection only breaks its own line.
 * LIDAR_QA is deliberately not included (not being tested).
 */

var ROOT = 'projects/neon-nonprod-earthengine/assets';
var PROD_ROOT = 'projects/neon-prod-earthengine/assets';
var SITE_PROP = 'YEAR_SITE_VISIT';

var PATHS = {
  'REFL band-interleaved':  ROOT + '/REFL/REG',
  'REFL pixel-interleaved': ROOT + '/testREFL/PIX',
  'RGB':                    ROOT + '/RGB/REG',
  'CHM':                    ROOT + '/CHM/REG',
  'DEM':                    ROOT + '/DEM/REG'
};

// Site-year used for the RGB overview check against the ingested image (ingested RGB image id).
// Set it to one of the registered RGB site-years printed by block 1 (edit after the first run).
var RGB_CHECK_SITE_YEAR = '2026_REDB_6';
var RGB_CHECK_SCALES = [1, 4, 8, 16, 32, 63, 125, 250];

function show(title, eeObj) {
  // Evaluate and print as JSON text so the console does not collapse it.
  eeObj.evaluate(function(v, err) {
    print(title + ': ' + (err ? 'ERROR ' + err : JSON.stringify(v)));
  });
}

Object.keys(PATHS).forEach(function(label) {
  var path = PATHS[label];
  var col = ee.ImageCollection(path);

  // 1. Counts per site-year.
  show(label + ' | counts | ' + path, ee.Dictionary({
    tiles: col.size(),
    tilesPerSiteYear: col.aggregate_histogram(SITE_PROP)
  }));

  // 2. First tile: bands, projection, size.
  var first = ee.Image(col.first());
  var b0 = first.select(0);
  var names = first.bandNames();
  var n = names.size();
  show(label + ' | first tile', ee.Dictionary({
    firstTileId: first.get('system:index'),
    nBands: n,
    firstBands: names.slice(0, n.min(5)),
    lastBands: names.slice(n.subtract(5).max(0), n),
    nativeScale: b0.projection().nominalScale(),
    crs: b0.projection().crs(),
    approxTilePx: b0.geometry().bounds(1).perimeter(1).divide(4).divide(b0.projection().nominalScale()),
    bandTypes: first.bandTypes().values().slice(0, n.min(3))
  }));

  // 3. Properties. The band-interleaved reflectance tile has 437 properties (mostly per band),
  // so split them: general property names vs per-band ones.
  first.toDictionary().evaluate(function(props, err) {
    if (err) { print(label + ' | properties: ERROR ' + err); return; }
    var keys = Object.keys(props);
    var perBand = keys.filter(function(k) { return /B\d{3}/.test(k); });
    var general = keys.filter(function(k) { return !/B\d{3}/.test(k); });
    var generalVals = {};
    general.forEach(function(k) {
      var v = props[k];
      generalVals[k] = (typeof v === 'string' && v.length > 120) ? v.slice(0, 120) + '...' : v;
    });
    print(label + ' | properties: ' + keys.length + ' total, ' + perBand.length + ' per-band. General: ' +
          JSON.stringify(generalVals) +
          (perBand.length ? ' | example per-band keys: ' + JSON.stringify(perBand.slice(0, 4)) : ''));
  });
});

// 4. RGB overview check against the ingested image over the same footprint.
// One registered tile (first tile of RGB_CHECK_SITE_YEAR) is reduced at several scales for the
// registered and the ingested image. If the registered means drift from the ingested means at the
// coarse scales (and the ingested ones do not), the overview resampling is the cause.
var regRgb = ee.ImageCollection(PATHS['RGB']).filter(ee.Filter.eq(SITE_PROP, RGB_CHECK_SITE_YEAR));
var tile = ee.Image(regRgb.first());
var ingRgb = ee.Image(PROD_ROOT + '/RGB/001/' + RGB_CHECK_SITE_YEAR);
var checkGeom = tile.geometry();
var rows = RGB_CHECK_SCALES.map(function(scale) {
  function mean(img) {
    return ee.Number(img.select(0).reduceRegion({
      reducer: ee.Reducer.mean(), geometry: checkGeom, scale: scale, maxPixels: 1e10
    }).values().get(0));
  }
  return ee.Dictionary({scale: scale, registered: mean(tile), ingested: mean(ingRgb)});
});
show('RGB overview check (band 1 mean over first ' + RGB_CHECK_SITE_YEAR + ' tile; null = no pixels)',
     ee.List(rows));

// 5. Ingested REDB ids (so pairing years are known) and the ingested HSI folders.
['RGB', 'CHM', 'DEM'].forEach(function(p) {
  show('Ingested ' + p + ' REDB ids',
       ee.ImageCollection(PROD_ROOT + '/' + p + '/001')
         .filter(ee.Filter.stringContains('system:index', 'REDB'))
         .aggregate_array('system:index'));
});

function listAssets(parent, title) {
  ee.data.listAssets(parent, {}, function(res, err) {
    if (err) { print(title + ' (could not list): ' + err); return; }
    print(title + ': ' + JSON.stringify((res.assets || []).map(function(a) {
      return a.id.replace(parent + '/', '') + ' [' + a.type + ']';
    })));
  });
}
// 6. Reflectance details (added in version 3).
// 6a. The registered reflectance tiles have no YEAR_SITE_VISIT property (AOP_ID is used instead), so
//     print one per-band property value to see what it holds (wavelength information?).
var reflBand = ee.Image(ee.ImageCollection(PATHS['REFL band-interleaved']).first());
show('REFL band-interleaved per-band property values (B001, B100, B426)', ee.Dictionary({
  B001: reflBand.get('WL_FWHM_B001'), B100: reflBand.get('WL_FWHM_B100'), B426: reflBand.get('WL_FWHM_B426')
}));
// 6b. Are the two layouts the same data? Same tile, bands 100 and 300, mean at 4 m.
var reflPix = ee.Image(ee.ImageCollection(PATHS['REFL pixel-interleaved'])
  .filter(ee.Filter.eq('TILE_KEY', reflBand.get('TILE_KEY'))).first());
function tileMean(img) {
  return img.select(['B100', 'B300']).reduceRegion({
    reducer: ee.Reducer.mean(), geometry: reflBand.geometry(), scale: 4, maxPixels: 1e10});
}
show('REFL same tile mean at 4 m, band-interleaved vs pixel-interleaved',
     ee.Dictionary({bandInterleaved: tileMean(reflBand), pixelInterleaved: tileMean(reflPix)}));
// 6c. Ingested reflectance for REDB: ids, band count, scale and band names in HSI_REFL/001 and /002.
['001', '002'].forEach(function(v) {
  var col = ee.ImageCollection(PROD_ROOT + '/HSI_REFL/' + v);
  show('Ingested HSI_REFL/' + v + ' REDB ids', col
    .filter(ee.Filter.stringContains('system:index', 'REDB')).aggregate_array('system:index'));
  var img = ee.Image(col.filter(ee.Filter.stringContains('system:index', 'REDB')).first());
  show('Ingested HSI_REFL/' + v + ' first REDB image', ee.Dictionary({
    id: img.get('system:index'), nBands: img.bandNames().size(),
    firstBands: img.bandNames().slice(0, 3), nativeScale: img.select(0).projection().nominalScale(),
    type: img.bandTypes().values().get(0)
  }));
});

listAssets(PROD_ROOT + '/HSI_REFL', 'Prod HSI_REFL');
listAssets(ROOT + '/REFL', 'Non-prod REFL');
listAssets(ROOT + '/testREFL', 'Non-prod testREFL');
listAssets(ROOT + '/RGB', 'Non-prod RGB');
