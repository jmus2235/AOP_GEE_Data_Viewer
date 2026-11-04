/**
 * Cheap anchor for a registered site-year: computes the centre of the registered tiles from the tile
 * names (TILE_EASTING_NORTHING, the lower-left corner of each 1 km tile) instead of unioning the tile
 * footprints, which is slow for collections of large COG tiles.
 *
 * Prints, for the site-year below:
 *   - the number of tiles and the extent in metres,
 *   - two candidate anchors: the centre of the tile bounds (what the harness footprint lookup finds),
 *     and the mean of the tile centres (closer to the middle of the data when the site is not a
 *     rectangle, like REDB with its cut corner),
 *   - a ready-to-paste EXTENT_OVERRIDE line for cog_vs_ingested_perf_test.js and an anchor for
 *     SINGLE.anchor / ANCHOR in cog_refl_perf_test.js.
 * Only tile metadata is read, so this should finish in seconds.
 */

var PATH = 'projects/neon-nonprod-earthengine/assets/RGB/REG';   // any registered collection of the site-year
var ID_PROP = 'YEAR_SITE_VISIT';
var ID = '2026_REDB_6';
var TILE_PROP = 'TILE_EASTING_NORTHING';                          // 'easting_northing', lower-left corner, metres
var EPSG = 'EPSG:32612';                                          // UTM zone of the site (REDB: 12N)
var TILE_M = 1000;

ee.ImageCollection(PATH).filter(ee.Filter.eq(ID_PROP, ID)).aggregate_array(TILE_PROP)
  .evaluate(function(ids, err) {
    if (err || !ids || !ids.length) { print('Could not read tile ids: ' + (err || 'no tiles for ' + ID)); return; }
    var E = [], N = [];
    ids.forEach(function(s) {
      var p = String(s).split('_');
      E.push(Number(p[0])); N.push(Number(p[1]));
    });
    function min(a) { return Math.min.apply(null, a); }
    function max(a) { return Math.max.apply(null, a); }
    function mean(a) { return a.reduce(function(x, y) { return x + y; }, 0) / a.length; }
    var widthM = max(E) - min(E) + TILE_M, heightM = max(N) - min(N) + TILE_M;
    var boundsCentre = [(min(E) + max(E)) / 2 + TILE_M / 2, (min(N) + max(N)) / 2 + TILE_M / 2];
    var meanCentre = [mean(E) + TILE_M / 2, mean(N) + TILE_M / 2];
    print(ids.length + ' tiles; extent ' + widthM + ' m (E-W) x ' + heightM + ' m (N-S); tiles cover ' +
          (ids.length * TILE_M * TILE_M / 1e6) + ' km2 of the ' + (widthM * heightM / 1e6) + ' km2 bounding box');
    var short = Math.min(widthM, heightM);

    function toLonLat(label, xy) {
      ee.Geometry.Point(xy, EPSG).transform('EPSG:4326', 1).coordinates().evaluate(function(c) {
        var lon = c[0].toFixed(6), lat = c[1].toFixed(6);
        print(label + ' [' + EPSG + ' ' + xy[0] + ', ' + xy[1] + '] -> lon, lat = [' + lon + ', ' + lat + ']');
        print('  paste: var EXTENT_OVERRIDE = {lon: ' + lon + ', lat: ' + lat + ', shortSideM: ' + short + '};' +
              '   anchor: [' + lon + ', ' + lat + ']');
      });
    }
    toLonLat('Centre of tile bounds', boundsCentre);
    toLonLat('Mean of tile centres (recommended for a non-rectangular site)', meanCentre);
    print('Both anchors should fall on data; check them on the map if the site has a cut corner. ' +
          'Regions up to about ' + (0.95 * short / 1000).toFixed(1) + ' km fit the bounding box.');
  });
