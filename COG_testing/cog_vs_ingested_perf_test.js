/**
 * COG vs ingested performance test harness (Earth Engine Code Editor).
 *
 * Compares the cost of common analyses on NEON AOP products stored as
 *   ING       ingested image (one image per site-year, prod project)
 *   REG       registered COG tiles, only the tiles touching the region are mosaicked
 *             (what a typical analysis script does)
 *   REG_FULL  registered COG tiles, whole site-year mosaicked and clipped to the tile bounds
 *             (what the viewer's mosaicCogTiles does)
 *   REG_TILES registered COG tiles reduced one by one and combined, with no mosaic ('stats' only);
 *             shows how much of the registered cost is the mosaic itself
 *
 * Two modes (MODE below):
 *   'matrix'  Runs a product x operation x region size x scale x repeat matrix one case at a
 *             time, logs wall-clock time per case, tiles touched and the result value,
 *             then prints a CSV and a median summary to the Console.
 *   'single'  Prints one case synchronously, so the Profiler tab reports EECU-seconds and peak
 *             memory for it. Open the Profiler tab (Code Editor, top right of the Console
 *             panel) and turn it on before pressing Run. Use this for the EECU numbers; the
 *             matrix only has wall-clock time. With op 'render' it adds the layer to the map
 *             instead, to profile map-tile rendering (what the viewer's quota is spent on).
 *
 * Notes on interpreting results
 *   - Wall-clock time includes shared-capacity queueing; treat single runs as indicative and
 *     use the median over REPS.
 *   - BUST_CACHE sets a unique no-op image property (and adds a no-op collection filter) on every
 *     run, so the computation is not served from the Earth Engine result cache. File and tile level
 *     caches below that cannot be busted, which matches real use. Check that the ingested times do
 *     not collapse to ~0.2 s on repeat reps of a heavy case; if they do, caching is still active.
 *   - Compare ING with REG/REG_FULL only when they hold the SAME flight. Until a paired site-year
 *     exists the comparison is confounded by site and year (see COG_migration_notes.md).
 *   - Regions are squares centred on the centre of each dataset's footprint, so they are not
 *     aligned to the 1 km tile grid; "tiles" in the log is the number of registered tiles the
 *     region touches.
 */

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
var MODE = 'matrix';                      // 'matrix', 'single', or 'centres' (only print the dataset centres and footprint sizes)

var REGISTERED_ROOT = 'projects/neon-nonprod-earthengine/assets';
var INGESTED_ROOT = 'projects/neon-prod-earthengine/assets';
var REG_VERSIONS = ['901', '900'];        // registered collection names to compare, test{PRODUCT}/{version}
var ANCHOR_VERSION = '901';               // with SHARED_ANCHOR, regions are centred on this version's footprint (use the smallest one)
var STAGING = true;                       // registered collections are test{RGB|CHM|DEM} (true) or {RGB|CHM|DEM}
var SITE_PROP = 'YEAR_SITE_VISIT';

var REG_ID = '2026_JERC_9';               // registered site-year (YEAR_SITE_VISIT)
var ING_ID = '2026_JERC_9';               // ingested site-year (system:index); if not found, the ids for that site are printed

var FORMS = ['ING', 'REG', 'REG_FULL'];  // also 'REG_TILES' (per-tile reduce, no mosaic, 'stats' only); registered forms run once per version in REG_VERSIONS
var SHARED_ANCHOR = true;                 // true: every form uses ANCHOR_VERSION's footprint centre, so all forms read the same pixels
                                          // (use when REG_ID and ING_ID are the same flight); false: each form uses its own footprint centre
var PRODUCT_LIST = ['CHM'];               // any of 'RGB', 'CHM', 'DSM', 'DTM'
var OP_LIST = ['stats', 'focal', 'plots']; // any of 'stats', 'hist', 'plots', 'points', 'math', 'focal'
var SIZES_KM = [1, 9];                    // side length of the square test region
var SCALES = {                            // reduction scales in metres for the scale-dependent ops
  RGB: [0.1, 1, 10, 100],
  CHM: [1, 10, 100],
  DSM: [1, 10, 100],
  DTM: [1, 10, 100]
};
var EXTENT_OVERRIDE = null;               // {lon, lat, shortSideM}: use this centre and footprint short side for every form and skip the
                                          // footprint lookup, which can take very long (it unions every tile footprint). Get the numbers from
                                          // cog_redb_anchor.js. MODE 'centres' then just echoes them.
var TILES_CLIENT_COMBINE = true;          // REG_TILES: one reduceRegion per tile, results combined in the browser (see tilesStats and combineTiles).
                                          // false = the earlier server-side combination (about 3.9 to 4.1 EECU-s at REDB 5 km). UNTESTED until run.
var REPS = 5;                             // the form order is rotated each repeat to spread first-read (cold) costs
var BUST_CACHE = true;
var MAX_PIXELS = 5e8;                     // skip scale-dependent cases covering more pixels than this
var MAX_CASES = 600;                      // refuse to start a matrix larger than this
var N_PLOTS = 100;                        // 'plots': number of random square plots
var PLOT_SIDE_M = 40;                     // 'plots': plot side length (NEON TOS plots are 40 m)
var N_POINTS = 1000;                      // 'points': number of random pixels sampled
var SEED = 7;
var RUN_LABEL = '';                       // written to the 'run' column of every CSV row so repeat runs can be pooled; empty = date and time of the run

// Single mode: one case. anchor = [lon, lat] centre of the region (required, and the same for every
// form being compared so they read the same ground). MODE = 'centres' prints the dataset centres;
// paste the REG@<ANCHOR_VERSION> one here. form is 'ING', 'REG@<version>', 'REG_FULL@<version>' or
// 'REG_TILES@<version>' (stats only). op is one of the OPS names, or 'render' to profile map-tile
// rendering instead: the layer is added to the map centred on the anchor at the given zoom, and the Profiler
// lists the tiles drawn. Keep the zoom and map panel size the same for every form so the tile count matches.
var SINGLE = {form: 'REG@901', product: 'RGB', op: 'stats', sizeKm: 9, scale: 10, zoom: 13, anchor: null};

var runLabel = RUN_LABEL || new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

// Form labels: 'ING', and 'REG@<version>' / 'REG_FULL@<version>' for each version in REG_VERSIONS.
var FORM_LIST = [];
FORMS.forEach(function(f) {
  if (f === 'ING') FORM_LIST.push(f);
  else REG_VERSIONS.forEach(function(v) { FORM_LIST.push(f + '@' + v); });
});

function parseForm(label) {
  var p = label.split('@');
  return {kind: p[0], version: p[1]};
}

function rotate(list, k) {
  var n = k % list.length;
  return list.slice(n).concat(list.slice(0, n));
}

// ----------------------------------------------------------------------------
// Product and operation definitions
// ----------------------------------------------------------------------------
// vis = display settings used only by the 'render' case of single mode (RGB and CHM as in the viewer;
// DSM and DTM stretched for the JERC elevation range, so adjust them for other sites).
var PRODUCTS = {
  RGB: {folder: 'RGB', bands: ['R', 'G', 'B'], check: 'G', native: 0.1,
        vis: {min: 40, max: 200, gamma: 0.65}},
  CHM: {folder: 'CHM', bands: ['CHM'], check: 'CHM', native: 1,
        vis: {min: 0, max: 35, palette: ['E6F7E0', '063B00']}},
  DSM: {folder: 'DEM', bands: ['DSM'], check: 'DSM', native: 1,
        vis: {min: 25, max: 80, palette: ['000000', 'FFFFFF']}},
  DTM: {folder: 'DEM', bands: ['DTM'], check: 'DTM', native: 1,
        vis: {min: 25, max: 65, palette: ['000000', 'FFFFFF']}}
};

function regPath(folder, version) {
  return REGISTERED_ROOT + '/' + (STAGING ? 'test' : '') + folder + '/' + version;
}

function ingPath(folder) {
  return INGESTED_ROOT + '/' + folder + '/001';
}

var meanStd = ee.Reducer.mean().combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true});
var meanStdMinMax = meanStd.combine({reducer2: ee.Reducer.minMax(), sharedInputs: true});

function regionStats(image, region, scale, reducer) {
  return ee.Dictionary(image.reduceRegion({
    reducer: reducer, geometry: region, scale: scale, maxPixels: 1e13
  }));
}

// Output property name of a mean over the product's bands (single-band reducers are unsuffixed).
function meanProp(product) {
  var p = PRODUCTS[product];
  return p.bands.length > 1 ? p.check : 'mean';
}

// native: true = fixed at the product's native scale (ignores SCALES and MAX_PIXELS).
// Each fn returns an ee.Dictionary; the client picks a mean-like number out of it as a check value.
var OPS = {
  // Mean, standard deviation, min and max over the region.
  stats: {
    native: false, applies: ['RGB', 'CHM', 'DSM', 'DTM'],
    fn: function(img, product, region, scale) {
      return regionStats(img.select(PRODUCTS[product].bands), region, scale, meanStdMinMax);
    }
  },
  // Histogram of one band plus its mean.
  hist: {
    native: false, applies: ['RGB', 'CHM', 'DSM', 'DTM'],
    fn: function(img, product, region, scale) {
      var reducer = ee.Reducer.histogram(50).combine({reducer2: ee.Reducer.mean(), sharedInputs: true});
      return regionStats(img.select([PRODUCTS[product].check]), region, scale, reducer);
    }
  },
  // reduceRegions over random square plots (all bands of the product, native scale).
  plots: {
    native: true, applies: ['RGB', 'CHM', 'DSM', 'DTM'],
    fn: function(img, product, region, scale) {
      var plots = ee.FeatureCollection.randomPoints({region: region, points: N_PLOTS, seed: SEED})
        .map(function(f) { return f.buffer(PLOT_SIDE_M / 2).bounds(); });
      var fc = img.select(PRODUCTS[product].bands).reduceRegions({
        collection: plots, reducer: ee.Reducer.mean(), scale: scale
      });
      return ee.Dictionary({mean: fc.aggregate_mean(meanProp(product)), n: fc.size()});
    }
  },
  // Random pixel sample (all bands of the product, native scale).
  points: {
    native: true, applies: ['RGB', 'CHM', 'DSM', 'DTM'],
    fn: function(img, product, region, scale) {
      var fc = img.select(PRODUCTS[product].bands).sample({
        region: region, scale: scale, numPixels: N_POINTS, seed: SEED
      });
      return ee.Dictionary({mean: fc.aggregate_mean(PRODUCTS[product].check), n: fc.size()});
    }
  },
  // Per-pixel math then reduce: RGB excess green, CHM canopy cover (> 2 m), DSM - DTM.
  math: {
    native: false, applies: ['RGB', 'CHM', 'DSM'],
    fn: function(img, product, region, scale) {
      var out;
      if (product === 'RGB') {
        var r = img.select('R').toFloat(), g = img.select('G').toFloat(), b = img.select('B').toFloat();
        out = g.multiply(2).subtract(r).subtract(b).divide(r.add(g).add(b)).rename('ExG');
      } else if (product === 'CHM') {
        out = img.select('CHM').gt(2).rename('cover');
      } else {
        out = img.select('DSM').subtract(img.select('DTM')).rename('diff');
      }
      return regionStats(out, region, scale, meanStd);
    }
  },
  // Neighbourhood op then reduce: CHM focal max (radius 3 px), DTM slope.
  focal: {
    native: false, applies: ['CHM', 'DTM'],
    fn: function(img, product, region, scale) {
      var out = product === 'CHM'
        ? img.select('CHM').focal_max({radius: 3, kernelType: 'circle', units: 'pixels'}).rename('focal_max')
        : ee.Terrain.slope(img.select('DTM')).rename('slope');
      return regionStats(out, region, scale, meanStd);
    }
  }
};

// Form REG_TILES (no mosaic): each registered tile touching the region is reduced on its own
// (count, mean, variance, min, max per band) and the pieces are combined into the same statistics
// 'stats' returns: mean = sum(n * mean) / sum(n); variance = sum(n * (variance + mean^2)) / sum(n) - mean^2
// (population standard deviation, like ee.Reducer.stdDev). Only 'stats' is supported. Tiles do not
// overlap, so no pixel is counted twice. Result keys match 'stats'.
// (An earlier version squared the image to get the sums of squares; that cost about 22% more compute.)
function tilesStats(product, version, region, scale, salt) {
  var p = PRODUCTS[product];
  var tiles = regTiles(p.folder, version, salt).filterBounds(region);
  var reducer = ee.Reducer.count()
    .combine({reducer2: ee.Reducer.mean(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.variance(), sharedInputs: true})
    .combine({reducer2: ee.Reducer.minMax(), sharedInputs: true});
  if (TILES_CLIENT_COMBINE) {
    // One reduceRegion per tile; its dictionary becomes the feature's properties and is referenced once.
    // The Profiler (REDB 5 km, 35 tiles, 2026-11-04) showed the version below running the reduction about
    // 45 times per tile (1,576 Image.select calls = 35 x 45), because the dictionary is referenced 15 times.
    return ee.FeatureCollection(tiles.map(function(tile) {
      return ee.Feature(null, ee.Image(tile).select(p.bands).reduceRegion({
        reducer: reducer, geometry: region, scale: scale, maxPixels: 1e13
      }));
    }));
  }
  // With a combined reducer the outputs are always prefixed with the band name, also for a single-band
  // image (CHM_count, CHM_mean, ...). The first version of this function assumed unsuffixed names for
  // single-band products and, because of the default values below, silently returned zeros for CHM.
  function key(b, stat) { return b + '_' + stat; }
  // A tile that only touches the edge of the region can contain no pixels, and reduceRegion then returns
  // missing or null values (this broke the first version of this function). Neutral values are used for
  // those tiles so they do not affect the combined result.
  function val(s, k, dflt) {
    var v = s.get(k, dflt);
    return ee.Number(ee.Algorithms.If(ee.Algorithms.IsEqual(v, null), dflt, v));
  }
  var perTile = tiles.map(function(tile) {
    var s = ee.Dictionary(ee.Image(tile).select(p.bands).reduceRegion({
      reducer: reducer, geometry: region, scale: scale, maxPixels: 1e13
    }));
    var props = {};
    p.bands.forEach(function(b) {
      var n = val(s, key(b, 'count'), 0);
      var m = val(s, key(b, 'mean'), 0);
      var v = val(s, key(b, 'variance'), 0);
      props[b + '_n'] = n;
      props[b + '_nm'] = n.multiply(m);
      props[b + '_nss'] = n.multiply(v.add(m.pow(2)));
      props[b + '_min'] = val(s, key(b, 'min'), 1e30);
      props[b + '_max'] = val(s, key(b, 'max'), -1e30);
    });
    return ee.Feature(null, props);
  });
  var out = {};
  p.bands.forEach(function(b) {
    var n = ee.Number(perTile.aggregate_sum(b + '_n'));
    var mean = ee.Number(perTile.aggregate_sum(b + '_nm')).divide(n);
    var variance = ee.Number(perTile.aggregate_sum(b + '_nss')).divide(n).subtract(mean.pow(2));
    var k = p.bands.length > 1 ? b + '_' : '';
    out[k + 'mean'] = mean;
    out[k + 'stdDev'] = variance.max(0).sqrt();
    out[k + 'min'] = perTile.aggregate_min(b + '_min');
    out[k + 'max'] = perTile.aggregate_max(b + '_max');
  });
  // Total pixel count of the first band; a count of 0 means nothing was read (see runCase).
  out.n = ee.Number(perTile.aggregate_sum(p.bands[0] + '_n'));
  return ee.Dictionary(out);
}

// Client-side combination of the per-tile feature collection returned by tilesStats when
// TILES_CLIENT_COMBINE is true. Same formulas as the server-side version above, same output keys.
function combineTiles(info, product) {
  var p = PRODUCTS[product];
  var feats = (info && info.features) || [];
  var out = {};
  p.bands.forEach(function(b, bi) {
    var n = 0, nm = 0, nss = 0, mn = Infinity, mx = -Infinity;
    feats.forEach(function(f) {
      var q = f.properties || {};
      var c = q[b + '_count'];
      if (typeof c !== 'number' || c <= 0) return;      // tile with no pixels in the region
      var m = q[b + '_mean'], v = q[b + '_variance'];
      n += c;
      nm += c * m;
      nss += c * (v + m * m);
      if (q[b + '_min'] < mn) mn = q[b + '_min'];
      if (q[b + '_max'] > mx) mx = q[b + '_max'];
    });
    var mean = nm / n;
    var k = p.bands.length > 1 ? b + '_' : '';
    out[k + 'mean'] = mean;
    out[k + 'stdDev'] = Math.sqrt(Math.max(0, nss / n - mean * mean));
    out[k + 'min'] = mn;
    out[k + 'max'] = mx;
    if (bi === 0) out.n = n;
  });
  return out;
}

// ----------------------------------------------------------------------------
// Image construction
// ----------------------------------------------------------------------------
var saltCounter = 0;

// No-op metadata filter with a unique value, so the computation graph (and its result cache key) is new.
function bust(col, salt) {
  return salt === null ? col : col.filter(ee.Filter.neq('system:index', 'cache_bust_' + salt));
}

function newSalt() {
  return BUST_CACHE ? (Date.now() + '_' + (saltCounter++)) : null;
}

function regTiles(folder, version, salt) {
  return bust(ee.ImageCollection(regPath(folder, version)).filter(ee.Filter.eq(SITE_PROP, REG_ID)), salt);
}

// Sets a unique no-op image property so the final expression is new for every run. The collection
// filter in bust() alone was not enough: for the single ingested image it is resolved when the request
// is compiled, so repeats of the same case were served from the result cache (~0.2 s instead of ~5 s).
function getImage(form, product, region, salt) {
  var image = buildImage(form, product, region, salt);
  return salt === null ? image : ee.Image(image.set('cache_bust', salt));
}

// region is only used by form REG (to mosaic just the tiles that touch it).
function buildImage(form, product, region, salt) {
  var folder = PRODUCTS[product].folder;
  var f = parseForm(form);
  if (f.kind === 'ING') {
    return ee.Image(bust(ee.ImageCollection(ingPath(folder)).filter(ee.Filter.eq('system:index', ING_ID)), salt).first());
  }
  var tiles = regTiles(folder, f.version, salt);
  if (f.kind === 'REG') {
    var near = tiles.filterBounds(region);
    return ee.Image(near.mosaic().setDefaultProjection(ee.Image(near.first()).projection()));
  }
  // REG_FULL: same construction as mosaicCogTiles in the viewer
  var first = ee.Image(tiles.first());
  return ee.Image(tiles.mosaic()
    .setDefaultProjection(first.projection())
    .clip(tiles.geometry().bounds()));
}

// ----------------------------------------------------------------------------
// Regions
// ----------------------------------------------------------------------------
function makeRegion(lon, lat, sizeKm) {
  var dLat = (sizeKm * 500) / 111320;
  var dLon = dLat / Math.cos(lat * Math.PI / 180);
  return ee.Geometry.Rectangle([lon - dLon, lat - dLat, lon + dLon, lat + dLat], null, false);
}

// Ring coordinates of a bounds rectangle -> centre and the shorter side in metres.
function describeExtent(coords) {
  var ring = coords[0];
  var xs = ring.map(function(c) { return c[0]; });
  var ys = ring.map(function(c) { return c[1]; });
  var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
  var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
  var lat = (ymin + ymax) / 2;
  var widthM = (xmax - xmin) * 111320 * Math.cos(lat * Math.PI / 180);
  var heightM = (ymax - ymin) * 111320;
  return {lon: (xmin + xmax) / 2, lat: lat, shortSideM: Math.min(widthM, heightM)};
}

// ----------------------------------------------------------------------------
// Result handling
// ----------------------------------------------------------------------------
function median(a) {
  if (!a.length) return null;
  var s = a.slice().sort(function(x, y) { return x - y; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// First mean-like number in a result dictionary (prefers the product's check band).
function pickValue(res, product) {
  if (!res) return '';
  var keys = Object.keys(res);
  var want = [PRODUCTS[product].check + '_mean', 'mean'];
  for (var i = 0; i < want.length; i++) {
    if (typeof res[want[i]] === 'number') return res[want[i]];
  }
  for (var j = 0; j < keys.length; j++) {
    if (/mean$/.test(keys[j]) && typeof res[keys[j]] === 'number') return res[keys[j]];
  }
  return '';
}

// A named statistic (stdDev, min, max) for the product's check band, or '' if the analysis does not return it.
function pickStat(res, product, name) {
  if (!res) return '';
  var keys = [PRODUCTS[product].check + '_' + name, name];
  for (var i = 0; i < keys.length; i++) {
    if (typeof res[keys[i]] === 'number') return res[keys[i]];
  }
  return '';
}

function csvCell(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
  return /[,"]/.test(s) ? '"' + s.slice(0, 160) + '"' : s;
}

// value = mean of the check band; std, min and max are filled for 'stats' (math and focal give std only).
// site_year_reg, site_year_ing and source say which site-year and which collection/image each row read.
var CSV_COLS = ['run', 'form', 'product', 'op', 'size_km', 'scale_m', 'rep', 'tiles', 'ms', 'status', 'value', 'std', 'min', 'max', 'note',
                'site_year_reg', 'site_year_ing', 'source'];

function toCsv(rows) {
  var lines = [CSV_COLS.join(',')];
  rows.forEach(function(r) {
    lines.push(CSV_COLS.map(function(c) { return csvCell(r[c]); }).join(','));
  });
  return lines.join('\n');
}

// One line per (product, op, size, scale): median seconds per form, with the fastest and slowest
// repeat and the ratio of the median to ING in brackets, e.g. "6.4s (3.8-11.3; 5.4x)".
function summarize(rows) {
  var groups = {};
  var order = [];
  rows.forEach(function(r) {
    var key = [r.product, r.op, r.size_km + 'km', r.scale_m + 'm'].join(' ');
    if (!groups[key]) { groups[key] = {}; order.push(key); }
    var g = groups[key];
    if (!g[r.form]) g[r.form] = {ms: [], errors: 0, tiles: r.tiles};
    if (r.status === 'ok') g[r.form].ms.push(r.ms); else g[r.form].errors++;
  });
  return order.map(function(key) {
    var g = groups[key];
    var ing = g.ING && g.ING.ms.length ? median(g.ING.ms) : null;
    var parts = FORM_LIST.map(function(f) {
      if (!g[f]) return f + ' -';
      var m = median(g[f].ms);
      var txt = 'FAILED';
      if (m !== null) {
        var lo = Math.min.apply(null, g[f].ms);
        var hi = Math.max.apply(null, g[f].ms);
        var ratio = f !== 'ING' && ing ? '; ' + (m / ing).toFixed(1) + 'x' : '';
        txt = (m / 1000).toFixed(1) + 's (' + (lo / 1000).toFixed(1) + '-' + (hi / 1000).toFixed(1) + ratio + ')';
      }
      if (g[f].errors) txt += ' [' + g[f].errors + ' err]';
      if (f !== 'ING' && g[f].tiles) txt += ' [' + g[f].tiles + ' tiles]';
      return f + ' ' + txt;
    });
    return key + ' | ' + parts.join(' | ');
  }).join('\n');
}

// One line per (product, op, size, scale): mean, standard deviation and maximum for each form (first
// successful repeat; the values do not change between repeats), with the percentage difference from ING.
// Shows how overview resampling (average vs nearest) changes statistics computed at coarse scales.
function summarizeValues(rows) {
  var groups = {};
  var order = [];
  rows.forEach(function(r) {
    if (r.status !== 'ok' || r.value === '') return;
    var key = [r.product, r.op, r.size_km + 'km', r.scale_m + 'm'].join(' ');
    if (!groups[key]) { groups[key] = {}; order.push(key); }
    if (!groups[key][r.form]) groups[key][r.form] = r;
  });
  function num(v) { return typeof v === 'number' ? v.toPrecision(5) : '-'; }
  function pct(v, ref) {
    return typeof v === 'number' && typeof ref === 'number' && ref !== 0
      ? ' (' + ((v - ref) / Math.abs(ref) * 100).toFixed(1) + '%)' : '';
  }
  return order.map(function(key) {
    var g = groups[key];
    var ing = g.ING;
    var parts = FORM_LIST.map(function(f) {
      var r = g[f];
      if (!r) return f + ' -';
      var cmp = f !== 'ING' && ing;
      var txt = f + ' mean ' + num(r.value) + (cmp ? pct(r.value, ing.value) : '');
      if (r.std !== '') txt += ' sd ' + num(r.std) + (cmp ? pct(r.std, ing.std) : '');
      if (r.max !== '') txt += ' max ' + num(r.max) + (cmp ? pct(r.max, ing.max) : '');
      return txt;
    });
    return key + ' | ' + parts.join(' | ');
  }).join('\n');
}

// ----------------------------------------------------------------------------
// Matrix runner
// ----------------------------------------------------------------------------
var tilesCache = {};

// Registered tiles touched by the region (untimed, cached per product x size). ING is always 1.
function withTiles(c, next) {
  if (c.form === 'ING') { c.tiles = 1; next(); return; }
  var version = parseForm(c.form).version;
  var key = PRODUCTS[c.product].folder + '|' + version + '|' + c.size_km;
  if (tilesCache.hasOwnProperty(key)) { c.tiles = tilesCache[key]; next(); return; }
  regTiles(PRODUCTS[c.product].folder, version, null).filterBounds(c.region).size().evaluate(function(n) {
    tilesCache[key] = n;
    c.tiles = n;
    next();
  });
}

function runCase(c, done) {
  withTiles(c, function() {
    var salt = newSalt();
    var f = parseForm(c.form);
    var obj = f.kind === 'REG_TILES'
      ? tilesStats(c.product, f.version, c.region, c.scale_m, salt)
      : OPS[c.op].fn(getImage(c.form, c.product, c.region, salt), c.product, c.region, c.scale_m);
    var t0 = Date.now();
    obj.evaluate(function(res, err) {
      var ms = Date.now() - t0;
      if (!err && f.kind === 'REG_TILES' && TILES_CLIENT_COMBINE) res = combineTiles(res, c.product);
      if (!err && f.kind === 'REG_TILES' && !(res && res.n > 0)) err = 'REG_TILES counted no pixels';
      done({
        run: runLabel, form: c.form, product: c.product, op: c.op, size_km: c.size_km, scale_m: c.scale_m,
        rep: c.rep, tiles: c.tiles, ms: ms, status: err ? 'error' : 'ok',
        value: err ? '' : pickValue(res, c.product),
        std: err ? '' : pickStat(res, c.product, 'stdDev'),
        min: err ? '' : pickStat(res, c.product, 'min'),
        max: err ? '' : pickStat(res, c.product, 'max'),
        note: err || '',
        site_year_reg: REG_ID,
        site_year_ing: ING_ID,
        source: f.kind === 'ING'
          ? ingPath(PRODUCTS[c.product].folder) + '/' + ING_ID
          : regPath(PRODUCTS[c.product].folder, f.version) + ' (' + SITE_PROP + '=' + REG_ID + ')'
      });
    });
  });
}

function buildPlan(extents) {
  var cases = [];
  var skipped = [];
  PRODUCT_LIST.forEach(function(product) {
    var folder = PRODUCTS[product].folder;
    OP_LIST.forEach(function(opName) {
      var op = OPS[opName];
      if (op.applies.indexOf(product) < 0) return;
      var scales = op.native ? [PRODUCTS[product].native] : SCALES[product];
      SIZES_KM.forEach(function(sizeKm) {
        scales.forEach(function(scale) {
          if (!op.native && Math.pow(sizeKm * 1000 / scale, 2) > MAX_PIXELS) {
            skipped.push(product + ' ' + opName + ' ' + sizeKm + 'km @' + scale + 'm: over MAX_PIXELS');
            return;
          }
          for (var rep = 1; rep <= REPS; rep++) {
            // Rotate the form order each repeat so no form always pays the first (cold) read.
            rotate(FORM_LIST, rep - 1).forEach(function(form) {
              var f = parseForm(form);
              if (f.kind === 'REG_TILES' && opName !== 'stats') {
                if (rep === 1) skipped.push(form + ' ' + opName + ': REG_TILES supports only stats');
                return;
              }
              var own = extents[f.kind === 'ING' ? 'ING|' + folder : 'REG@' + f.version + '|' + folder];
              var anchorExt = extents['REG@' + ANCHOR_VERSION + '|' + folder];
              var ext = SHARED_ANCHOR ? anchorExt : own;
              var shortSideM = own.shortSideM;
              if (SHARED_ANCHOR) {
                shortSideM = Math.min.apply(null, Object.keys(extents)
                  .filter(function(k) { return k.split('|')[1] === folder; })
                  .map(function(k) { return extents[k].shortSideM; }));
              }
              if (sizeKm * 1000 > shortSideM * 0.95) {
                if (rep === 1) skipped.push(form + ' ' + product + ' ' + sizeKm + 'km: larger than the footprint');
                return;
              }
              cases.push({
                form: form, product: product, op: opName, size_km: sizeKm, scale_m: scale, rep: rep,
                region: makeRegion(ext.lon, ext.lat, sizeKm)
              });
            });
          }
        });
      });
    });
  });
  return {cases: cases, skipped: skipped};
}

function runMatrix(extents) {
  var plan = buildPlan(extents);
  print('Cases: ' + plan.cases.length + ' (' + REPS + ' reps, forms ' + FORM_LIST.join('/') + ')');
  if (plan.skipped.length) print('Skipped:', plan.skipped);
  if (!plan.cases.length) return;
  if (plan.cases.length > MAX_CASES) {
    print('Plan has more than MAX_CASES (' + MAX_CASES + ') cases; reduce the matrix or raise MAX_CASES.');
    return;
  }
  var status = ui.Label('Starting...');
  print(status);
  var rows = [];
  function next(i) {
    if (i >= plan.cases.length) {
      status.setValue('Done: ' + rows.length + ' cases');
      print('Summary, run "' + runLabel + '" (median over reps, with fastest-slowest; ratio = median / ING):', summarize(rows));
      print('Statistics by form (difference from ING in brackets):', summarizeValues(rows));
      print('CSV (copy into COG_testing/):', toCsv(rows));
      return;
    }
    var c = plan.cases[i];
    status.setValue((i + 1) + '/' + plan.cases.length + '  ' +
      [c.form, c.product, c.op, c.size_km + 'km', c.scale_m + 'm', 'rep' + c.rep].join(' '));
    runCase(c, function(row) { rows.push(row); next(i + 1); });
  }
  next(0);
}

// ----------------------------------------------------------------------------
// Single case (for the Profiler)
// ----------------------------------------------------------------------------
function runSingle() {
  var s = SINGLE;
  if (!s.anchor) {
    print('Single mode needs SINGLE.anchor = [lon, lat], the same for every form being compared. ' +
      'Run once with MODE = \'centres\' and paste a registered centre.');
    return;
  }
  var salt = newSalt();
  var region = makeRegion(s.anchor[0], s.anchor[1], s.sizeKm);
  print('Single case', s);
  var f = parseForm(s.form);
  if (s.op === 'render') {
    if (f.kind === 'REG_TILES') { print('REG_TILES has no image to render; use REG or REG_FULL.'); return; }
    var p = PRODUCTS[s.product];
    var vis = {bands: p.bands};
    Object.keys(p.vis).forEach(function(k) { vis[k] = p.vis[k]; });
    Map.setCenter(s.anchor[0], s.anchor[1], s.zoom || 13);
    Map.addLayer(getImage(s.form, s.product, region, salt).select(p.bands), vis, s.form + ' ' + s.product);
    print('Layer added. The Profiler lists the map tiles drawn for it; panning or zooming adds tiles, ' +
      'so keep the same view for every form.');
    return;
  }
  var op = OPS[s.op];
  var scale = op.native ? PRODUCTS[s.product].native : s.scale;
  if (f.kind === 'REG_TILES') {
    if (s.op !== 'stats') { print('REG_TILES supports only op "stats".'); return; }
    var tr = tilesStats(s.product, f.version, region, scale, salt);
    if (TILES_CLIENT_COMBINE) {
      // evaluate() is used (not print) because the per-tile collection has to be combined in the browser.
      // It is started from the script run itself, so the Profiler should record it like the other cases;
      // if the Profiler table comes back empty, change this to print('Per-tile statistics', tr).
      tr.evaluate(function(info, e) {
        print('Result', e ? 'ERROR ' + e : combineTiles(info, s.product));
      });
    } else {
      print('Result', tr);
    }
    return;
  }
  var img = getImage(s.form, s.product, region, salt);
  print('Result', op.fn(img, s.product, region, scale));
}

// ----------------------------------------------------------------------------
// Startup: check the site-years exist, find dataset extents, then run
// ----------------------------------------------------------------------------
// Prints the centres and starts the matrix (unless MODE is 'centres').
function finishStartup(extents) {
  var lines = Object.keys(extents).map(function(k) {
    var e = extents[k];
    return k + ': [' + e.lon.toFixed(6) + ', ' + e.lat.toFixed(6) + '], shorter side ' + Math.round(e.shortSideM) + ' m';
  });
  print('Dataset centres [lon, lat] (paste one into SINGLE.anchor) and shorter footprint sides:', lines.join('\n'));
  if (MODE === 'centres') return;
  runMatrix(extents);
}

var startupT0 = Date.now();
function stamp(label) { print(label + ' (' + ((Date.now() - startupT0) / 1000).toFixed(1) + ' s since start)'); }

if (MODE === 'single') {
  runSingle();
} else {
  var folders = [];
  PRODUCT_LIST.forEach(function(p) {
    if (folders.indexOf(PRODUCTS[p].folder) < 0) folders.push(PRODUCTS[p].folder);
  });

  var counts = {};
  folders.forEach(function(folder) {
    counts['ING|' + folder] = ee.ImageCollection(ingPath(folder)).filter(ee.Filter.eq('system:index', ING_ID)).size();
    REG_VERSIONS.forEach(function(v) {
      counts['REG@' + v + '|' + folder] = regTiles(folder, v, null).size();
    });
  });

  ee.Dictionary(counts).evaluate(function(n, err) {
    if (err) { print('Existence check failed:', err); return; }
    var missing = false;
    folders.forEach(function(folder) {
      if (n['ING|' + folder] === 0) {
        missing = true;
        print('Ingested ' + folder + ' has no image ' + ING_ID + '. Site-years in ' + ingPath(folder) + ':');
        print(ee.ImageCollection(ingPath(folder)).aggregate_array('system:index').sort());
      }
      REG_VERSIONS.forEach(function(v) {
        if (n['REG@' + v + '|' + folder] === 0) {
          missing = true;
          print('Registered ' + regPath(folder, v) + ' has no tiles with ' + SITE_PROP + ' = ' + REG_ID);
        }
      });
    });
    if (REG_VERSIONS.indexOf(ANCHOR_VERSION) < 0) {
      print('ANCHOR_VERSION ' + ANCHOR_VERSION + ' must be one of REG_VERSIONS');
      return;
    }
    if (missing) return;
    print('Tiles per product folder and version (ING = 1 image):', n);
    stamp('Existence check done');

    if (EXTENT_OVERRIDE) {
      var ov = {};
      folders.forEach(function(folder) {
        ov['ING|' + folder] = EXTENT_OVERRIDE;
        REG_VERSIONS.forEach(function(v) { ov['REG@' + v + '|' + folder] = EXTENT_OVERRIDE; });
      });
      print('Using EXTENT_OVERRIDE; footprint lookup skipped.');
      finishStartup(ov);
      return;
    }
    print('Looking up footprints (unions every tile footprint; slow for large collections, see EXTENT_OVERRIDE)...');

    var bounds = {};
    folders.forEach(function(folder) {
      bounds['ING|' + folder] = ee.Image(ee.ImageCollection(ingPath(folder))
        .filter(ee.Filter.eq('system:index', ING_ID)).first()).geometry().bounds().coordinates();
      REG_VERSIONS.forEach(function(v) {
        bounds['REG@' + v + '|' + folder] = regTiles(folder, v, null).geometry().bounds().coordinates();
      });
    });
    ee.Dictionary(bounds).evaluate(function(b, err2) {
      if (err2) { print('Footprint lookup failed:', err2); return; }
      stamp('Footprint lookup done');
      var extents = {};
      Object.keys(b).forEach(function(k) { extents[k] = describeExtent(b[k]); });
      finishStartup(extents);
    });
  });
}
