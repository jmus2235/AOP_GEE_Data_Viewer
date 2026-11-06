/**
 * Label helper for the REDB classification test (Earth Engine Code Editor). Site-year: 2026_REDB_6.
 *
 * You pick your own training/test points on top of the ingested RGB; this script checks them and prints them
 * back as GeoJSON. Claude saves that text in COG_testing/ and embeds it in the classification script, so every
 * form (ING, BAND, PIX) is trained and tested on exactly the same ground. The classes are made up for the test
 * (REDB has no in situ vegetation data); accuracy is not the goal. The classification script splits each
 * class 80% training / 20% test itself (like the CLBJ script), so draw ONE set of points per class.
 *
 * HOW TO DRAW (Code Editor)
 *   1. Edit CLASS_NAMES below to your classes (up to 8, any names, in the order you will draw them).
 *   2. Run this script once. The map shows the ingested RGB (10 cm), the registered 2026 canopy height model
 *      (CHM; hidden, switch it on in the Layers list: the classification uses it as a predictor, so draw ONLY where it
 *      has data), a false-colour infrared view (hidden), NLCD 2019 land cover at 30 m as a guide for choosing
 *      classes (50% opacity, with a legend of the classes present in the site; switch it off in the Layers list
 *      when you place points) and a red dashed outline of the site's tile bounding box (7 km east-west x 8 km
 *      north-south; the corners are not all covered by data). NLCD is only a guide: its 30 m pixels are mixed,
 *      so place points on pure 1 m ground using the RGB.
 *   3. Drawing tools (top left of the map): click "Add a marker". Click on the ground to place a point. One
 *      LAYER per class: after the first class, click "+ new layer" in the Geometry Imports box and continue.
 *      Aim for 15 to 20 points per class (more is better but not needed for this test), spread across the whole site, on ground that is clearly one class
 *      (a pixel at 1 m should be pure: avoid edges, shadows between classes, mixed patches).
 *   4. Name the imports (click the import name in the Geometry Imports box and type) DB, EN, MX, SH, DV, the
 *      same names and order as CLASS_NAMES (naming them class1 ... class5 in that order also works; if you
 *      change CLASS_NAMES, use class1, class2 ... instead). Leave the import type as "Geometry". Polygons also work
 *      (each polygon becomes one feature and the classifier samples every pixel inside), but points are enough.
 *   5. Run the script again. It prints a check (points per class, points outside the site, points with no
 *      reflectance or CHM data) and, at the end, the labels as GeoJSON. Paste that text back.
 *
 * Saving as a feature collection: for the test you do not need to. The GeoJSON this prints is saved in
 * COG_testing/ and embedded in the classification script. For your own later use, the usual way is
 * Export.table.toAsset on the feature collection this script builds (variable `labels`), then load it with
 * ee.FeatureCollection('projects/<your project>/assets/<name>'), as in your CLBJ script.
 */

// ----------------------------------------------------------------------------
// CONFIG
// ----------------------------------------------------------------------------
var CLASS_NAMES = ['EN', 'DB', 'MX', 'SH', 'DV'];   // edit: your class names (imports named after them are found automatically); class index = position here
var MIN_POINTS = 15;                       // warn when a class has fewer points than this (15 to 20 per class is enough for the test)

var INGESTED_ROOT = 'projects/neon-prod-earthengine/assets';
var REGISTERED_ROOT = 'projects/neon-nonprod-earthengine/assets';
var SITE_YEAR = '2026_REDB_6';
var ANCHOR = [-111.780094, 40.800975];

// ----------------------------------------------------------------------------
// Display
// ----------------------------------------------------------------------------
// Tile bounding box of the REDB site (UTM zone 12N, from the tile names: E 431000-438000, N 4513000-4521000).
var siteBox = ee.Geometry.Rectangle([431000, 4513000, 438000, 4521000], 'EPSG:32612', false);
var rgb = ee.Image(ee.ImageCollection(INGESTED_ROOT + '/RGB/001').filter(ee.Filter.eq('system:index', SITE_YEAR)).first());
var refl = ee.Image(ee.ImageCollection(INGESTED_ROOT + '/HSI_REFL/002').filter(ee.Filter.eq('system:index', SITE_YEAR)).first());
var chm = ee.ImageCollection(REGISTERED_ROOT + '/CHM/REG').filter(ee.Filter.eq('YEAR_SITE_VISIT', SITE_YEAR)).mosaic().select('CHM');

Map.setCenter(ANCHOR[0], ANCHOR[1], 14);
Map.addLayer(rgb, {bands: ['R', 'G', 'B'], min: 40, max: 200, gamma: 0.65}, 'ING RGB (10 cm)');
Map.addLayer(chm, {min: 0, max: 30, palette: ['E6F7E0', '063B00']}, 'Registered CHM 2026 (draw only where it has data)', false);
// False-colour infrared from the 1 m reflectance: NIR B096 (about 860 nm), red B056 (about 660 nm), green B035.
// Values are reflectance x 10000, so the stretch is up to 4500 for NIR and 900 for red and green.
Map.addLayer(refl.select(['B096', 'B056', 'B035']), {min: [0, 0, 0], max: [4500, 900, 900]}, 'ING false-colour infrared (1 m)', false);
Map.addLayer(ee.FeatureCollection([ee.Feature(siteBox)]).style({color: 'FF0000', fillColor: '00000000', width: 3, lineType: 'dashed'}),
  {}, 'Site tile bounding box (7 x 8 km)');

// NLCD 2019 land cover (30 m) as a guide for choosing classes. Shown at 50% opacity over the RGB; switch it off or
// move the opacity slider in the Layers list. A legend of the classes present in the site is added to the map.
var NLCD_CLASSES = [
  [11, '466b9f', 'Open water'], [12, 'd1def8', 'Perennial ice/snow'], [21, 'dec5c5', 'Developed, open space'],
  [22, 'd99282', 'Developed, low intensity'], [23, 'eb0000', 'Developed, medium intensity'],
  [24, 'ab0000', 'Developed, high intensity'], [31, 'b3ac9f', 'Barren land'], [41, '68ab5f', 'Deciduous forest'],
  [42, '1c5f2c', 'Evergreen forest'], [43, 'b5c58f', 'Mixed forest'], [51, 'af963c', 'Dwarf scrub'],
  [52, 'ccb879', 'Shrub/scrub'], [71, 'dfdfc2', 'Grassland/herbaceous'], [72, 'd1d182', 'Sedge/herbaceous'],
  [73, 'a3cc51', 'Lichens'], [74, '82ba9e', 'Moss'], [81, 'dcd939', 'Pasture/hay'], [82, 'ab6c28', 'Cultivated crops'],
  [90, 'b8d9eb', 'Woody wetlands'], [95, '6c9fb8', 'Emergent herbaceous wetlands']
];
var nlcdPalette = [];
for (var pc = 0; pc <= 95; pc++) nlcdPalette.push('000000');
NLCD_CLASSES.forEach(function(c) { nlcdPalette[c[0]] = c[1]; });

var nlcd = ee.ImageCollection('USGS/NLCD_RELEASES/2019_REL/NLCD')
  .filterBounds(ee.Geometry.Point(ANCHOR))
  .sort('system:time_start', false)
  .first()
  .select('landcover');
Map.addLayer(nlcd.updateMask(nlcd.gt(0)), {min: 0, max: 95, palette: nlcdPalette}, 'NLCD 2019 land cover (30 m, guide)', true, 0.5);

// Legend of the NLCD classes that occur inside the site's tile bounding box, with their share of the area.
nlcd.reduceRegion({reducer: ee.Reducer.frequencyHistogram(), geometry: siteBox, scale: 30, maxPixels: 1e9})
  .get('landcover').evaluate(function(hist, err) {
    if (err || !hist) { print('NLCD legend failed: ' + (err || 'no NLCD data at the site')); return; }
    var total = 0;
    Object.keys(hist).forEach(function(k) { total += hist[k]; });
    var legend = ui.Panel({style: {position: 'bottom-left', padding: '6px 10px'}});
    legend.add(ui.Label('NLCD 2019 in the site (share of area)', {fontWeight: 'bold', fontSize: '12px', margin: '0 0 4px 0'}));
    var lines = [];
    NLCD_CLASSES.forEach(function(c) {
      var n = hist[String(c[0])];
      if (!n) return;
      var pct = (100 * n / total).toFixed(1) + '%';
      lines.push(c[0] + ' ' + c[2] + ': ' + pct);
      legend.add(ui.Panel([
        ui.Label('', {backgroundColor: '#' + c[1], padding: '8px', margin: '0 6px 2px 0'}),
        ui.Label(c[2] + ' (' + pct + ')', {fontSize: '12px', margin: '2px 0'})
      ], ui.Panel.Layout.Flow('horizontal')));
    });
    Map.add(legend);
    print('NLCD 2019 classes inside the site bounding box: ' + lines.join('; '));
  });

// ----------------------------------------------------------------------------
// Collect the drawn classes (imports named class1 ... class8; missing ones are skipped)
// ----------------------------------------------------------------------------
var imports = [];
// The first five imports may be named after the classes (DB, EN, MX, SH, DV; must match CLASS_NAMES above, in this
// order) or class1 ... class5; the names are literal because the Code Editor cannot look up an import by a variable.
// The class index (0, 1, 2 ...) is the position of the name in CLASS_NAMES, whatever the order of the imports.
var byName = {
  EN: typeof EN !== 'undefined' ? EN : null,
  DB: typeof DB !== 'undefined' ? DB : null,
  MX: typeof MX !== 'undefined' ? MX : null,
  SH: typeof SH !== 'undefined' ? SH : null,
  DV: typeof DV !== 'undefined' ? DV : null
};
var byIndex = [
  typeof class1 !== 'undefined' ? class1 : null, typeof class2 !== 'undefined' ? class2 : null,
  typeof class3 !== 'undefined' ? class3 : null, typeof class4 !== 'undefined' ? class4 : null,
  typeof class5 !== 'undefined' ? class5 : null, typeof class6 !== 'undefined' ? class6 : null,
  typeof class7 !== 'undefined' ? class7 : null, typeof class8 !== 'undefined' ? class8 : null
];
for (var ci = 0; ci < 8; ci++) {
  var byClassName = CLASS_NAMES[ci] ? byName[CLASS_NAMES[ci]] : null;
  imports.push(byClassName || byIndex[ci] || null);
}

var geoms = {};
imports.forEach(function(g, i) { if (g !== null) geoms['class' + (i + 1)] = ee.Geometry(g); });
var keys = Object.keys(geoms);

if (keys.length === 0) {
  print('No class geometries found yet. Draw points, rename the imports to class1, class2, ... ' +
        'then run again (see the instructions at the top of the script).');
} else {
  // Plain GeoJSON geometries per class come back to the browser; points are split into one feature each there.
  ee.Dictionary(geoms).evaluate(function(info, err) {
    if (err) { print('Could not read the drawn geometries: ' + err); return; }
    var feats = [];
    keys.forEach(function(k) {
      var idx = parseInt(k.replace('class', ''), 10) - 1;
      var name = CLASS_NAMES[idx] || k;
      var g = info[k];
      function add(geometry) {
        feats.push({type: 'Feature', geometry: geometry, properties: {'class': idx, name: name}});
      }
      if (g.type === 'Point' || g.type === 'Polygon') add(g);
      else if (g.type === 'MultiPoint') g.coordinates.forEach(function(c) { add({type: 'Point', coordinates: c}); });
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function(c) { add({type: 'Polygon', coordinates: c}); });
      else print('Skipped ' + k + ': geometry type ' + g.type + ' is not supported (use points or polygons).');
    });
    function round(a) { return typeof a === 'number' ? Math.round(a * 1e7) / 1e7 : a.map(round); }
    feats.forEach(function(f) { f.geometry.coordinates = round(f.geometry.coordinates); });

    var gj = {type: 'FeatureCollection', features: feats};
    var labels = ee.FeatureCollection(gj);   // the feature collection (use Export.table.toAsset on it to keep it as an asset)

    // Check: counts per class, points outside the site box, points without reflectance or CHM data.
    var countsByClass = {};
    feats.forEach(function(f) { countsByClass[f.properties['class']] = (countsByClass[f.properties['class']] || 0) + 1; });
    var inside = labels.filterBounds(siteBox);
    var reflOk = refl.select('B096').updateMask(refl.select('B096').gt(-1000));
    var withRefl = reflOk.sampleRegions({collection: labels, properties: ['class'], scale: 1, tileScale: 4});
    var withChm = chm.sampleRegions({collection: labels, properties: ['class'], scale: 1, tileScale: 4});
    ee.Dictionary({
      inside: inside.aggregate_histogram('class'),
      refl: withRefl.aggregate_histogram('class'),
      chm: withChm.aggregate_histogram('class')
    }).evaluate(function(c, err2) {
      if (err2) { print('Check failed: ' + err2); }
      print('Class check (points drawn / inside the site box / with ingested reflectance / with registered CHM):');
      Object.keys(countsByClass).forEach(function(i) {
        var n = countsByClass[i];
        var inn = c && c.inside && c.inside[i] || 0, r = c && c.refl && c.refl[i] || 0, h = c && c.chm && c.chm[i] || 0;
        var warn = [];
        if (n < MIN_POINTS) warn.push('fewer than ' + MIN_POINTS + ' points');
        if (inn < n) warn.push((n - inn) + ' outside the site box');
        if (r < n) warn.push((n - r) + ' without reflectance data');
        if (h < n) warn.push((n - h) + ' without CHM data (move them to where the CHM exists)');
        print('  ' + (CLASS_NAMES[i] || 'class' + (+i + 1)) + ' (class ' + i + '): ' + n + ' / ' + inn + ' / ' + r + ' / ' + h +
          (warn.length ? '  WARNING: ' + warn.join('; ') : ''));
      });
      print('==== LABELS GeoJSON (paste everything between the markers back) ====');
      print(JSON.stringify(gj));
      print('==== END ====');
    });
  });
}
