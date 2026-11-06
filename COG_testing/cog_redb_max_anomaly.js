/**
 * Locate the RGB maximum anomaly (Earth Engine Code Editor). Site-year: 2026_REDB_6.
 *
 * Background (COG_migration_notes.md, run 12 and run 17): over the 5 km square at the REDB anchor, the
 * maximum of the green band is higher in the registered tiles than in the ingested image when it is
 * computed at coarse scales: 207 (REG) vs 183 (ING) at 10 m, and 213 vs 160 at 32 m. The 1 km and 3 km
 * squares agree within 3%. This script finds WHERE the registered maximum is, what the two forms
 * contain there at several scales, and which registered tile holds it.
 *
 * What it does, for each scale in SCALES (all requests are small; wall-clock timing is not the point):
 *   1. Maximum of band G over the square, ING and REG (REG = mosaic of the registered tiles that touch the
 *      square, like form REG in the harness).
 *   2. Bounding box (lon/lat) and count of the pixels at or within 0.5 of that maximum, in each form, on the
 *      same output grid as the reduction in step 1.
 *   3. G mean, min and max in a WINDOW_M square around the centre of the REG maximum, at 10 m, 1 m and
 *      0.1 m (native), for both forms, plus the ids of the registered tile(s) containing that point.
 *   4. Adds both RGB layers to the map, centred on the REG maximum, plus a marker, to look at the ground.
 *
 * How to read the result:
 *   - REG max pixels at the edge of a tile or of the site (bounding box close to a tile or footprint edge),
 *     or ING having no such value there at 0.1 m: an overview/edge artefact of the registered data.
 *   - Same 0.1 m maximum in both forms but a different 10 m (or 32 m) maximum: a bright real object that the
 *     ingested pyramid averages down and the registered overviews keep (resampling difference, not an error).
 *
 * Run it once (Profiler off). Paste the whole console output back.
 */

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
var REGISTERED_ROOT = 'projects/neon-nonprod-earthengine/assets';
var INGESTED_ROOT = 'projects/neon-prod-earthengine/assets';
var REG_PATH = REGISTERED_ROOT + '/RGB/REG';
var ING_PATH = INGESTED_ROOT + '/RGB/001';
var SITE_YEAR = '2026_REDB_6';
var ANCHOR = [-111.780094, 40.800975];
var SIZE_KM = 5;
var SCALES = [10, 32];                     // scales (m) at which the maximum is located
var WINDOW_M = 200;                        // side of the square examined around the REG maximum
var WINDOW_SCALES = [10, 1, 0.1];
var BAND = 'G';
var VIS = {bands: ['R', 'G', 'B'], min: 40, max: 200, gamma: 0.65};

// ----------------------------------------------------------------------------
// Images and region
// ----------------------------------------------------------------------------
function makeRegion(lon, lat, sizeKm) {
  var dLat = (sizeKm * 500) / 111320;
  var dLon = dLat / Math.cos(lat * Math.PI / 180);
  return ee.Geometry.Rectangle([lon - dLon, lat - dLat, lon + dLon, lat + dLat], null, false);
}

var region = makeRegion(ANCHOR[0], ANCHOR[1], SIZE_KM);
var tiles = ee.ImageCollection(REG_PATH).filter(ee.Filter.eq('YEAR_SITE_VISIT', SITE_YEAR));
var near = tiles.filterBounds(region);
var REG = ee.Image(near.mosaic().setDefaultProjection(ee.Image(near.first()).projection()));
var ING = ee.Image(ee.ImageCollection(ING_PATH).filter(ee.Filter.eq('system:index', SITE_YEAR)).first());

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
// Value of the single entry of a one-band reduceRegion result.
function onlyNumber(d) {
  var k = Object.keys(d || {});
  return k.length ? d[k[0]] : null;
}

// Value whose key starts with prefix and ends with '_' + stat (combined reducers are prefixed with the band name).
function pick(d, prefix, stat) {
  var keys = Object.keys(d || {});
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k.indexOf(prefix) === 0 && k.slice(-(stat.length + 1)) === '_' + stat) return d[k];
  }
  return null;
}

function maxOf(img, scale) {
  return ee.Dictionary(img.select(BAND).reduceRegion({
    reducer: ee.Reducer.max(), geometry: region, scale: scale, maxPixels: 1e13
  }));
}

// Bounding box and count of the pixels with G >= thr, on the grid defined by G (G stays the first band).
function whereAtLeast(img, thr, scale) {
  var g = img.select(BAND);
  var masked = g.addBands(ee.Image.pixelLonLat()).updateMask(g.gte(thr));
  var reducer = ee.Reducer.minMax().combine({reducer2: ee.Reducer.count(), sharedInputs: true});
  return ee.Dictionary(masked.reduceRegion({
    reducer: reducer, geometry: region, scale: scale, maxPixels: 1e13
  }));
}

function describeWhere(label, w) {
  return label + ': ' + pick(w, 'G', 'count') + ' pixel(s); G ' + pick(w, 'G', 'min') + ' to ' + pick(w, 'G', 'max') +
    '; lon ' + pick(w, 'longitude', 'min') + ' to ' + pick(w, 'longitude', 'max') +
    '; lat ' + pick(w, 'latitude', 'min') + ' to ' + pick(w, 'latitude', 'max');
}

function evaluateOr(obj, label, next) {
  obj.evaluate(function(v, err) {
    if (err) { print(label + ': ERROR ' + err); return; }
    next(v);
  });
}

// ----------------------------------------------------------------------------
// Step 3: what both forms hold around the REG maximum
// ----------------------------------------------------------------------------
function windowStats(lon, lat, next) {
  var point = ee.Geometry.Point([lon, lat]);
  var win = point.buffer(WINDOW_M / 2).bounds();
  var reducer = ee.Reducer.mean().combine({reducer2: ee.Reducer.minMax(), sharedInputs: true});
  var out = {};
  WINDOW_SCALES.forEach(function(s) {
    ['ING', 'REG'].forEach(function(name) {
      var img = name === 'ING' ? ING : REG;
      out[name + '_' + s] = ee.Dictionary(img.select(BAND).reduceRegion({
        reducer: reducer, geometry: win, scale: s, maxPixels: 1e13
      }));
    });
  });
  out.tiles = tiles.filterBounds(point).aggregate_array('system:index');
  evaluateOr(ee.Dictionary(out), 'window statistics', function(w) {
    print('Registered tile(s) containing the REG maximum: ' + JSON.stringify(w.tiles));
    WINDOW_SCALES.forEach(function(s) {
      ['ING', 'REG'].forEach(function(name) {
        var d = w[name + '_' + s];
        print('  ' + WINDOW_M + ' m square, ' + name + ' at ' + s + ' m: mean ' + pick(d, 'G', 'mean') +
          ', min ' + pick(d, 'G', 'min') + ', max ' + pick(d, 'G', 'max'));
      });
    });
    next();
  });
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
var located = null;   // {lon, lat} of the REG maximum at the first scale, used for the map

function analyse(i) {
  if (i >= SCALES.length) {
    if (located) {
      var p = ee.Geometry.Point([located.lon, located.lat]);
      Map.centerObject(p, 18);
      Map.addLayer(ING, VIS, 'ING RGB');
      Map.addLayer(REG, VIS, 'REG RGB');
      Map.addLayer(p, {color: 'FF0000'}, 'REG maximum (scale ' + SCALES[0] + ' m)');
    }
    print('Done. Paste the whole console output back.');
    return;
  }
  var scale = SCALES[i];
  print('=== Scale ' + scale + ' m, ' + SIZE_KM + ' km square at [' + ANCHOR + '], ' + SITE_YEAR + ' ===');
  evaluateOr(ee.Dictionary({ing: maxOf(ING, scale), reg: maxOf(REG, scale)}), 'maxima at ' + scale + ' m', function(m) {
    var ingMax = onlyNumber(m.ing), regMax = onlyNumber(m.reg);
    print('Maximum of ' + BAND + ': ING ' + ingMax + ', REG ' + regMax);
    var where = ee.Dictionary({reg: whereAtLeast(REG, regMax - 0.5, scale), ing: whereAtLeast(ING, ingMax - 0.5, scale)});
    evaluateOr(where, 'maximum locations at ' + scale + ' m', function(w) {
      print(describeWhere('REG maximum (G >= ' + (regMax - 0.5) + ')', w.reg));
      print(describeWhere('ING maximum (G >= ' + (ingMax - 0.5) + ')', w.ing));
      var lon = (pick(w.reg, 'longitude', 'min') + pick(w.reg, 'longitude', 'max')) / 2;
      var lat = (pick(w.reg, 'latitude', 'min') + pick(w.reg, 'latitude', 'max')) / 2;
      print('Centre of the REG maximum pixels: [' + lon + ', ' + lat + ']  (if the bounding box is large there is more than one cluster)');
      if (!located) located = {lon: lon, lat: lat};
      windowStats(lon, lat, function() { analyse(i + 1); });
    });
  });
}

analyse(0);
