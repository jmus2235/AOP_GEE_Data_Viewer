/**
 * Reflectance (hyperspectral) performance test: ingested vs registered COG, band-interleaved vs
 * pixel-interleaved. Earth Engine Code Editor script. Test site-year: 2026_REDB_6.
 *
 * Forms compared (same ground, same region, same operation):
 *   ING   ingested BRDF reflectance image  HSI_REFL/002/2026_REDB_6   (442 float bands)
 *   BAND  registered band-interleaved tiles REFL/REG                    (426 int16 bands, mosaicked)
 *   PIX   registered pixel-interleaved tiles testREFL/PIX               (426 int16 bands, mosaicked)
 *
 * Operations (each is one Earth Engine request, timed from request to result, wall-clock):
 *   bands3     mean of 3 bands (the viewer's false-colour bands B053, B035, B019) over a square region
 *   bands10    mean of 10 evenly spaced bands
 *   bands50    mean of 50 evenly spaced bands
 *   bandsAll   mean of all 426 bands (B001 to B426; the 16 extra bands in ING are QA bands, not used here).
 *              Water-absorption bands are set to -100 in the data (e.g. B300), so they are constants in the means.
 *   ndvi       mean NDVI from two bands (B096 about 860 nm, B056 about 660 nm)
 *   spec_point full spectrum (all 426 bands) of the single pixel at the anchor
 *   spec_poly  mean spectrum (all 426 bands) over a SPEC_POLY_M square at the anchor, at 1 m
 *   points     N_POINTS random pixels with all bands (sample), over the square region
 *
 * What to expect (hypotheses, not results): pixel-interleaved should win for spec_point, spec_poly,
 * points and bandsAll; band-interleaved should win for bands3 and probably bands10, because it only has
 * to read the bands asked for. The comparison with ING shows what the move to COG costs or saves.
 *
 * How to run (read the README notes in COG_migration_notes.md for the general rules):
 *   - Do NOT press Run again while a run is going; the old run keeps executing and contaminates the
 *     timings. Reload the tab to stop it.
 *   - Single mode (MODE = 'single') runs one case once; switch the Profiler on BEFORE pressing Run to get
 *     EECU-seconds. Matrix mode gives wall-clock timings only (compare medians; differences under about
 *     25% are noise).
 *   - Paste the whole console output back, including the CSV lines at the end.
 *
 * Registered tiles currently have no YEAR_SITE_VISIT property (the data owner will add it to the final
 * data). Until then they are selected with AOP_ID; change REG_FILTER_PROP when the final data exist.
 */

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
var MODE = 'matrix';                       // 'matrix' or 'single'

var REGISTERED_ROOT = 'projects/neon-nonprod-earthengine/assets';
var INGESTED_ROOT = 'projects/neon-prod-earthengine/assets';
var PATH_BAND = REGISTERED_ROOT + '/REFL/REG';
var PATH_PIX = REGISTERED_ROOT + '/testREFL/PIX';
var PATH_ING = INGESTED_ROOT + '/HSI_REFL/002';

var REG_FILTER_PROP = 'AOP_ID';            // change to 'YEAR_SITE_VISIT' once the final tiles have it
var REG_ID = '2026_REDB_6';
var ING_ID = '2026_REDB_6';

var FORMS = ['ING', 'BAND', 'PIX'];
var OP_LIST = ['bands3', 'bands10', 'bands50', 'bandsAll', 'ndvi', 'spec_point', 'spec_poly', 'points'];
var SIZES_KM = [1, 3];                     // side of the square region for the region operations
var SCALES = [1, 10];                      // reduction scales in metres for the region operations
var SPEC_POLY_M = 100;                     // side of the square for spec_poly
var N_POINTS = 1000;                       // points: number of random pixels
var SEED = 7;
var REPS = 2;                              // the form order is rotated each repeat. Defaults give about 140 requests;
                                           // trim OP_LIST first if that is too long (each request is seconds to a minute)
var MAX_VALUES = 1e9;                      // skip region cases with more than this many (pixels x bands)
var MAX_CASES = 400;
var ANCHOR = null;                         // [lon, lat]; null = centre of the registered band-interleaved tiles, found by unioning the tile
                                           // footprints, which can be very slow. Prefer pasting the anchor printed by cog_redb_anchor.js.
var RUN_LABEL = '';

// Single mode: one case, one repeat. form is 'ING', 'BAND' or 'PIX'.
var SINGLE = {form: 'BAND', op: 'bands3', sizeKm: 1, scale: 10};

// Diagnostic block printed before the timings (band names of the ingested image, and a check that all
// three forms give the same mean for one band, to see whether the units agree).
var RUN_DIAGNOSTIC = true;

// tileScale passed to every reduceRegion/sample (1 = default). The band-interleaved layout failed with
// "User memory limit exceeded" for bandsAll 1 km @1 m and points 3 km at the default; try 4 (the viewer's stats
// tool uses 4) for ALL forms to see whether it lets them complete, and report timings only for that setting.
var TILE_SCALE = 1;

// A short random id shown on every progress line and in the CSV run column, so two overlapping runs
// (Run pressed twice) can be told apart. If you see two ids in the console, the timings are contaminated.
var runId = Math.random().toString(36).slice(2, 6);
var runLabel = (RUN_LABEL || new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') + ' #' + runId;

// ----------------------------------------------------------------------------
// Images
// ----------------------------------------------------------------------------
function bandName(i) { return 'B' + ('00' + i).slice(-3); }

// n evenly spaced band names out of B001..B426.
function bandList(n) {
  var out = [];
  for (var k = 0; k < n; k++) out.push(bandName(n === 1 ? 1 : 1 + Math.round(k * 425 / (n - 1))));
  return out;
}

var OP_BANDS = {
  bands3: ['B053', 'B035', 'B019'],
  bands10: bandList(10),
  bands50: bandList(50),
  bandsAll: bandList(426),
  ndvi: ['B096', 'B056'],
  spec_point: bandList(426),
  spec_poly: bandList(426),
  points: bandList(426)
};

function registeredMosaic(path) {
  var tiles = ee.ImageCollection(path).filter(ee.Filter.eq(REG_FILTER_PROP, REG_ID));
  var first = ee.Image(tiles.first());
  return ee.Image(tiles.mosaic().setDefaultProjection(first.projection()));
}

var IMAGES = {
  ING: ee.Image(ee.ImageCollection(PATH_ING).filter(ee.Filter.eq('system:index', ING_ID)).first()),
  BAND: registeredMosaic(PATH_BAND),
  PIX: registeredMosaic(PATH_PIX)
};

// ----------------------------------------------------------------------------
// Operations. Each returns an ee object; valueOf() extracts one number for a sanity check.
// ----------------------------------------------------------------------------
var MEAN = ee.Reducer.mean();

function squareAround(anchor, sideM) {
  return ee.Geometry.Point(anchor).buffer(sideM / 2).bounds();
}

function runOp(op, image, anchor, sizeKm, scale) {
  var bands = OP_BANDS[op];
  if (op === 'spec_point') {
    return image.select(bands).reduceRegion({reducer: MEAN, geometry: ee.Geometry.Point(anchor), scale: 1, maxPixels: 1e9, tileScale: TILE_SCALE});
  }
  if (op === 'spec_poly') {
    return image.select(bands).reduceRegion({reducer: MEAN, geometry: squareAround(anchor, SPEC_POLY_M), scale: 1, maxPixels: 1e9, tileScale: TILE_SCALE});
  }
  var region = squareAround(anchor, sizeKm * 1000);
  if (op === 'points') {
    return image.select(bands).sample({region: region, scale: 1, numPixels: N_POINTS, seed: SEED, tileScale: TILE_SCALE}).size();
  }
  if (op === 'ndvi') {
    return image.normalizedDifference(bands).reduceRegion({reducer: MEAN, geometry: region, scale: scale, maxPixels: 1e13, tileScale: TILE_SCALE});
  }
  return image.select(bands).reduceRegion({reducer: MEAN, geometry: region, scale: scale, maxPixels: 1e13, tileScale: TILE_SCALE});
}

function valueOf(op, result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'number') return result;
  var key = op === 'ndvi' ? 'nd' : OP_BANDS[op][0];
  return (result[key] === undefined) ? null : result[key];
}

// Whether a case is region-size / scale dependent.
function usesRegion(op) { return op !== 'spec_point' && op !== 'spec_poly'; }
function usesScale(op) { return ['bands3', 'bands10', 'bands50', 'bandsAll', 'ndvi'].indexOf(op) >= 0; }

// ----------------------------------------------------------------------------
// Case list
// ----------------------------------------------------------------------------
function rotate(list, k) { var n = k % list.length; return list.slice(n).concat(list.slice(0, n)); }

function buildTasks() {
  var forms = FORMS, ops = OP_LIST, sizes = SIZES_KM, scales = SCALES, reps = REPS;
  if (MODE === 'single') {
    forms = [SINGLE.form]; ops = [SINGLE.op]; sizes = [SINGLE.sizeKm]; scales = [SINGLE.scale]; reps = 1;
  }
  var groups = [];
  ops.forEach(function(op) {
    (usesRegion(op) ? sizes : [0]).forEach(function(size) {
      (usesScale(op) ? scales : [1]).forEach(function(scale) {
        if (usesRegion(op) && usesScale(op)) {
          var values = Math.pow(size * 1000 / scale, 2) * OP_BANDS[op].length;
          if (values > MAX_VALUES) { print('skip ' + op + ' ' + size + ' km @' + scale + ' m (too many values: ' + values.toExponential(1) + ')'); return; }
        }
        groups.push({op: op, size: size, scale: scale});
      });
    });
  });
  var tasks = [];
  for (var rep = 1; rep <= reps; rep++) {
    groups.forEach(function(g) {
      rotate(forms, rep - 1).forEach(function(f) {
        tasks.push({form: f, op: g.op, size: g.size, scale: g.scale, rep: rep});
      });
    });
  }
  return tasks;
}

// ----------------------------------------------------------------------------
// Runner (strictly sequential: the next request starts after the previous one returns)
// ----------------------------------------------------------------------------
var rows = [];

function median(a) {
  var s = a.slice().sort(function(x, y) { return x - y; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summarize() {
  var groups = {};
  rows.forEach(function(r) {
    var k = [r.op, r.sizeKm, r.scale].join('|');
    (groups[k] = groups[k] || {})[r.form] = (groups[k][r.form] || []).concat([r]);
  });
  print('==== Summary: median seconds (fastest-slowest) and ratio to ING; value = mean of first band/NDVI/count ====');
  Object.keys(groups).forEach(function(k) {
    var g = groups[k], p = k.split('|');
    var ingMed = g.ING ? median(g.ING.filter(function(r) { return r.ok; }).map(function(r) { return r.ms; })) : null;
    var parts = FORMS.filter(function(f) { return g[f]; }).map(function(f) {
      var ok = g[f].filter(function(r) { return r.ok; });
      if (!ok.length) return f + ': all failed (' + g[f][0].err + ')';
      var t = ok.map(function(r) { return r.ms / 1000; });
      var med = median(t);
      var vals = ok.map(function(r) { return r.val; }).filter(function(v) { return v !== null; });
      return f + ' ' + med.toFixed(1) + ' s (' + Math.min.apply(null, t).toFixed(1) + '-' + Math.max.apply(null, t).toFixed(1) + ')' +
        (ingMed && f !== 'ING' ? ' x' + (med / (ingMed / 1000)).toFixed(2) : '') +
        (vals.length ? ' val ' + (+vals[0].toPrecision(6)) : ' val null');
    });
    print(p[0] + (p[1] > 0 && usesRegion(p[0]) ? ' ' + p[1] + ' km' : '') + (usesScale(p[0]) ? ' @' + p[2] + ' m' : '') + ': ' + parts.join(' | '));
  });
  print('==== CSV ====');
  print('run,form,op,size_km,scale_m,rep,seconds,ok,value,error,site_year_reg,site_year_ing,source,tile_scale');
  var SOURCE = {
    ING: PATH_ING + '/' + ING_ID,
    BAND: PATH_BAND + ' (' + REG_FILTER_PROP + '=' + REG_ID + ')',
    PIX: PATH_PIX + ' (' + REG_FILTER_PROP + '=' + REG_ID + ')'
  };
  rows.forEach(function(r) {
    print([runLabel, r.form, r.op, r.sizeKm, r.scale, r.rep, (r.ms / 1000).toFixed(2), r.ok, r.val, (r.err || '').replace(/[,\n]/g, ' '),
           REG_ID, ING_ID, SOURCE[r.form], TILE_SCALE].join(','));
  });
}

function runTasks(tasks, anchor) {
  print('Running ' + tasks.length + ' requests, one at a time. Do not press Run again until "==== Summary" appears.');
  function next(i) {
    if (i >= tasks.length) { summarize(); return; }
    var t = tasks[i];
    var img = IMAGES[t.form].set('bust', runLabel + '|' + t.form + '|' + t.op + '|' + t.size + '|' + t.scale + '|' + t.rep + '|' + Math.random());
    var result = runOp(t.op, ee.Image(img), anchor, t.size, t.scale);
    var t0 = Date.now();
    result.evaluate(function(v, err) {
      var ms = Date.now() - t0;
      var row = {form: t.form, op: t.op, sizeKm: t.size, scale: t.scale, rep: t.rep, ms: ms, ok: !err, val: err ? null : valueOf(t.op, v), err: err || ''};
      rows.push(row);
      print('[' + runId + '] ' + (i + 1) + '/' + tasks.length + ' ' + t.form + ' ' + t.op + (usesRegion(t.op) ? ' ' + t.size + 'km' : '') +
            (usesScale(t.op) ? ' @' + t.scale + 'm' : '') + ' rep' + t.rep + ': ' + (ms / 1000).toFixed(1) + ' s' + (err ? ' ERROR ' + err : ''));
      next(i + 1);
    });
  }
  next(0);
}

// ----------------------------------------------------------------------------
// Diagnostic and start
// ----------------------------------------------------------------------------
function diagnostic(anchor, done) {
  print('Anchor [lon, lat]: ' + JSON.stringify(anchor));
  var names = IMAGES.ING.bandNames();
  ee.Dictionary({
    ingBands: names.size(),
    ingLastBands: names.slice(-18),
    ingScale: IMAGES.ING.select(0).projection().nominalScale()
  }).evaluate(function(v, err) {
    print('Ingested image: ' + (err ? 'ERROR ' + err : JSON.stringify(v)));
    var region = squareAround(anchor, 1000);
    var out = {};
    var pending = FORMS.length;
    FORMS.forEach(function(f) {
      IMAGES[f].select(['B100', 'B053']).reduceRegion({reducer: MEAN, geometry: region, scale: 4, maxPixels: 1e10})
        .evaluate(function(m, e2) {
          out[f] = e2 ? 'ERROR ' + e2 : m;
          if (--pending === 0) {
            print('Mean of B100 and B053 over 1 km at 4 m (units should agree between forms; ING is float): ' + JSON.stringify(out));
            done();
          }
        });
    });
  });
}

function start(anchor) {
  var tasks = buildTasks();
  if (tasks.length > MAX_CASES) { print('Refusing to start: ' + tasks.length + ' requests > MAX_CASES ' + MAX_CASES); return; }
  if (RUN_DIAGNOSTIC && MODE === 'matrix') diagnostic(anchor, function() { runTasks(tasks, anchor); });
  else runTasks(tasks, anchor);
}

if (ANCHOR) {
  start(ANCHOR);
} else {
  ee.ImageCollection(PATH_BAND).filter(ee.Filter.eq(REG_FILTER_PROP, REG_ID)).geometry().bounds().centroid(1)
    .coordinates().evaluate(function(c, err) {
      if (err) { print('Could not compute the anchor: ' + err); return; }
      start(c);
    });
}
