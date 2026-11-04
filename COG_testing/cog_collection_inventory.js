/**
 * Inventory of the registered COG collections in the non-prod project (Earth Engine Code Editor).
 *
 * For every product x version it prints the tile count and the number of tiles per site-year
 * (YEAR_SITE_VISIT), so it is clear which version holds which site-years (for example which one
 * is the 100-tile JERC 2026 subset and which is the full site). For the products in PROPS_FOR it
 * also prints the band names, native scale and properties of the first tile, to compare versions.
 *
 * Each print evaluates independently, so a missing collection only breaks its own line.
 */

var ROOT = 'projects/neon-nonprod-earthengine/assets';
var PRODUCTS = ['RGB', 'CHM', 'DEM'];
var VERSIONS = ['900', '901', '902', 'REG'];   // test{PRODUCT}/{VERSION}
var INCLUDE_UNPREFIXED = true;                 // also {PRODUCT}/REG
var SITE_PROP = 'YEAR_SITE_VISIT';
var PROPS_FOR = ['CHM'];                       // products whose first tile is described

function inventory(path) {
  var col = ee.ImageCollection(path);
  print(path, ee.Dictionary({
    tiles: col.size(),
    tilesPerSiteYear: col.aggregate_histogram(SITE_PROP)
  }));
}

function describeFirstTile(path) {
  var first = ee.Image(ee.ImageCollection(path).first());
  print(path + ' first tile', ee.Dictionary({
    bands: first.bandNames(),
    nativeScale: first.select(0).projection().nominalScale(),
    crs: first.select(0).projection().crs(),
    properties: first.toDictionary()
  }));
}

PRODUCTS.forEach(function(product) {
  var paths = VERSIONS.map(function(v) { return ROOT + '/test' + product + '/' + v; });
  if (INCLUDE_UNPREFIXED) paths.push(ROOT + '/' + product + '/REG');
  paths.forEach(function(path) {
    inventory(path);
    if (PROPS_FOR.indexOf(product) >= 0) describeFirstTile(path);
  });
});
