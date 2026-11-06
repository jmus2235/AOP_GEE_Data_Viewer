/**
 * Random forest classification test on REDB reflectance: ingested vs registered band-interleaved vs
 * pixel-interleaved (Earth Engine Code Editor). Site-year: 2026_REDB_6. Modelled on the user's CLBJ random forest
 * script (381 reflectance bands + CHM, sampleRegions at scale 1, tileScale 16, 100-tree smileRandomForest,
 * 80/20 train/test split, classified image shown on the map).
 *
 * Forms (same ground, same points, same bands, same CHM):
 *   ING   ingested BRDF reflectance image  HSI_REFL/002/2026_REDB_6      (bands B001-B426 used; the 16 QA bands are not)
 *   BAND  registered band-interleaved tiles REFL/REG                       (AOP_ID = 2026_REDB_6, mosaicked)
 *   PIX   registered pixel-interleaved tiles testREFL/PIX                  (AOP_ID = 2026_REDB_6, mosaicked)
 * Predictors: 381 reflectance bands (426 minus 195-205, 287-310 and 416-425, as in the CLBJ script) plus the
 * registered 2026 CHM (CHM/REG, YEAR_SITE_VISIT = 2026_REDB_6) in ALL forms (the ingested CHM stops at 2023), 382 in total.
 * Labels: 90 hand-placed points in 5 made-up classes (EN, DB, MX, SH, DV), see redb_class_labels.geojson. Accuracy
 * is NOT the goal: the question is whether the pipeline runs and whether the forms give the same results.
 *
 * MODES (set MODE below; one mode per run; do not press Run again while a run is going: every progress line carries
 * a run id [xxxx], two ids in the console mean two overlapping runs)
 *   'compare'  for each scale in SCALES (1 m and 4 m) and each form: sample the points, train the random forest on the
 *              training points, predict all points, report accuracy and the confusion matrix on the test points, and at the
 *              end the agreement of the predictions between forms. Wall-clock timings of the sampling step and the whole
 *              pipeline. At 1 m the forms hold identical values, so predictions should be identical (a control);
 *              differences at 4 m come from resampling. Profiler off.
 *   'profile'  runs the pipeline for ONE form and scale (SINGLE) synchronously, to measure EECU-seconds with the Profiler
 *              (switch it on BEFORE pressing Run).
 *   'site'     classifies the WHOLE site (7 x 8 km tile bounding box; about 30.6 km2 is classified, because the composite is
 *              masked wherever any band or the CHM has no data) for each form at each scale in
 *              SITE_SCALES and returns the class histogram. Wall-clock; large cases may fail (memory, timeout): the error
 *              text is the result.
 *   'render'   adds the classified image of one form (SINGLE.form) to the map, centred on the anchor at RENDER.zoom, to
 *              profile map-tile rendering (Profiler on before Run; copy the table only when it stops changing).
 *   'export'   creates a Drive export task of the classified whole site for one form (SINGLE.form) at EXPORT.scale. Run it
 *              from the Tasks tab; the task duration (and EECU-seconds, if shown) is the result.
 */

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
var MODE = 'compare';                      // 'compare' | 'profile' | 'site' | 'render' | 'export'
var FORMS = ['ING', 'BAND', 'PIX'];
var SCALES = [1, 4];                       // compare: scales (m) at which the points are sampled
var USE_CHM = true;                        // add the registered CHM as a predictor (as in the CLBJ script)
var TILE_SCALE = 16;                       // tileScale passed to sampleRegions / reduceRegion (the CLBJ script uses 16; 1 = default)
var N_TREES = 100;
var RF_SEED = 1;
var SPLIT_SEED = 1;                        // seed of the per-class 80/20 split (done in the browser, identical for every form)
var TEST_FRACTION = 0.2;
var TRAIN_SCALE = 1;                       // site / render / export: scale (m) at which the classifier is trained
var SINGLE = {form: 'BAND', scale: 1};     // profile, render, export: form and sampling scale
var SITE_SCALES = [10, 4];                 // site: scales (m) of the whole-site histogram (1 m is very large: try it last)
var RENDER = {zoom: 14};
var EXPORT = {scale: 4};
var RUN_LABEL = '';

var REGISTERED_ROOT = 'projects/neon-nonprod-earthengine/assets';
var INGESTED_ROOT = 'projects/neon-prod-earthengine/assets';
var PATH_BAND = REGISTERED_ROOT + '/REFL/REG';
var PATH_PIX = REGISTERED_ROOT + '/testREFL/PIX';
var PATH_ING = INGESTED_ROOT + '/HSI_REFL/002';
var PATH_CHM = REGISTERED_ROOT + '/CHM/REG';
var SITE_YEAR = '2026_REDB_6';
var REG_FILTER_PROP = 'AOP_ID';            // reflectance tiles have no YEAR_SITE_VISIT yet
var ANCHOR = [-111.780094, 40.800975];

var CLASS_NAMES = ['EN', 'DB', 'MX', 'SH', 'DV'];   // class codes 0 to 4
var CLASS_CODES = [0, 1, 2, 3, 4];
var PALETTE = ['1c5f2c', '68ab5f', 'b5c58f', 'ccb879', 'd99282'];

var runId = Math.random().toString(36).slice(2, 6);
var runLabel = (RUN_LABEL || new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC') + ' #' + runId;

// ----------------------------------------------------------------------------
// Labels (90 points from the label helper; split 80/20 per class in the browser with a seeded generator)
// ----------------------------------------------------------------------------
var LABELS_GEOJSON = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7672194,40.7924176]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7732275,40.7884536]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7705668,40.8091805]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7474783,40.8161963]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7836989,40.8189894]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8034399,40.811779]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8006934,40.8171057]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7533148,40.8245103]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7459334,40.8237959]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7366637,40.8115192]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7887629,40.7819548]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7792861,40.8254267]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7669265,40.8232834]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7374007,40.8189965]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7837493,40.8225689]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7947356,40.7978178]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7602317,40.8273102]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7374007,40.8043151]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7592875,40.8013914]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7606608,40.7966483]},"properties":{"class":0,"name":"EN"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7840926,40.8110066]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7913024,40.80438]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7582576,40.8073036]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7665831,40.8173726]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7541377,40.8219194]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7911307,40.810227]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8052069,40.7984026]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7899291,40.7956086]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7748229,40.8020411]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7639224,40.8067839]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7657248,40.8125007]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7413489,40.8154888]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.739289,40.8089277]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7535369,40.806589]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8050353,40.8039253]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7725055,40.8177623]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.754481,40.8032756]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.737744,40.8075635]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7918174,40.7937892]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7979113,40.8070437]},"properties":{"class":1,"name":"DB"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7711047,40.7959703]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7631439,40.7983744]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7582516,40.8025652]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7508487,40.8004048]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7542175,40.8013145]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7505912,40.8055213]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7494968,40.8055101]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7468146,40.8039833]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7432741,40.7992891]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7429737,40.8074753]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7775476,40.7910466]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7804443,40.7897632]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7701017,40.7952541]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7593944,40.803522]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7438805,40.8065755]},"properties":{"class":2,"name":"MX"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7890818,40.7893266]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7819578,40.7928356]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7434199,40.8135611]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7591269,40.8175885]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7794688,40.8176535]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.799639,40.8105079]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8085654,40.8055056]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.74033,40.8051807]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7992098,40.7888717]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8053038,40.7860773]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8016131,40.7842576]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7908842,40.7880919]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7822153,40.816874]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7503721,40.8228498]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7383559,40.8244735]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7475397,40.7952398]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7548353,40.7891966]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.76462,40.7845176]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7685683,40.7836727]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7742331,40.781593]},"properties":{"class":3,"name":"SH"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7901715,40.787139]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7903753,40.7871218]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7907951,40.7871649]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7908782,40.7871482]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7920457,40.7871501]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7930488,40.7873511]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7882947,40.7879322]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7877565,40.7879882]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.7821323,40.7912294]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8077196,40.7797558]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8085082,40.7796908]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.809742,40.7796664]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8057616,40.7803529]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8050642,40.7808607]},"properties":{"class":4,"name":"DV"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[-111.8047584,40.7808932]},"properties":{"class":4,"name":"DV"}}]};

// Seeded pseudo-random numbers (Park-Miller generator; the Code Editor's JavaScript engine has no Math.imul).
// The products stay below 2^53, so the arithmetic is exact.
function seededRandom(seed) {
  var s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

var splitCounts = {};
(function assignFolds() {
  var feats = LABELS_GEOJSON.features;
  var byClass = {};
  feats.forEach(function(f, i) {
    f.properties.pid = i;
    var c = f.properties['class'];
    (byClass[c] = byClass[c] || []).push(i);
  });
  var rng = seededRandom(SPLIT_SEED);
  rng(); rng(); rng();                                  // discard the first values (a small seed gives a small first value)
  Object.keys(byClass).forEach(function(c) {
    var idx = byClass[c].slice();
    for (var i = idx.length - 1; i > 0; i--) {          // Fisher-Yates shuffle
      var j = Math.floor(rng() * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    var nTest = Math.max(1, Math.round(TEST_FRACTION * idx.length));
    idx.forEach(function(featIndex, k) { feats[featIndex].properties.fold = k < nTest ? 'test' : 'train'; });
    splitCounts[CLASS_NAMES[c]] = {train: idx.length - nTest, test: nTest};
  });
})();
var LABELS = ee.FeatureCollection(LABELS_GEOJSON);

// ----------------------------------------------------------------------------
// Images
// ----------------------------------------------------------------------------
function bandName(i) { return 'B' + ('00' + i).slice(-3); }

var REMOVED = [[195, 205], [287, 310], [416, 425]];     // water absorption and the noisy last bands (CLBJ script)
var BANDS = [];
(function() {
  for (var i = 1; i <= 426; i++) {
    var drop = REMOVED.some(function(r) { return i >= r[0] && i <= r[1]; });
    if (!drop) BANDS.push(bandName(i));
  }
})();

function registeredMosaic(path, filterProp, id) {
  var tiles = ee.ImageCollection(path).filter(ee.Filter.eq(filterProp, id));
  var first = ee.Image(tiles.first());
  return ee.Image(tiles.mosaic().setDefaultProjection(first.projection()));
}

var REFL = {
  ING: ee.Image(ee.ImageCollection(PATH_ING).filter(ee.Filter.eq('system:index', SITE_YEAR)).first()),
  BAND: registeredMosaic(PATH_BAND, REG_FILTER_PROP, SITE_YEAR),
  PIX: registeredMosaic(PATH_PIX, REG_FILTER_PROP, SITE_YEAR)
};
var CHM = registeredMosaic(PATH_CHM, 'YEAR_SITE_VISIT', SITE_YEAR).select('CHM');

// Tile bounding box of the REDB site (UTM zone 12N, from the tile names: E 431000-438000, N 4513000-4521000).
var SITE_BOX = ee.Geometry.Rectangle([431000, 4513000, 438000, 4521000], 'EPSG:32612', false);

function composite(form) {
  var img = REFL[form].select(BANDS);
  return USE_CHM ? img.addBands(CHM) : img;
}

// ----------------------------------------------------------------------------
// Pipeline
// ----------------------------------------------------------------------------
// The points sampled from a form's composite, sorted by point id so every form trains on rows in the same order.
// Points with no data in any band (for example no CHM) are dropped by sampleRegions.
function sampled(form, scale) {
  return composite(form).sampleRegions({
    collection: LABELS, properties: ['class', 'fold', 'pid'], scale: scale, tileScale: TILE_SCALE
  }).sort('pid');
}

function trainClassifier(form, scale) {
  var train = sampled(form, scale).filter(ee.Filter.eq('fold', 'train'));
  return ee.Classifier.smileRandomForest({numberOfTrees: N_TREES, seed: RF_SEED}).train({
    features: train, classProperty: 'class', inputProperties: composite(form).bandNames()
  });
}

// One request: sample, train, predict all points, accuracy on the test points.
function pipeline(form, scale) {
  var f = sampled(form, scale);
  var clf = ee.Classifier.smileRandomForest({numberOfTrees: N_TREES, seed: RF_SEED}).train({
    features: f.filter(ee.Filter.eq('fold', 'train')), classProperty: 'class', inputProperties: composite(form).bandNames()
  });
  var predicted = f.classify(clf);
  var em = predicted.filter(ee.Filter.eq('fold', 'test')).errorMatrix('class', 'classification', CLASS_CODES);
  return ee.Dictionary({
    nInputs: composite(form).bandNames().size(),
    nFeatures: f.size(),
    nTrain: f.filter(ee.Filter.eq('fold', 'train')).size(),
    nTest: f.filter(ee.Filter.eq('fold', 'test')).size(),
    accuracy: em.accuracy(),
    kappa: em.kappa(),
    matrix: em.array(),
    pred: predicted.reduceColumns(ee.Reducer.toList(4), ['pid', 'fold', 'class', 'classification']).get('list')
  });
}

function classifiedImage(form) {
  return composite(form).classify(trainClassifier(form, TRAIN_SCALE));
}

function rotate(list, k) { var n = k % list.length; return list.slice(n).concat(list.slice(0, n)); }
function fmt(x, d) { return typeof x === 'number' ? x.toFixed(d) : String(x); }

function sourceOf(form) {
  var s = {
    ING: PATH_ING + '/' + SITE_YEAR,
    BAND: PATH_BAND + ' (' + REG_FILTER_PROP + '=' + SITE_YEAR + ')',
    PIX: PATH_PIX + ' (' + REG_FILTER_PROP + '=' + SITE_YEAR + ')'
  }[form];
  return s + (USE_CHM ? ' + ' + PATH_CHM + ' (YEAR_SITE_VISIT=' + SITE_YEAR + ')' : '');
}

function printHeader() {
  print('Run ' + runLabel + ', mode ' + MODE + ', site-year ' + SITE_YEAR + ', tileScale ' + TILE_SCALE + ', ' +
        BANDS.length + ' reflectance bands' + (USE_CHM ? ' + CHM' : '') + ', ' + LABELS_GEOJSON.features.length + ' labelled points');
  print('Per-class split (train/test): ' + JSON.stringify(splitCounts));
}

// ----------------------------------------------------------------------------
// MODE compare
// ----------------------------------------------------------------------------
function runCompare() {
  var tasks = [];
  SCALES.forEach(function(scale, si) {
    rotate(FORMS, si).forEach(function(form) { tasks.push({form: form, scale: scale}); });
  });
  print('Running ' + tasks.length + ' tasks (sampling step, then the whole pipeline), one at a time. ' +
        'Do not press Run again until "==== Summary" appears.');
  var results = [];
  function next(i) {
    if (i >= tasks.length) { summarizeCompare(results); return; }
    var t = tasks[i];
    var r = {form: t.form, scale: t.scale, ok: false, error: '', sampleS: null, totalS: null};
    var t0 = Date.now();
    sampled(t.form, t.scale).size().evaluate(function(n, err) {
      r.sampleS = (Date.now() - t0) / 1000;
      if (err) {
        r.error = 'sampling: ' + err;
        print('[' + runId + '] ' + (i + 1) + '/' + tasks.length + ' ' + t.form + ' @' + t.scale + ' m: sampling ERROR ' + err);
        results.push(r); next(i + 1); return;
      }
      r.nSampled = n;
      var t1 = Date.now();
      pipeline(t.form, t.scale).evaluate(function(v, err2) {
        r.totalS = (Date.now() - t1) / 1000;
        if (err2) {
          r.error = 'pipeline: ' + err2;
        } else {
          r.ok = true; r.v = v;
        }
        print('[' + runId + '] ' + (i + 1) + '/' + tasks.length + ' ' + t.form + ' @' + t.scale + ' m: sample ' + fmt(r.sampleS, 1) +
              ' s (' + n + ' points), pipeline ' + fmt(r.totalS, 1) + ' s' +
              (err2 ? ' ERROR ' + err2 : ', test accuracy ' + fmt(v.accuracy, 3) + ', kappa ' + fmt(v.kappa, 3)));
        results.push(r);
        next(i + 1);
      });
    });
  }
  next(0);
}

function predMap(v) {
  var m = {};
  (v.pred || []).forEach(function(p) { m[p[0]] = {fold: p[1], cls: p[2], pred: p[3]}; });
  return m;
}

function summarizeCompare(results) {
  print('==== Summary (run ' + runLabel + ') ====');
  results.forEach(function(r) {
    if (!r.ok) {
      print(r.form + ' @' + r.scale + ' m: FAILED (' + r.error + ')  [sampling step ' + fmt(r.sampleS, 1) + ' s]');
      return;
    }
    var v = r.v;
    var present = predMap(v), dropped = [];
    for (var p = 0; p < LABELS_GEOJSON.features.length; p++) { if (!present[p]) dropped.push(p); }
    print(r.form + ' @' + r.scale + ' m: ' + v.nInputs + ' inputs, ' + v.nFeatures + ' points sampled (' + v.nTrain + ' train, ' + v.nTest +
          ' test; dropped for no data: [' + dropped.join(' ') + ']), sampling ' + fmt(r.sampleS, 1) + ' s, whole pipeline ' + fmt(r.totalS, 1) + ' s, test accuracy ' + fmt(v.accuracy, 3) +
          ', kappa ' + fmt(v.kappa, 3) + ', confusion matrix (rows reference EN DB MX SH DV, columns predicted) ' + JSON.stringify(v.matrix));
  });
  // Agreement of the predictions between forms, per scale (all points and test points only), over points present in both.
  SCALES.forEach(function(scale) {
    var done = results.filter(function(r) { return r.ok && r.scale === scale; });
    for (var a = 0; a < done.length; a++) {
      for (var b = a + 1; b < done.length; b++) {
        var ma = predMap(done[a].v), mb = predMap(done[b].v);
        var n = 0, same = 0, nt = 0, samet = 0, diff = [];
        Object.keys(ma).forEach(function(pid) {
          if (!mb[pid]) return;
          n++; if (ma[pid].pred === mb[pid].pred) same++; else diff.push(pid + ':' + CLASS_NAMES[ma[pid].cls] + '(' + CLASS_NAMES[ma[pid].pred] + '/' + CLASS_NAMES[mb[pid].pred] + ')');
          if (ma[pid].fold === 'test') { nt++; if (ma[pid].pred === mb[pid].pred) samet++; }
        });
        var onlyA = Object.keys(ma).filter(function(pid) { return !mb[pid]; });
        var onlyB = Object.keys(mb).filter(function(pid) { return !ma[pid]; });
        print('Agreement @' + scale + ' m, ' + done[a].form + ' vs ' + done[b].form + ': ' + same + '/' + n + ' points (' + fmt(100 * same / n, 1) +
              '%), test points ' + samet + '/' + nt + (diff.length ? '; differing points (pid:reference(pred A/pred B)): ' + diff.join(' ') : '') +
              (onlyA.length || onlyB.length ? '; points sampled only in ' + done[a].form + ': [' + onlyA.join(' ') + '], only in ' + done[b].form + ': [' + onlyB.join(' ') + ']' : ''));
      }
    }
  });
  print('==== CSV ====');
  print('run,form,scale_m,tile_scale,status,n_inputs,n_sampled,n_train,n_test,sample_s,pipeline_s,accuracy,kappa,error,site_year,source');
  results.forEach(function(r) {
    var v = r.v || {};
    print([runLabel, r.form, r.scale, TILE_SCALE, r.ok ? 'ok' : 'error', v.nInputs || '', r.nSampled !== undefined ? r.nSampled : '', v.nTrain || '', v.nTest || '',
           fmt(r.sampleS, 1), r.ok ? fmt(r.totalS, 1) : '', r.ok ? fmt(v.accuracy, 4) : '', r.ok ? fmt(v.kappa, 4) : '',
           (r.error || '').replace(/[,\n]/g, ' '), SITE_YEAR, sourceOf(r.form)].join(','));
  });
}

// ----------------------------------------------------------------------------
// MODE site
// ----------------------------------------------------------------------------
function runSite() {
  var tasks = [];
  SITE_SCALES.forEach(function(scale, si) {
    rotate(FORMS, si).forEach(function(form) { tasks.push({form: form, scale: scale}); });
  });
  print('Whole-site classification, ' + tasks.length + ' requests, one at a time (the classifier is trained at ' + TRAIN_SCALE + ' m inside every request). ' +
        'Do not press Run again until "==== Summary" appears.');
  var results = [];
  function next(i) {
    if (i >= tasks.length) { summarizeSite(results); return; }
    var t = tasks[i];
    var hist = classifiedImage(t.form).reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(), geometry: SITE_BOX, scale: t.scale, maxPixels: 1e11, tileScale: TILE_SCALE
    }).get('classification');
    var t0 = Date.now();
    ee.Dictionary(hist).evaluate(function(v, err) {
      var s = (Date.now() - t0) / 1000;
      results.push({form: t.form, scale: t.scale, s: s, ok: !err, error: err || '', hist: v});
      print('[' + runId + '] ' + (i + 1) + '/' + tasks.length + ' ' + t.form + ' @' + t.scale + ' m: ' + fmt(s, 1) + ' s' + (err ? ' ERROR ' + err : ' ok'));
      next(i + 1);
    });
  }
  next(0);
}

function summarizeSite(results) {
  print('==== Summary (run ' + runLabel + ') ====');
  results.forEach(function(r) {
    if (!r.ok) { print(r.form + ' @' + r.scale + ' m: FAILED after ' + fmt(r.s, 1) + ' s (' + r.error + ')'); return; }
    var total = 0;
    Object.keys(r.hist).forEach(function(k) { total += r.hist[k]; });
    var parts = CLASS_CODES.map(function(c) {
      var n = r.hist[String(c)] || 0;
      return CLASS_NAMES[c] + ' ' + fmt(100 * n / total, 1) + '%';
    });
    print(r.form + ' @' + r.scale + ' m: ' + fmt(r.s, 1) + ' s, ' + total + ' pixels, class shares ' + parts.join(', '));
  });
  print('==== CSV ====');
  print('run,form,scale_m,tile_scale,train_scale_m,status,seconds,pixels,share_EN,share_DB,share_MX,share_SH,share_DV,error,site_year,source');
  results.forEach(function(r) {
    var total = 0;
    if (r.ok) Object.keys(r.hist).forEach(function(k) { total += r.hist[k]; });
    var shares = CLASS_CODES.map(function(c) { return r.ok ? fmt(100 * (r.hist[String(c)] || 0) / total, 2) : ''; });
    print([runLabel, r.form, r.scale, TILE_SCALE, TRAIN_SCALE, r.ok ? 'ok' : 'error', fmt(r.s, 1), r.ok ? total : '']
      .concat(shares).concat([(r.error || '').replace(/[,\n]/g, ' '), SITE_YEAR, sourceOf(r.form)]).join(','));
  });
}

// ----------------------------------------------------------------------------
// Start
// ----------------------------------------------------------------------------
printHeader();
if (MODE === 'compare') {
  runCompare();
} else if (MODE === 'profile') {
  print('Single pipeline run for the Profiler: ' + SINGLE.form + ' @' + SINGLE.scale + ' m, tileScale ' + TILE_SCALE);
  print('Result', pipeline(SINGLE.form, SINGLE.scale));
} else if (MODE === 'site') {
  runSite();
} else if (MODE === 'render') {
  Map.setCenter(ANCHOR[0], ANCHOR[1], RENDER.zoom);
  Map.addLayer(classifiedImage(SINGLE.form), {min: 0, max: 4, palette: PALETTE}, 'Classified (' + SINGLE.form + ')');
  print('Layer added for ' + SINGLE.form + '. The Profiler lists the work to draw the map tiles in view (it includes the sampling and ' +
        'training steps); keep the same view for every form, do not pan or zoom, and copy the table only when it stops changing.');
} else if (MODE === 'export') {
  var exportName = 'REDB_class_' + SINGLE.form + '_' + EXPORT.scale + 'm_' + runId;
  Export.image.toDrive({
    image: classifiedImage(SINGLE.form).toByte(),
    description: exportName,
    region: SITE_BOX,
    scale: EXPORT.scale,
    crs: 'EPSG:32612',
    maxPixels: 1e10,
    fileFormat: 'GeoTIFF'
  });
  print('Export task "' + exportName + '" created. Open the Tasks tab and click Run. Note the start and end time shown there ' +
        '(and the EECU-seconds, if the task details show it) when it finishes or fails, and paste the task status and any error text.');
} else {
  print('Unknown MODE ' + MODE);
}
