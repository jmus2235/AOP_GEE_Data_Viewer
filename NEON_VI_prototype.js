// =============================================================================
// NEON AOP Vegetation Indices - Prototype Script
// Tests on-the-fly VI computation from BRDF-corrected hyperspectral imagery
// Collection: HSI_REFL/002 (Bidirectional Reflectance)
// Test site: ABBY (Abby Road), 2025
// =============================================================================

// -----------------------------------------------------------------------------
// 1. LOAD IMAGE
// -----------------------------------------------------------------------------

var refl002 = ee.ImageCollection('projects/neon-prod-earthengine/assets/HSI_REFL/002');

var selected_image = refl002
  .filter(ee.Filter.eq('system:index', '2025_ABBY_7'))
  .first();

// Wavelengths are stored as individual per-band properties: WL_FWHM_B001..WL_FWHM_B426
// Each value is a "center_wavelength,fwhm" string (e.g. "381.8584,5.674")

// Display the base RGB image
var rgbVisParams = {min: 340, max: 2150, bands: ['B053', 'B035', 'B019'], gamma: 2};
Map.addLayer(selected_image, rgbVisParams, 'ABBY 2025 Bidirectional Reflectance');
Map.centerObject(selected_image);

// -----------------------------------------------------------------------------
// 2. CONSTANTS
// -----------------------------------------------------------------------------

var SCALE_FACTOR = 10000;  // NEON stores reflectance as integer * 10000
var NODATA_VAL   = -100;   // Water absorption bands stored as -100 integer in GEE (not -9999)

// Band wavelength range definitions (matching production Python code)
// [minWavelength_nm, maxWavelength_nm]
var BAND_RANGES = {
  blue:  [459.0, 479.0],
  red:   [635.5, 670.0],
  nir:   [850.0, 880.0],
  pri1:  [523.5, 538.5],
  pri2:  [562.5, 577.5],
  water1:[845.0, 855.0],   // Water mask band 1 (NIR ~850nm, ±5nm to ensure band capture at ~5nm spacing)
  water2:[1595.0, 1605.0]  // Water mask band 2 (SWIR ~1600nm, ±5nm to ensure band capture)
};

// VI parameters
var EVI_G  = 2.5;
var EVI_C1 = 6.0;
var EVI_C2 = 7.5;
var EVI_L  = 1.0;
var ARVI_GAMMA = 1.0;
var SAVI_L = 0.5;

// Water mask thresholds (applied to scaled 0-1 reflectance)
var WATER_THRESH_NIR  = 0.01;
var WATER_THRESH_SWIR = 0.005;

// -----------------------------------------------------------------------------
// 3. CORE HELPER: Band range selector
// Returns a single-band image = unweighted mean of all bands whose
// center wavelength falls within [minWl, maxWl].
// Reflectance is scaled to 0-1 by dividing by SCALE_FACTOR.
// -----------------------------------------------------------------------------

/**
 * Get the mean reflectance (0-1 scaled) across all bands within a
 * wavelength range.
 *
 * @param {ee.Image}  image  - NEON HSI image with bands B001..B426
 * @param {number}    minWl  - minimum wavelength (nm, inclusive)
 * @param {number}    maxWl  - maximum wavelength (nm, inclusive)
 * @returns {ee.Image} single-band image, reflectance 0-1
 */
function getBandMeanByWavelengthRange(image, minWl, maxWl) {
  // Wavelengths are stored as per-band properties: WL_FWHM_B001, WL_FWHM_B002, ..., WL_FWHM_B426
  // Each property value is a "center_wavelength,fwhm" string (e.g. "459.5,5.8")
  // Band name = property key with 'WL_FWHM_' stripped (e.g. 'WL_FWHM_B053' -> 'B053')
  var props = image.toDictionary();
  var wlDict = props.select(['WL_FWHM_B\\d+']);  // select all band wavelength properties
  var keys = wlDict.keys();  // ['WL_FWHM_B001', 'WL_FWHM_B002', ...]

  // Map over keys: keep those whose center wavelength falls in [minWl, maxWl]
  var inRangeKeys = keys.map(function(key) {
    key = ee.String(key);
    // Parse center wavelength from "center_wl,fwhm" string
    var centerWl = ee.Number.parse(ee.String(wlDict.get(key)).split(',').get(0));
    // Return the key if in range, or a sentinel to be filtered out
    return ee.Algorithms.If(
      centerWl.gte(minWl).and(centerWl.lte(maxWl)),
      key,
      'EXCLUDE'
    );
  }).filter(ee.Filter.neq('item', 'EXCLUDE'));

  // Derive band names by stripping the 'WL_FWHM_' prefix
  var bandNames = inRangeKeys.map(function(key) {
    return ee.String(key).replace('WL_FWHM_', '');
  });

  // Select the bands, scale to 0-1 reflectance, return unweighted mean as single band
  var subset = image.select(bandNames).divide(SCALE_FACTOR);
  return subset.reduce(ee.Reducer.mean()).rename('band_mean');
}

// -----------------------------------------------------------------------------
// 4. WATER MASK
// Pixels where NIR ~850nm < 0.01 AND SWIR ~1600nm < 0.005 are masked.
// Returns a binary mask image (1 = valid land, 0 = water/mask).
// -----------------------------------------------------------------------------

function getWaterMask(image) {
  var nirWater  = getBandMeanByWavelengthRange(image, BAND_RANGES.water1[0], BAND_RANGES.water1[1]);
  var swirWater = getBandMeanByWavelengthRange(image, BAND_RANGES.water2[0], BAND_RANGES.water2[1]);
  // Land = NIR >= threshold OR SWIR >= threshold (i.e., not both low)
  var waterMask = nirWater.lt(WATER_THRESH_NIR).and(swirWater.lt(WATER_THRESH_SWIR));
  return waterMask.not();  // 1 = land/valid, 0 = water
}

// -----------------------------------------------------------------------------
// 5. PRECOMPUTE SPECTRAL BANDS
// Call once per image to avoid redundant band lookups across multiple indices.
// Returns an object with scaled (0-1) reflectance images for each role.
// -----------------------------------------------------------------------------

function precomputeBands(image) {
  return {
    blue:  getBandMeanByWavelengthRange(image, BAND_RANGES.blue[0],  BAND_RANGES.blue[1]),
    red:   getBandMeanByWavelengthRange(image, BAND_RANGES.red[0],   BAND_RANGES.red[1]),
    nir:   getBandMeanByWavelengthRange(image, BAND_RANGES.nir[0],   BAND_RANGES.nir[1]),
    pri1:  getBandMeanByWavelengthRange(image, BAND_RANGES.pri1[0],  BAND_RANGES.pri1[1]),
    pri2:  getBandMeanByWavelengthRange(image, BAND_RANGES.pri2[0],  BAND_RANGES.pri2[1]),
    water: getWaterMask(image)
  };
}

// -----------------------------------------------------------------------------
// 6. VEGETATION INDEX FUNCTIONS
// Each takes the precomputed bands object and returns a masked, named image.
// -----------------------------------------------------------------------------

function computeNDVI(bands) {
  var nir = bands.nir;
  var red = bands.red;
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  return ndvi.updateMask(bands.water);
}

function computeEVI(bands) {
  var nir  = bands.nir;
  var red  = bands.red;
  var blue = bands.blue;
  // EVI = G * (NIR - Red) / (NIR + C1*Red - C2*Blue + L)
  var denom = nir.add(red.multiply(EVI_C1)).subtract(blue.multiply(EVI_C2)).add(EVI_L);
  var evi   = nir.subtract(red).multiply(EVI_G).divide(denom).rename('EVI');
  return evi.updateMask(bands.water);
}

function computeARVI(bands) {
  var nir  = bands.nir;
  var red  = bands.red;
  var blue = bands.blue;
  // rho_rb = Red - gamma * (Blue - Red)
  var rho_rb = red.subtract(blue.subtract(red).multiply(ARVI_GAMMA));
  var arvi   = nir.subtract(rho_rb).divide(nir.add(rho_rb)).rename('ARVI');
  return arvi.updateMask(bands.water);
}

function computePRI(bands) {
  var p531 = bands.pri1;
  var p570 = bands.pri2;
  var pri  = p531.subtract(p570).divide(p531.add(p570)).rename('PRI');
  return pri.updateMask(bands.water);
}

function computeSAVI(bands) {
  var nir = bands.nir;
  var red = bands.red;
  // SAVI = ((NIR - Red) / (NIR + Red + L)) * (1 + L)
  var savi = nir.subtract(red)
               .divide(nir.add(red).add(SAVI_L))
               .multiply(1 + SAVI_L)
               .rename('SAVI');
  return savi.updateMask(bands.water);
}

// -----------------------------------------------------------------------------
// 7. VISUALIZATION PARAMETERS
// Palettes and stretch values for each index.
// -----------------------------------------------------------------------------

var VI_VIS = {
  NDVI: {
    min: -0.1, max: 0.9,
    palette: ['#d73027','#f46d43','#fdae61','#fee08b',
              '#d9ef8b','#a6d96a','#66bd63','#1a9850'],
    description: 'Normalized Difference Vegetation Index'
  },
  EVI: {
    min: -0.1, max: 0.8,
    palette: ['#d73027','#f46d43','#fdae61','#fee08b',
              '#d9ef8b','#a6d96a','#66bd63','#1a9850'],
    description: 'Enhanced Vegetation Index'
  },
  ARVI: {
    min: -0.1, max: 0.8,
    palette: ['#d73027','#f46d43','#fdae61','#fee08b',
              '#d9ef8b','#a6d96a','#66bd63','#1a9850'],
    description: 'Atmospherically Resistant Vegetation Index'
  },
  PRI: {
    min: -0.05, max: 0.05,
    palette: ['#8c510a','#bf812d','#dfc27d','#f6e8c3',
              '#c7eae5','#80cdc1','#35978f','#01665e'],
    description: 'Photochemical Reflectance Index (Canopy Xanthophyll)'
  },
  SAVI: {
    min: -0.1, max: 0.8,
    palette: ['#d73027','#f46d43','#fdae61','#fee08b',
              '#d9ef8b','#a6d96a','#66bd63','#1a9850'],
    description: 'Soil-Adjusted Vegetation Index (L=0.5)'
  }
};

// -----------------------------------------------------------------------------
// 8. COMPUTE AND DISPLAY ALL INDICES
// -----------------------------------------------------------------------------

// Precompute bands once (shared across all indices - avoids redundant GEE calls)
var bands = precomputeBands(selected_image);

// Compute all indices
var ndvi = computeNDVI(bands);
var evi  = computeEVI(bands);
var arvi = computeARVI(bands);
var pri  = computePRI(bands);
var savi = computeSAVI(bands);

// Add all layers to the map (initially visible - toggle as needed)
Map.addLayer(ndvi, {min: VI_VIS.NDVI.min, max: VI_VIS.NDVI.max, palette: VI_VIS.NDVI.palette}, 'NDVI', false);
Map.addLayer(evi,  {min: VI_VIS.EVI.min,  max: VI_VIS.EVI.max,  palette: VI_VIS.EVI.palette},  'EVI',  false);
Map.addLayer(arvi, {min: VI_VIS.ARVI.min, max: VI_VIS.ARVI.max, palette: VI_VIS.ARVI.palette}, 'ARVI', false);
Map.addLayer(pri,  {min: VI_VIS.PRI.min,  max: VI_VIS.PRI.max,  palette: VI_VIS.PRI.palette},  'PRI',  false);
Map.addLayer(savi, {min: VI_VIS.SAVI.min, max: VI_VIS.SAVI.max, palette: VI_VIS.SAVI.palette}, 'SAVI', false);

// Print summary to console for verification
print('--- Vegetation Indices computed ---');
print('NDVI:', ndvi);
print('EVI:',  evi);
print('ARVI:', arvi);
print('PRI:',  pri);
print('SAVI:', savi);

// Quick sanity check - sample stats at image centroid
var sampleRegion = selected_image.geometry().centroid(30).buffer(500);
print('NDVI sample stats (500m buffer around centroid):',
  ndvi.reduceRegion({
    reducer: ee.Reducer.mean().combine(ee.Reducer.stdDev(), null, true)
                              .combine(ee.Reducer.minMax(), null, true),
    geometry: sampleRegion,
    scale: 1,
    maxPixels: 1e6
  })
);

// -----------------------------------------------------------------------------
// 9. SLOPE AND ASPECT (from NEON lidar DTM)
// Included here as a second prototype alongside the VIs.
// DTM collection: DP3.30024.001
// -----------------------------------------------------------------------------

// DTM is in the DEM/001 collection (same collection as DSM), select the 'DTM' band.
// Filter spatially using the HSI image footprint — more robust than property-based filtering.
var demCollection = ee.ImageCollection('projects/neon-prod-earthengine/assets/DEM/001')
  .filterBounds(selected_image.geometry());
print('DEM tiles found for ABBY footprint:', demCollection.size());

// Compute terrain products per tile (preserves each tile's native UTM projection)
// so that slope/aspect are computed in meters (not degrees, which produces zero derivatives).
// Then mosaic the already-computed terrain bands.
var terrainCollection = demCollection.select('DTM').map(function(tile) {
  return ee.Terrain.products(tile);
});
var terrain   = terrainCollection.mosaic();
var dtm       = terrain.select('elevation').rename('DTM');
var slope     = terrain.select('slope').rename('Slope');
var aspect    = terrain.select('aspect').rename('Aspect');
var hillshade = terrain.select('hillshade').rename('Hillshade');

Map.addLayer(slope,     {min: 0,   max: 60,  palette: ['#ffffff','#8b4513']}, 'Slope (degrees)', false);
Map.addLayer(aspect,    {min: 0,   max: 360, palette: ['#d53e4f','#f46d43','#fdae61','#fee08b',
                                                        '#e6f598','#abdda4','#66c2a5','#3288bd','#d53e4f']}, 'Aspect (degrees)', false);
Map.addLayer(hillshade, {min: 0,   max: 255, palette: ['#000000','#ffffff']}, 'Hillshade', false);

print('Terrain products (slope, aspect, hillshade) added.');

// =============================================================================
// END OF SCRIPT
// =============================================================================