// Author: J Musinsky, February 2026
// National Ecological Observatory Network, Battelle
// AOP Earth Engine Data Viewer app - desktop version

// Initialize the map with a default center and zoom level
Map.setCenter(-95.7129, 37.0902, 4); // Centered over the USA

// Other global variables
var currentCropGeometry = null;
var cropLayer = null;
var exportPanelOpen = false;
var spectralClickEnabled = true;
var selectedImage1 = null;  // Global: accessed by Map.onClick spectral chart handler
var selectedImage2 = null;

// Import the NLCD collection
var dataset = ee.ImageCollection('USGS/NLCD_RELEASES/2021_REL/NLCD');
// Filter the collection to the 2021 product
var nlcd2021 = dataset.filter(ee.Filter.eq('system:index', '2021')).first();

// Add NLCD layer to the map but set it to be hidden initially
var nlcdLayer = Map.addLayer(nlcd2021.select('landcover'), null, 'NLCD Landcover', false);

// Set the default map layer to Satellite
//Map.setOptions('SATELLITE');

// ----------------------------
// Define Image Collections, Feature Collections, Templates
// ----------------------------

// Define available image collections
var imageCollections = {
  "Spectrometer Directional Reflectance (HSI_REFL/001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/001"),
  "Spectrometer Bidirectional Reflectance (HSI_REFL/002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/002"),
  "Canopy Height Model (CHM/001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CHM/001"),
  "Digital Surface Model (DEM/001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
  "Digital Terrain Model (DEM/001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
  "RGB Camera Photography (RGB/001)": ee.ImageCollection('projects/neon-prod-earthengine/assets/RGB/001'),
  "Canopy Nitrogen Concentration (CNC/002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CNC/002"),
  "Derived Indices (HSI_REFL/002) / Terrain Products (DEM/001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/002")
};

// Sample script templates for different collection types
var scriptTemplates = {
  "Spectrometer Directional Reflectance (HSI_REFL/001)": {
    collectionPath: "projects/neon-prod-earthengine/assets/HSI_REFL/001",
    collectionVariable: "refl001",
    collectionName: "Directional Reflectance",
    bands: "['B053','B035','B019']",
    visParams: "{min: 103, max: 1160, bands: ['B053','B035','B019'], gamma: 1.0}",
    layerName: "Directional Reflectance"
  },
  "Spectrometer Bidirectional Reflectance (HSI_REFL/002)": {
    collectionPath: "projects/neon-prod-earthengine/assets/HSI_REFL/002",
    collectionVariable: "refl002",
    collectionName: "Bidirectional Reflectance",
    bands: "['B053','B035','B019']",
    visParams: "{min: 340, max: 2150, bands: ['B053','B035','B019'], gamma: 2}",
    layerName: "Bidirectional Reflectance"
  },
  "Canopy Height Model (CHM/001)": {
    collectionPath: "projects/neon-prod-earthengine/assets/CHM/001",
    collectionVariable: "chm",
    collectionName: "CHM",
    bands: "['CHM']",
    visParams: "{min: 0, max: 35, palette: ['E6F7E0', '063B00']}",
    layerName: "Canopy Height Model (m)"
  },
  "Digital Surface Model (DEM/001)": {
    collectionPath: "projects/neon-prod-earthengine/assets/DEM/001",
    collectionVariable: "dsm",
    collectionName: "DSM",
    bands: "['DSM']",
    visParams: "{bands: ['DSM'], min: 0, max: 4000, palette: ['000000', 'FFFFFF']}",
    layerName: "Digital Surface Model (m)"
  },
  "Digital Terrain Model (DEM/001)": {
    collectionPath: "projects/neon-prod-earthengine/assets/DEM/001",
    collectionVariable: "dtm",
    collectionName: "DTM",
    bands: "['DTM']",
    visParams: "{bands: ['DTM'], min: 0, max: 4000, palette: ['000000', 'FFFFFF']}",
    layerName: "Digital Terrain Model (m)"
  },
  "RGB Camera Photography (RGB/001)": {
    collectionPath: "projects/neon-prod-earthengine/assets/RGB/001",
    collectionVariable: "rgb",
    collectionName: "RGB",
    bands: "['R','G','B']",
    visParams: "{min: 40, max: 200, bands: ['R','G','B'], gamma: 0.65}",
    layerName: "RGB Camera Photography"
  },
  "Canopy Nitrogen Concentration (CNC/002)": {
    collectionPath: "projects/neon-prod-earthengine/assets/CNC/002",
    collectionVariable: "cnc",
    collectionName: "CNC",
    bands: "['Nitrogen_Percent']",
    visParams: "{bands: ['Nitrogen_Percent'], min: 0, max: 4, palette: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725']}",
    layerName: "Canopy Nitrogen Concentration"
  }
};

// Define the TOS boundaries and TOS plot polygons feature collections
var terrestrialSamplingBoundaries = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/terrestrialSamplingBoundaries");
var TOSplots = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/All_NEON_TOS_Plot_Polygons_V11");
var airsheds = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/90percent_footprint");

var towers = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/NEON_Field_Sites_v17");
// Add NEON Flightbox Boundaries FeatureCollection
var neonFlightboxBoundaries = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/NEON_Flightbox_Boundaries_Merged");

// ----------------------------
// Set Up User Interface (UI)
// ----------------------------

// Set the layout of the root panel to horizontal
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

// Create a full-height main panel on the left side of the map
var mainPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'), // Enable vertical layout
  style: {
    width: '335px', // Fixed width
    height: '100%', // Full height
    padding: '10px',
    backgroundColor: 'white', // Background color for clarity (optional)
    stretch: 'vertical', // Stretch the panel to full height
    //overflow: 'auto' // Enable scrolling (doesn't seem to be necessary here)
  }
});

// Define the drawing tools widget with rectangle mode only
var drawingTools = Map.drawingTools();
drawingTools.setShown(false);
drawingTools.setDrawModes(['rectangle']);
drawingTools.setShape('rectangle');
drawingTools.stop(); 

// Set up drawing event handlers
drawingTools.onDraw(function() {
  updateCropGeometry();
});

drawingTools.onEdit(function() {
  updateCropGeometry();
});

// Add the main panel to the root
ui.root.insert(0, mainPanel);

// Add dropdowns to select image collections and images
// Dropdown for selecting the first image collection
var selectCollection1 = ui.Select({
  items: Object.keys(imageCollections),
  placeholder: 'Select the 1st image collection',
  onChange: function(selectedCollection) {
    updateImageDropdown1(neonSiteSelect.getValue());
  },
  style: {width: '100%', margin: '10px 0'}
});

// Dropdown for selecting the second image collection
var selectCollection2 = ui.Select({
  items: Object.keys(imageCollections),
  placeholder: 'Select the 2nd image collection (optional)',
  onChange: function(selectedCollection) {
    updateImageDropdown2(neonSiteSelect.getValue());
  },
  style: {width: '100%', margin: '10px 0'}
});

// Merge all image collections into a single FeatureCollection
var mergedCollections = ee.FeatureCollection(imageCollections['Spectrometer Directional Reflectance (HSI_REFL/001)'])
  .merge(ee.FeatureCollection(imageCollections['Spectrometer Bidirectional Reflectance (HSI_REFL/002)']))
  .merge(ee.FeatureCollection(imageCollections['Canopy Height Model (CHM/001)']))
  .merge(ee.FeatureCollection(imageCollections['Digital Surface Model (DEM/001)']))
  .merge(ee.FeatureCollection(imageCollections['Digital Terrain Model (DEM/001)']))
  .merge(ee.FeatureCollection(imageCollections['RGB Camera Photography (RGB/001)']))
  .merge(ee.FeatureCollection(imageCollections['Canopy Nitrogen Concentration (CNC/002)']));

// Compile distinct NEON_SITE and NEON_SITE_NAME pairs
var siteNamePairs = mergedCollections
  .distinct(['NEON_SITE', 'NEON_SITE_NAME']) // Get unique combinations of NEON_SITE and NEON_SITE_NAME
  .reduceColumns({
    reducer: ee.Reducer.toList(2), // Collect pairs of NEON_SITE and NEON_SITE_NAME
    selectors: ['NEON_SITE', 'NEON_SITE_NAME']
  })
  .get('list'); // Assemble the list of pairs

// Convert siteNamePairs into a list
siteNamePairs = ee.List(siteNamePairs).getInfo();

// Sort the siteNamePairs list by NEON_SITE
siteNamePairs.sort(function(a, b) {
  return a[0].localeCompare(b[0]); // Sort alphabetically by NEON_SITE (a[0])
});

// Use a mapping function to format dropdown items
var dropdownItems = siteNamePairs.map(function(pair) {
  var site = pair[0]; // NEON_SITE
  var name = pair[1] || 'Unknown'; // NEON_SITE_NAME, defaults to 'Unknown' if missing
  return {label: site + ' - ' + name, value: site}; // Use NEON_SITE for value
});

// Create the dropdown with formatted labels
var neonSiteSelect = ui.Select({
  items: dropdownItems,
  placeholder: 'Select NEON Site',
  onChange: function(selectedSite) {
    updateImageDropdown1(selectedSite); // Reset images for the first collection
    updateImageDropdown2(selectedSite); // Reset images for the second collection
  },
  style: { width: '100%', margin: '10px 0' }
});

// Update function to populate the first image dropdown based on the selected NEON_SITE and first image collection
function updateImageDropdown1(selectedSite) {
  var collection1 = imageCollections[selectCollection1.getValue()];

  if (collection1 && selectedSite) {
    // Filter the first collection by the selected NEON_SITE
    collection1 = collection1.filter(ee.Filter.eq('NEON_SITE', selectedSite));

    // Retrieve the image indices for the filtered collection
    var imageList = collection1.aggregate_array('system:index').getInfo();

    // Reset dropdown options for the first image selection
    select1.items().reset(imageList);
    select1.setPlaceholder(imageList.length ? 'Select the 1st image' : 'No images for this site from this collection');

    // Clear the selection, waiting for user input
    select1.setValue(null);

    // Clear the map for the first image layer
    updateMap(null, select2.getValue(), currentVisParams);
  }
}

// Update function to populate the second image dropdown based on the selected NEON_SITE and second image collection
function updateImageDropdown2(selectedSite) {
  var collection2 = imageCollections[selectCollection2.getValue()];

  if (collection2 && selectedSite) {
    // Filter the second collection by the selected NEON_SITE
    collection2 = collection2.filter(ee.Filter.eq('NEON_SITE', selectedSite));

    // Retrieve the image indices for the filtered collection
    var imageList = collection2.aggregate_array('system:index').getInfo();

    // Reset dropdown options for the second image selection
    select2.items().reset(imageList);
    select2.setPlaceholder(imageList.length ? 'Select the 2nd image' : 'No images for this site from this collection');

    // Clear the selection and wait for user input
    select2.setValue(null);

    // Clear the map for the second image layer
    updateMap(select1.getValue(), null, currentVisParams);
  }
}

selectCollection1.onChange(function(selectedCollection) {
  updateImageDropdown1(neonSiteSelect.getValue());
  updateFilterPanelVisibility();
});

selectCollection2.onChange(function(selectedCollection) {
  updateImageDropdown2(neonSiteSelect.getValue());
  updateFilterPanelVisibility();
});

// Create dropdowns for specific image selection for first and second images
var select1 = ui.Select({
  placeholder: 'Select the 1st image',
  onChange: function(selectedImageName) {
    updateMap(selectedImageName, select2.getValue(), currentVisParams);
  },
  style: {width: '100%', margin: '10px 0'}
});
var select2 = ui.Select({
  placeholder: 'Select the 2nd image (optional)',
  onChange: function(selectedImageName) {
    updateMap(select1.getValue(), selectedImageName, currentVisParams);
  },
  style: {width: '100%', margin: '10px 0'}
});

// Create export image panel
var exportPanel = ui.Panel({
  widgets: [
    ui.Label('Export 1st image to local drive', {fontWeight: 'bold', fontSize: '14px'}),
    ui.Label('Draw rectangle to crop area, or export full image', {fontSize: '11px', fontWeight: 'bold', color: 'gray'}),
    ui.Panel({
      widgets: [
        ui.Button({
          label: 'Export as GeoTIFF',
          onClick: exportCroppedImage,
          style: {width: '48%', margin: '2px 1%'}
        }),
        ui.Button({
          label: 'Reset to full image',
          onClick: resetToFullImage,
          style: {width: '48%', margin: '2px 1%'}
        })
      ],
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {width: '100%'}
    }),
    ui.Button({
      label: 'Close Export panel',
      onClick: closeExportPanel,
      style: {width: '100%', margin: '5px 0', backgroundColor: '#ff9999'}
    })
  ],
  style: {
    shown: false,
    padding: '10px',
    border: '2px solid green',
    backgroundColor: '#f0f8f0',
    width: '100%',
    margin: '10px 0'
  }
});

// Create sample script panel
var sampleScriptPanel = ui.Panel({
  widgets: [
    ui.Label('Sample GEE Script for Selected Image', {fontWeight: 'bold', fontSize: '14px'}),
    ui.Label('Copy this script to use in the GEE Code Editor', {fontSize: '11px', fontWeight: 'bold', color: 'gray'})
  ],
  style: {
    shown: false,
    padding: '15px',
    border: '2px solid blue',
    backgroundColor: '#f0f0ff',
    width: '470px',
    height: '450px',
    position: 'middle-left',
    margin: '10px 0'
  }
});

// Add the sample script panel to the map
Map.add(sampleScriptPanel);

// Replace export button with panel toggle button
var exportButton = ui.Button({
  label: 'Export 1st image to local drive as RGB GeoTIFF',
  onClick: function() {
    openExportPanel();
  },
  style: {
    width: '100%', 
    margin: '10px 0'
  }
});

// Create sample script button
var sampleScriptButton = ui.Button({
  label: 'Generate sample GEE Script for 1st image',
  onClick: function() {
    generateSampleScript();
  },
  style: {
    width: '100%', 
    margin: '10px 0',
    backgroundColor: '#e6f3ff'
  }
});

/// Function to generate and display sample script
function generateSampleScript() {
  if (!select1.getValue()) {
    print('Please select the 1st image before generating sample script.');
    return;
  }
  
  var selectedCollection = selectCollection1.getValue();
  
  // Handle Derived Indices/Terrain Products separately — no scriptTemplates entry needed
  if (selectedCollection === 'Derived Indices (HSI_REFL/002) / Terrain Products (DEM/001)') {
    var derivedCollection = imageCollections[selectedCollection];
    var derivedImage = derivedCollection.filter(ee.Filter.eq('system:index', select1.getValue())).first();
    derivedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var product = currentDerivedProduct;
      var vis = DERIVED_VIS[product];
      var paletteStr = JSON.stringify(vis.palette);
      var site = neonSiteSelect.getValue();
      var idx  = select1.getValue();

      var isTerrainProduct = (product === 'Slope' || product === 'Aspect' || product === 'Hillshade');
      var terrainBandMap = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};

      var lines = [
        '// NEON AOP Derived ' + product + ' — generated by AOP GEE Data Viewer',
        '// Site: ' + site + '  |  Year: ' + year + '  |  Image: ' + idx,
        ''
      ];

      if (isTerrainProduct) {
        lines = lines.concat([
          '// Load the HSI_REFL/002 image to get the site footprint geometry',
          'var hsiImage = ee.ImageCollection(\'projects/neon-prod-earthengine/assets/HSI_REFL/002\')',
          '  .filter(ee.Filter.eq(\'system:index\', \'' + idx + '\')).first();',
          '',
          '// Load DEM tiles intersecting the site and compute terrain per tile,',
          '// then mosaic — preserves native UTM projection so derivatives are in meters.',
          'var terrainMosaic = ee.ImageCollection(\'projects/neon-prod-earthengine/assets/DEM/001\')',
          '  .filterBounds(hsiImage.geometry())',
          '  .select(\'DTM\')',
          '  .map(function(tile) { return ee.Terrain.products(tile); })',
          '  .mosaic();',
          '',
          'var result = terrainMosaic.select(\'' + terrainBandMap[product] + '\').rename(\'' + product + '\');',
          '',
          'Map.addLayer(result, {min: ' + vis.min + ', max: ' + vis.max + ', palette: ' + paletteStr + '}, \'' + site + ' ' + year + ' ' + product + '\');',
          'Map.centerObject(hsiImage);'
        ]);
      } else {
        // Vegetation index — include the full compute pipeline
        lines = lines.concat([
          'var SCALE_FACTOR = 10000;',
          '',
          '// Helper: mean reflectance (0-1) across all bands in [minWl, maxWl]',
          'function getBandMean(image, minWl, maxWl) {',
          '  var wlDict = image.toDictionary().select([\'WL_FWHM_B\\\\d+\']);',
          '  var keys = wlDict.keys();',
          '  var inRange = keys.map(function(key) {',
          '    key = ee.String(key);',
          '    var wl = ee.Number.parse(ee.String(wlDict.get(key)).split(\',\').get(0));',
          '    return ee.Algorithms.If(wl.gte(minWl).and(wl.lte(maxWl)), key, \'EXCLUDE\');',
          '  }).filter(ee.Filter.neq(\'item\', \'EXCLUDE\'));',
          '  var bands = inRange.map(function(k) { return ee.String(k).replace(\'WL_FWHM_\', \'\'); });',
          '  return image.select(bands).divide(SCALE_FACTOR).reduce(ee.Reducer.mean()).rename(\'band_mean\');',
          '}',
          '',
          'var refl002 = ee.ImageCollection(\'projects/neon-prod-earthengine/assets/HSI_REFL/002\');',
          'var img = refl002.filter(ee.Filter.eq(\'system:index\', \'' + idx + '\')).first();',
          '',
          'var NIR  = getBandMean(img, 850, 880);',
          'var Red  = getBandMean(img, 635.5, 670);',
          'var Blue = getBandMean(img, 459, 479);',
          'var P531 = getBandMean(img, 523.5, 538.5);',
          'var P570 = getBandMean(img, 562.5, 577.5);',
          '',
          '// Water mask (NIR < 0.01 AND SWIR < 0.005 = water)',
          'var nirW  = getBandMean(img, 845, 855);',
          'var swirW = getBandMean(img, 1595, 1605);',
          'var landMask = nirW.lt(0.01).and(swirW.lt(0.005)).not();',
          ''
        ]);

        if (product === 'NDVI') {
          lines.push('var result = NIR.subtract(Red).divide(NIR.add(Red)).rename(\'NDVI\').updateMask(landMask);');
        } else if (product === 'EVI') {
          lines = lines.concat([
            'var denom = NIR.add(Red.multiply(6)).subtract(Blue.multiply(7.5)).add(1);',
            'var result = NIR.subtract(Red).multiply(2.5).divide(denom).rename(\'EVI\').updateMask(landMask);'
          ]);
        } else if (product === 'ARVI') {
          lines = lines.concat([
            'var rho_rb = Red.subtract(Blue.subtract(Red));',
            'var result = NIR.subtract(rho_rb).divide(NIR.add(rho_rb)).rename(\'ARVI\').updateMask(landMask);'
          ]);
        } else if (product === 'PRI') {
          lines.push('var result = P531.subtract(P570).divide(P531.add(P570)).rename(\'PRI\').updateMask(landMask);');
        } else if (product === 'SAVI') {
          lines = lines.concat([
            'var L = 0.5;',
            'var result = NIR.subtract(Red).divide(NIR.add(Red).add(L)).multiply(1 + L).rename(\'SAVI\').updateMask(landMask);'
          ]);
        }

        lines = lines.concat([
          '',
          'Map.addLayer(result, {min: ' + vis.min + ', max: ' + vis.max + ', palette: ' + paletteStr + '}, \'' + site + ' ' + year + ' ' + product + '\');',
          'Map.centerObject(img);'
        ]);
      }

      displaySampleScript(lines.join('\n'));
    });
    return;
  }

  // Check if it's a supported collection type
  if (!scriptTemplates.hasOwnProperty(selectedCollection)) {
    print('Sample script generation not yet supported for: ' + selectedCollection);
    return;
  }
  
  var template = scriptTemplates[selectedCollection];
  var selectedSite = neonSiteSelect.getValue();
  var selectedImageIndex = select1.getValue();
  
  // Get the selected image
  var collection = imageCollections[selectedCollection];
  var selectedImage = collection.filter(ee.Filter.eq('system:index', selectedImageIndex)).first();
  
  // For DEM collections, get dynamic visualization parameters
  if (selectedCollection === "Digital Surface Model (DEM/001)") {
    var dynamicParams = getDynamicDSMVisParams(selectedImage);
    selectedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var visParamsString = '{bands: [\'DSM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'000000\', \'FFFFFF\']}';
      var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
      displaySampleScript(sampleScript);
    });
  } else if (selectedCollection === "Digital Terrain Model (DEM/001)") {
    var dynamicParams = getDynamicDTMVisParams(selectedImage);
    selectedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var visParamsString = '{bands: [\'DTM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'000000\', \'FFFFFF\']}';
      var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
      displaySampleScript(sampleScript);
    });
  } else if (selectedCollection === "Canopy Height Model (CHM/001)") {
    var dynamicParams = getDynamicCHMVisParams(selectedImage);
    selectedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var visParamsString = '{bands: [\'CHM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'E6F7E0\', \'063B00\']}';
      var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
      displaySampleScript(sampleScript);
    });
  } else if (selectedCollection === "Canopy Nitrogen Concentration (CNC/002)") {
    var dynamicParams = getNitrogenVisParams(selectedImage, 1);
    selectedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var visParamsString;
      var selectedBand = currentNitrogenBand1;
      
      if (selectedBand === 'Canopy Nitrogen Model Uncertainty') {
        visParamsString = '{bands: [\'Nitrogen_Uncertainty\'], min: ' + dynamicParams.min.toFixed(2) + ', max: ' + dynamicParams.max.toFixed(2) + ', palette: [\'#0d0887\', \'#7e03a8\', \'#cc4778\', \'#f89540\', \'#f0f921\']}';
      } else if (selectedBand === 'Needle Leaf/Non-Needle Leaf Classification') {
        visParamsString = '{bands: [\'Needle_Non-needle_Classification\'], min: 0, max: 1, palette: [\'olive\', \'green\']}';
      } else {
        visParamsString = '{bands: [\'Nitrogen_Percent\'], min: ' + dynamicParams.min.toFixed(2) + ', max: ' + dynamicParams.max.toFixed(2) + ', palette: [\'#440154\', \'#3b528b\', \'#21908c\', \'#5dc963\', \'#fde725\']}';
      }
      
      var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
      displaySampleScript(sampleScript);
    });
  } else {
    // For other collections, use template defaults
    selectedImage.get('FLIGHT_YEAR').evaluate(function(year) {
      var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year);
      displaySampleScript(sampleScript);
    });
  }
}

// Function to generate the actual script content
function generateScriptContent(template, site, imageIndex, year, dynamicVisParams) {
  // Use dynamic visualization parameters if provided, otherwise use template defaults
  var visParamsToUse = dynamicVisParams || template.visParams;
  
  // Special handling for PUUM site with spectrometer collections
  if (site === 'PUUM' && 
      (template.collectionName === 'Directional Reflectance' || 
       template.collectionName === 'Bidirectional Reflectance')) {
    // Replace default bands with PUUM-specific bands
    visParamsToUse = visParamsToUse.replace("['B053','B035','B019']", "['B060','B042','B026']");
    visParamsToUse = visParamsToUse.replace("min: 103", "min: 100");
    visParamsToUse = visParamsToUse.replace("max: 1160", "max: 1400");
    visParamsToUse = visParamsToUse.replace("min: 340", "min: 100");
    visParamsToUse = visParamsToUse.replace("max: 2150", "max: 1400");
    visParamsToUse = visParamsToUse.replace("gamma: 2", "gamma: 1.0");
  }
  
  var scriptLines = [
    '// Read in the NEON AOP ' + template.collectionName + ' Image Collection',
    'var ' + template.collectionVariable + ' = ee.ImageCollection(',
    '  \'' + template.collectionPath + '\');',
    '',
    '// Display available images in the ' + template.collectionName + ' Image Collection',
    'print(\'NEON ' + template.collectionName + ' Images\', ' + template.collectionVariable + '.aggregate_array(\'system:index\'))',
    '',
    '// Filter by specific image index',
    'var selected_image = ' + template.collectionVariable + '.filter(ee.Filter.eq(\'system:index\', \'' + imageIndex + '\')).first();'
  ];
  
  // Add masking for nitrogen content
  if (template.collectionName === 'CNC') {
    scriptLines.push('');
    scriptLines.push('// Mask nitrogen band using valid pixel classification band');
    scriptLines.push('var nit_valid = selected_image.select(\'Valid_Pixel_Classification\');');
    scriptLines.push('selected_image = selected_image.updateMask(nit_valid);');
  }
  
  scriptLines.push('');
  scriptLines.push('// Define the visualization parameters');
  if (template.collectionName === 'CNC' && dynamicVisParams) {
    var selectedBand = currentNitrogenBand1;
    if (selectedBand === 'Percent Nitrogen (%)') {
      scriptLines.push('// Note: The min/max values below use a 95% stretch (2.5-97.5 percentile)');
    }
  }
  scriptLines.push('var visParams = ' + visParamsToUse + ';');
  scriptLines.push('');
  scriptLines.push('// Add the layer to the map and center on the site');
  
  // Use specific layer name for nitrogen bands
  var layerName = template.layerName;
  if (template.collectionName === 'CNC') {
    var selectedBand = currentNitrogenBand1;
    if (selectedBand === 'Canopy Nitrogen Model Uncertainty') {
      layerName = 'Nitrogen Uncertainty (%)';
    } else if (selectedBand === 'Needle Leaf/Non-Needle Leaf Classification') {
      layerName = 'Nitrogen Classification';
    } else {
      layerName = 'Nitrogen (%)';
    }
  }
  
  scriptLines.push('Map.addLayer(selected_image, visParams, \'' + site + ' ' + year + ' ' + layerName + '\');');
  scriptLines.push('Map.centerObject(selected_image);');
  
  return scriptLines.join('\n');
}

// Function to display the sample script in the panel
function displaySampleScript(scriptContent) {
  // Clear existing content
  sampleScriptPanel.clear();
  
  // Add title and description
  sampleScriptPanel.add(ui.Label('Sample GEE Script for displaying 1st Image', {fontWeight: 'bold', fontSize: '14px'}));
  sampleScriptPanel.add(ui.Label('=== COPY THE SCRIPT BELOW AND PASTE IN A NEW GEE CODE EDITOR ===', {fontSize: '11px', fontWeight: 'bold', color: 'red'}));
  
  // Create a code display panel
  var codePanel = ui.Panel({
    style: {
      backgroundColor: '#f5f5f5',
      border: '1px solid #ddd',
      padding: '10px',
      height: '280px'
    }
  });
  
  // Add the script as a selectable label
  var codeLabel = ui.Label({
    value: scriptContent,
    style: {
      fontFamily: 'monospace',
      fontSize: '10px',
      whiteSpace: 'pre-wrap'
    }
  });
  
  codePanel.add(codeLabel);
  sampleScriptPanel.add(codePanel);
  
  // Add instruction
  sampleScriptPanel.add(ui.Label('Click and drag to select text above, then Ctrl+C to copy', {fontSize: '10px', fontStyle: 'italic', color: 'gray'}));
  
  // Add only close button
  var closeButton = ui.Button({
    label: 'Close',
    onClick: function() {
      sampleScriptPanel.style().set('shown', false);
    },
    style: {
      width: '100%', 
      margin: '10px 0 0 0'
    }
  });
  
  sampleScriptPanel.add(closeButton);
  
  // Show the panel
  sampleScriptPanel.style().set('shown', true);
}

// Function to open export panel and enable drawing
function openExportPanel() {
  if (!select1.getValue()) {
    print('Please select the 1st image before exporting.');
    return;
  }
  
  exportPanel.style().set('shown', true);
  exportPanelOpen = true;
  
  // Disable spectral curve clicking
  spectralClickEnabled = false;
  
  // Enable drawing tools and activate rectangle drawing mode
  drawingTools.setShown(true);
  drawingTools.setShape('rectangle'); // Ensure rectangle mode
  drawingTools.draw(); // Activate drawing mode
  
  // Set default crop geometry to full image bounds
  var collection1 = imageCollections[selectCollection1.getValue()];
  var selectedImage1 = collection1.filter(ee.Filter.eq('system:index', select1.getValue())).first();
  
  // Get the image bounds and set as default crop geometry
  var imageBounds = selectedImage1.geometry().bounds();
  currentCropGeometry = imageBounds;
  displayCropGeometry();
  
  print('Export panel opened. You can now draw a rectangle to crop the image, or export the full image.');
  print('Click and drag to draw a rectangle for cropping.');
  print('Current drawing layers:', drawingTools.layers().length()); // Remove .getInfo()
}

// Function to close export panel and disable drawing
function closeExportPanel() {
  exportPanel.style().set('shown', false);
  exportPanelOpen = false;
  
  // Re-enable spectral curve clicking
  spectralClickEnabled = true;
  
  // Disable drawing tools properly
  drawingTools.stop(); // Stop drawing mode
  drawingTools.setShown(false);
  drawingTools.layers().reset(); // Clear all drawn geometries
  
  // Clear crop geometry and layer
  currentCropGeometry = null;
  if (cropLayer) {
    Map.remove(cropLayer);
    cropLayer = null;
  }
}

// Function to reset crop to full image bounds
function resetToFullImage() {
  var collection1 = imageCollections[selectCollection1.getValue()];
  var selectedImage1 = collection1.filter(ee.Filter.eq('system:index', select1.getValue())).first();
  
  // Use the simpler bounds approach
  currentCropGeometry = selectedImage1.geometry().bounds();
  
  // Clear existing drawings and reactivate rectangle drawing mode
  drawingTools.layers().reset();
  drawingTools.setShape('rectangle'); // Ensure rectangle mode
  drawingTools.draw(); // Reactivate drawing mode after reset
  
  // Display the reset geometry
  displayCropGeometry();
}

// Function to update crop geometry from drawing tools
function updateCropGeometry() {
  var layers = drawingTools.layers();
  print('Number of drawn layers:', layers.length()); // Simple length, no getInfo()
  
  if (layers.length() > 0) {
    var drawnGeometry = layers.get(0).toGeometry();
    
    // Use the drawn geometry directly (it should already be a rectangle)
    currentCropGeometry = drawnGeometry;
    
    print('Crop rectangle drawn. New crop geometry set.');
    
    // Display the crop geometry
    displayCropGeometry();
  } else {
    print('No geometry drawn yet.');
  }
}

// Function to display crop geometry on map
function displayCropGeometry() {
  // Remove existing crop layer
  if (cropLayer) {
    Map.remove(cropLayer);
  }
  
  // Add safety check
  if (currentCropGeometry) {
    cropLayer = ui.Map.Layer(
      ee.FeatureCollection([ee.Feature(currentCropGeometry)]).style({
        color: 'lime',
        fillColor: '00000000',
        width: 3
      }), 
      {}, 
      'Export Crop Area'
    );
    Map.add(cropLayer);
  }
}

// Enhanced export function with cropping support
function exportCroppedImage() {
  // Check if first image is selected
  if (!select1.getValue()) {
    print('Please select the 1st image before exporting.');
    return;
  }
  
  var selectedImageName1 = select1.getValue();
  var collection1 = imageCollections[selectCollection1.getValue()];
  var selectedImage1 = collection1.filter(ee.Filter.eq('system:index', selectedImageName1)).first();

  // For derived products, compute the product image now so it is exported correctly
  var isDerivedExport = selectCollection1.getValue() === 'Derived Indices (HSI_REFL/002) / Terrain Products (DEM/001)';
  if (isDerivedExport) {
    var terrainBandMapExport = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};
    if (terrainBandMapExport.hasOwnProperty(currentDerivedProduct)) {
      var demCol = ee.ImageCollection('projects/neon-prod-earthengine/assets/DEM/001')
        .filterBounds(selectedImage1.geometry());
      selectedImage1 = demCol.select('DTM').map(function(tile) {
        return ee.Terrain.products(tile);
      }).mosaic().select(terrainBandMapExport[currentDerivedProduct]).rename(currentDerivedProduct);
    } else {
      var viBands = vi_precompute(selectedImage1);
      if      (currentDerivedProduct === 'NDVI') selectedImage1 = vi_ndvi(viBands);
      else if (currentDerivedProduct === 'EVI')  selectedImage1 = vi_evi(viBands);
      else if (currentDerivedProduct === 'ARVI') selectedImage1 = vi_arvi(viBands);
      else if (currentDerivedProduct === 'PRI')  selectedImage1 = vi_pri(viBands);
      else if (currentDerivedProduct === 'SAVI') selectedImage1 = vi_savi(viBands);
    }
  }

  // Apply cloud filter if needed
  if (cloudFilterSelect.getValue() === '< 10% Cloud Cover') {
    if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" || 
        selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)") {
      selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').eq(1));
    }
  }
  
  // Apply NaN masking for DSM/DTM if needed
  if (selectCollection1.getValue() === "Digital Surface Model (DEM/001)" || 
      selectCollection1.getValue() === "Digital Terrain Model (DEM/001)") {
    selectedImage1 = maskNaN(selectedImage1);
  }
  
  // Apply nitrogen masking if needed
  if (selectCollection1.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
    selectedImage1 = maskNitrogen(selectedImage1);
  }
  
  // Use current crop geometry or fall back to image bounds
  var exportGeometry = currentCropGeometry;
  if (!exportGeometry) {
    exportGeometry = selectedImage1.geometry().bounds();
  }
  
  // Use your existing calculateOptimalResolution function logic
  print('Calculating export area...');
  
  // Get bounds coordinates to calculate area manually (more reliable)
  exportGeometry.bounds().coordinates().evaluate(function(coords) {
    var ring = coords[0]; // First ring of coordinates
    
    // Extract min/max coordinates
    var lons = ring.map(function(coord) { return coord[0]; });
    var lats = ring.map(function(coord) { return coord[1]; });
    
    var minLon = Math.min.apply(Math, lons);
    var maxLon = Math.max.apply(Math, lons);
    var minLat = Math.min.apply(Math, lats);
    var maxLat = Math.max.apply(Math, lats);
    
    // Calculate approximate area in meters (rough conversion)
    var widthDegrees = maxLon - minLon;
    var heightDegrees = maxLat - minLat;
    var metersPerDegree = 111000; // Approximate
    var widthMeters = widthDegrees * metersPerDegree;
    var heightMeters = heightDegrees * metersPerDegree;
    var areaMeters = widthMeters * heightMeters;
    
    print('Export area: ' + (areaMeters / 1000000).toFixed(2) + ' km²');
    print('Image dimensions (approx): ' + widthMeters.toFixed(0) + 'm x ' + heightMeters.toFixed(0) + 'm');
    
    // Calculate optimal resolution
    var availableScales = [1, 2, 3, 5, 10, 15, 20, 30, 50, 100];
    var maxPixels = 8000000;
    var optimalScale = 100; // Default fallback
    
    for (var i = 0; i < availableScales.length; i++) {
      var scale = availableScales[i];
      var pixelCount = (widthMeters / scale) * (heightMeters / scale);
      
      print('At ' + scale + 'm resolution: ~' + (pixelCount / 1000000).toFixed(1) + 'M pixels');
      
      if (pixelCount <= maxPixels) {
        optimalScale = scale;
        if (scale > 5 && !currentCropGeometry) {
          print('Auto-scaled from 5m to ' + scale + 'm to accommodate image size');
        }
        break;
      }
    }
    
    // Determine visualization parameters based on collection type
    var exportVisParams;
    if (isDerivedExport) {
      var dVis = DERIVED_VIS[currentDerivedProduct];
      exportVisParams = {min: dVis.min, max: dVis.max, palette: dVis.palette};
      exportVisParams.forceRgbOutput = true;
    } else if (selectCollection1.getValue() === "Digital Surface Model (DEM/001)") {
      exportVisParams = getDynamicDSMVisParams(selectedImage1);
      exportVisParams.forceRgbOutput = true;
    } else if (selectCollection1.getValue() === "Digital Terrain Model (DEM/001)") {
      exportVisParams = getDynamicDTMVisParams(selectedImage1);
      exportVisParams.forceRgbOutput = true;
    } else if (selectCollection1.getValue() === "Canopy Height Model (CHM/001)") {
      exportVisParams = getDynamicCHMVisParams(selectedImage1);
      exportVisParams.forceRgbOutput = true;
    } else if (selectCollection1.getValue() === "RGB Camera Photography (RGB/001)") {
      exportVisParams = visParamsRGB;
    } else if (selectCollection1.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
      exportVisParams = getNitrogenVisParams(selectedImage1, 1);
      exportVisParams.forceRgbOutput = true;
    } else {
      exportVisParams = {
        bands: currentVisParams.bands,
        min: 0,
        max: currentVisParams.max,
        gamma: currentVisParams.gamma
      };
    }
    
    print('Using visualization parameters:', exportVisParams);
    print('Export resolution: ' + optimalScale + 'm');
    
    // Create RGB visualization
    var rgbImage = selectedImage1.visualize(exportVisParams);
    
    // Get site info for filename
    var siteCode = neonSiteSelect.getValue() || 'NEON_Site';
    var collectionName = isDerivedExport ? currentDerivedProduct : selectCollection1.getValue().split(' ')[0];
    var timestamp = new Date().toISOString().split('T')[0];
    
   // Determine if this is a crop or full image
    var isCropped = false;
    var filename; // Declare once at the top
    
    // Check if user has drawn a custom geometry
    var drawnLayers = drawingTools.layers();
    print('Checking for drawn layers. Count:', drawnLayers.length());
    
    if (drawnLayers.length() > 0) {
      // User has drawn something, so it's a crop
      isCropped = true;
      print('Crop detected - exporting cropped area');
      var cropSuffix = '_cropped';
      filename = siteCode + '_' + collectionName + '_' + selectedImageName1 + cropSuffix + '_' + optimalScale + 'm_' + timestamp;
      proceedWithExport(rgbImage, exportGeometry, optimalScale, filename, isCropped);
    } else {
      // No custom geometry drawn, full image
      print('No crop detected - exporting full image');
      filename = siteCode + '_' + collectionName + '_' + selectedImageName1 + '_full_' + optimalScale + 'm_' + timestamp;
      proceedWithExport(rgbImage, exportGeometry, optimalScale, filename, false);
    }
  });
  
  // Helper function to complete the export
  function proceedWithExport(rgbImage, geometry, scale, filename, isCropped) {
    var downloadArgs = {
      crs: 'EPSG:4326',
      scale: scale,
      region: geometry,
      filePerBand: false,
      format: 'GEO_TIFF'
    };
    
    rgbImage.getDownloadURL(downloadArgs, function(url) {
      var imageDownloadLink = ui.Label('Click here to download the image', {color: 'blue', textDecoration: 'underline'}, url);
      
      var resolutionMessage = scale === 1 ? 
        'Exported at 1m resolution. Coordinate system: WGS84' : 
        scale < 2 ? 'Exported at ' + scale + 'm resolution. Coordinate system: WGS84' :
        'Auto-scaled to ' + scale + 'm resolution to accommodate image size. Coordinate system: WGS84';
      
      var cropMessage = isCropped ? 'Cropped area exported' : 'Full image exported';
      
      var downloadPanel = ui.Panel({
        widgets: [
          ui.Label('Export ready', {fontWeight: 'bold', color: 'green'}),
          imageDownloadLink,
          //ui.Label(cropMessage, {fontSize: '10px', fontWeight: 'bold', color: 'blue'}),
          ui.Label(resolutionMessage, {fontSize: '10px', fontWeight: 'bold', color: scale === 1 ? 'green' : scale <= 5 ? 'blue' : 'blue'}),
          ui.Label('Original filename: ' + filename, {fontSize: '10px', fontWeight: 'bold', color: 'gray'}),
          ui.Label('Note: Downloaded file will have a system-generated name ending in "_getPixels.tiff"', {fontSize: '10px', fontWeight: 'bold', color: 'gray'})
        ],
        style: {
          position: 'top-center',
          padding: '10px',
          backgroundColor: 'white',
          border: '2px solid green'
        }
      });
      
      var closeButton = ui.Button({
        label: 'Close',
        onClick: function() {
          Map.remove(downloadPanel);
        },
        style: {
          margin: '5px 0 0 0',
          fontSize: '10px'
        }
      });
      
      downloadPanel.add(closeButton);
      Map.add(downloadPanel);
      
      print('Download link generated for: ' + filename);
    });
    
    print('Generating download link for: ' + filename);
    print('Please wait a moment for the download link to appear...');
  }
}

// Create a horizontal panel with a flow layout to center the Title
var TitleHorizontalPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'horizontal'
  }
});

// Create flexible space elements to push the URL link label to the center
var TitleSpacerLeft = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

// Add title 
var title = ui.Label({
  value: 'Display NEON Airborne Images',
  style: {fontSize: '19px', fontWeight: 'bold', color: '4A997E', margin: '0 0 10px 0'}
});

var TitleSpacerRight = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

// Add the spacers and label to the horizontal URL link panel
TitleHorizontalPanel.add(TitleSpacerLeft);
TitleHorizontalPanel.add(title);
TitleHorizontalPanel.add(TitleSpacerRight);

mainPanel.add(TitleHorizontalPanel);

// Add dropdowns for specific image selections to the main panel
mainPanel.add(neonSiteSelect)
      .add(selectCollection1)
      .add(select1)
      .add(selectCollection2)
      .add(select2);
      //.add(exportButton);

// Create a horizontal panel with flow layout to center the first URL link text
var URLhorizontalPanel1 = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'horizontal'
  }
});

// Create a horizontal panel with flow layout to center the second URL link text
var URLhorizontalPanel2 = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'horizontal'
  }
});

// Create a horizontal panel with flow layout to center the third URL link text
var URLhorizontalPanel3 = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    stretch: 'horizontal'
  }
});


// Create flexible space elements to push the URL link label to the center
var URLspacerLeft = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

// Create a label with a hyperlink to the NEON Data Portal URL
var linkLabel = ui.Label({
  value: 'NEON Data Portal', 
  style: {color: 'blue', textDecoration: 'underline', fontSize: '10px', fontWeight: 'bold', },
  targetUrl: 'https://data.neonscience.org/data-products/explore'
});

// Create a label with a hyperlink to the Desktop AOP Data Viewer
var linkLabelDV = ui.Label({
  value: 'Mobile AOP Data Viewer', 
  style: {color: 'blue', textDecoration: 'underline', fontSize: '10px', fontWeight: 'bold', },
  targetUrl: 'https://neon-prod-earthengine.projects.earthengine.app/view/aop-gee-data-viewer---mobile'
});

// Import the QR code GeoTIFF image from our Earth Engine Assets
var qrCodeAsset = ee.Image('projects/neon-prod-earthengine/assets/AOP_mobile_data_viewer_QR_code');

// Generate a thumbnail for the QR code image
var qrCodeThumbnail = ui.Thumbnail({
  image: qrCodeAsset.visualize({min: 0, max: 255}), // Add visualization parameters
  params: {dimensions: 100}, // Thumbnail dimensions
  style: {margin: '0 0 0 0px', border: '0px solid black'} // Optional styling
});

// Create a label with a hyperlink to the PhenoFlight URL
var phenoFlightLinkLabel = ui.Label({
  //value: 'PhenoFlight Peak Greenness App', 
  value: 'Vegetation Phenology During Surveys', 
  style: {color: 'blue', textDecoration: 'underline', fontSize: '10px', fontWeight: 'bold', },
  targetUrl: 'https://phenoflight.neonscience.org/'
});

var URLspacerRight = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

// Add the spacers and label to the horizontal URL link panel
URLhorizontalPanel1.add(URLspacerLeft);
URLhorizontalPanel1.add(linkLabel);
URLhorizontalPanel1.add(phenoFlightLinkLabel);
URLhorizontalPanel1.add(URLspacerRight);

// Create flexible space elements to push the URL link label to the center
var URLspacerLeft2 = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

var URLspacerRight2 = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

URLhorizontalPanel2.add(URLspacerLeft2);
URLhorizontalPanel2.add(qrCodeThumbnail);
URLhorizontalPanel2.add(URLspacerRight2);

// Create flexible space elements to push the Mobile AOP Data Viewer URL link label to the center
var URLspacerLeft3 = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

var URLspacerRight3 = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

URLhorizontalPanel3.add(URLspacerLeft3);
URLhorizontalPanel3.add(linkLabelDV);
URLhorizontalPanel3.add(URLspacerRight3);

// Create a new panel for ancillary layers that will be positioned at the top right of the map
var rightPanel = ui.Panel({
  style: {
    width: '210px',
    padding: '10px',
    position: 'top-right'
  }
});

// Create a title for top right panel
var rightPanelTitle = ui.Label({
  value: 'Display Ancillary Layers', 
  style: {color: '4A997E', fontSize: '16px', fontWeight: 'bold', },
});

rightPanel.add(rightPanelTitle);

Map.add(rightPanel);

// Define the checkbox for the TOS boundary

var checkboxList = {
  'NEON Tower': ui.Checkbox({
    label: 'NEON Tower',
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'},
    value: false,
    onChange: function(checked) {
      displayTowers(checked);
    }
  }),
  'NEON Airshed': ui.Checkbox({
    label: 'NEON Airshed',
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'},
    value: false,
    onChange: function(checked) {
      displayAirsheds(checked);
    }
  }),
  'Terrestrial Sampling Boundaries': ui.Checkbox({
    label: 'NEON Terrestrial Sampling Boundary',
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'},
    value: false,
    onChange: function(checked) {
      displayTerrestrialBoundaries(checked);
    }
  }),
  'Terrestrial Sampling Plots': ui.Checkbox({
    label: 'NEON Terrestrial Sampling Plots',
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'},
    value: false,
    onChange: function(checked) {
      displayTerrestrialPlots(checked);
    }
  }),
  // Insert NEON AOP Flight Box after Terrestrial Sampling Plots
  'NEON AOP Flight Box': ui.Checkbox({
    label: 'NEON AOP Flight Box',
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'},
    value: false,
    onChange: function(checked) {
      displayFlightboxBoundaries(checked);
    }
  })
};

// Add checkboxes to the right panel using Object.keys and manually iterate over the keys of the object to access the values
// Add checkboxes in the desired order
rightPanel.add(checkboxList['NEON Tower']);
rightPanel.add(checkboxList['NEON Airshed']);
rightPanel.add(checkboxList['Terrestrial Sampling Boundaries']);
rightPanel.add(checkboxList['Terrestrial Sampling Plots']);
rightPanel.add(checkboxList['NEON AOP Flight Box']);
var currentBoundaryLayer = null; // Global variable to hold the current layer
var currentPlotsLayer = null;
var currentTowerLayer = null;
var currentAirshedLayer = null;
var currentFlightboxLayer = null;
var polyStyle = {
  color: 'cyan', // Outline color
  fillColor: "#00000000" // Transparent fill
};
var plotsStyle = {
  color: 'yellow', 
  fillColor: "#00000000" 
};
var flightboxStyle = {
  color: 'orange',
  fillColor: '#00000000',
  width: 2
};
// Function to display NEON AOP Flight Box boundaries
function displayFlightboxBoundaries(checked) {
  if (currentFlightboxLayer) {
    Map.remove(currentFlightboxLayer);
    currentFlightboxLayer = null;
  }
  // Only show if both site and 1st image collection are selected
  var selectedSite = neonSiteSelect.getValue();
  var selectedCollection = selectCollection1.getValue();
  if (checked && selectedSite && selectedCollection) {
    // Filter flightboxes by selected site using 'Site' field
    var filteredFeatures = neonFlightboxBoundaries.filter(ee.Filter.eq('Site', selectedSite));
    var styledFeatures = filteredFeatures.style(flightboxStyle);
    currentFlightboxLayer = ui.Map.Layer(styledFeatures, {}, 'NEON AOP Flight Box');
    Map.add(currentFlightboxLayer);
  }
}
var towerStyle = {
  color: 'yellow', 
  fillColor: 'red',
  pointSize: 5
};
var airshedStyle = {
  color: 'white', 
  //fillColor: 'gray',
  fillColor: '#80808080'  // gray with 50% opacity (80 = 128/255)
};

function displayTerrestrialBoundaries(checked) {
  if (currentBoundaryLayer) {
    Map.remove(currentBoundaryLayer); // Remove the current layer
    currentBoundaryLayer = null;
  }
  if (checked) {
    var selectedSite = neonSiteSelect.getValue();
    var filteredFeatures = terrestrialSamplingBoundaries.filter(ee.Filter.eq('siteID', selectedSite));
    var styledFeatures = filteredFeatures.style(polyStyle); // Apply the style
    currentBoundaryLayer = ui.Map.Layer(styledFeatures, {}, 'Terrestrial Sampling Boundary');
    Map.add(currentBoundaryLayer); // Add the new layer
  }
}

function displayTowers(checked) {
  if (currentTowerLayer) {
    Map.remove(currentTowerLayer); // Remove the current layer
    currentTowerLayer = null;
  }
  if (checked) {
    var selectedSite = neonSiteSelect.getValue();
    var filteredFeatures = towers.filter(ee.Filter.eq('siteID', selectedSite));
    var styledFeatures = filteredFeatures.style(towerStyle); // Apply the style
    currentTowerLayer = ui.Map.Layer(styledFeatures, {}, 'NEON Tower');
    Map.add(currentTowerLayer); // Add the new layer
  }
}

function displayAirsheds(checked) {
  if (currentAirshedLayer) {
    Map.remove(currentAirshedLayer); // Remove the current layer
    currentAirshedLayer = null;
  }
  if (checked) {
    var selectedSite = neonSiteSelect.getValue();
    var filteredFeatures = airsheds.filter(ee.Filter.eq('SiteID', selectedSite));
    var styledFeatures = filteredFeatures.style(airshedStyle); // Apply the style
    currentAirshedLayer = ui.Map.Layer(styledFeatures, {}, 'NEON Airshed');
    Map.add(currentAirshedLayer); // Add the new layer
  }
}

// Create a legend panel
var legendPanel = ui.Panel({
  style: {
    width: '120px',
    padding: '10px',
    position: 'bottom-center',
    shown: false 
  }
});

// Function to create the legend items
function createLegend() {
  legendPanel.clear();
  legendPanel.add(ui.Label({
    value: 'Terrestrial Plot Types',
    style: {fontSize: '14px', fontWeight: 'bold', margin: '0 0 10px 0'}
  }));
  
  var subtypeColors = {
    basePlot: 'blue',
    birdGrid: 'green',
    mammalGrid: 'orange',
    mosquitoPoint: 'purple',
    phenology: 'red',
    tickPlot: 'brown'
  };

  Object.keys(subtypeColors).forEach(function(subtype) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: subtypeColors[subtype],
        padding: '8px',
        margin: '0 8px 0 0'
      }
    });

    var label = ui.Label({
      value: subtype,
      style: {margin: '0 0 8px 0', fontSize: '10px', fontWeight: 'bold'}
    });

    var legendItem = ui.Panel({
      widgets: [colorBox, label],
      layout: ui.Panel.Layout.Flow('horizontal')
    });

    legendPanel.add(legendItem);
  });
}

// Function to toggle terrestrial plots and the legend
function displayTerrestrialPlots(checked) {
  if (currentPlotsLayer) {
    Map.remove(currentPlotsLayer);
    currentPlotsLayer = null;
  }
  if (checked) {
    var selectedSite = neonSiteSelect.getValue();
    var filteredFeatures = TOSplots.filter(ee.Filter.eq('siteID', selectedSite));

    // Define a color mapping for the subtypes
    var subtypeColors = ee.Dictionary({
      basePlot: 'blue',
      birdGrid: 'green',
      mammalGrid: 'orange',
      mosquitoPoint: 'purple',
      phenology: 'red',
      tickPlot: 'brown'
    });

    // Style features dynamically based on the "subtype" attribute
    var styledFeatures = filteredFeatures.map(function(feature) {
      var subtype = feature.get('subtype'); // Retrieve subtype
      var color = subtypeColors.get(subtype, 'gray'); // Get color, default to 'gray'
      return feature.set('style', {color: color, fillColor: '#00000000'});
    });

    styledFeatures = styledFeatures.style({
      styleProperty: 'style'
    });

    currentPlotsLayer = ui.Map.Layer(styledFeatures, {}, 'Terrestrial Sampling Plots');
    Map.add(currentPlotsLayer);

    // Show and populate the legend
    createLegend();
    legendPanel.style().set('shown', true);
  } else {
    // Hide the legend when unchecked
    legendPanel.style().set('shown', false);
  }
}

// Add the legend panel to the map
Map.add(legendPanel);

// ----------------------------
// Nitrogen Classification Legend
// ----------------------------

// Create nitrogen classification legend panel
var nitrogenClassLegendPanel = ui.Panel({
  style: {
    width: '180px',
    padding: '10px',
    position: 'bottom-left',
    shown: false,
    backgroundColor: 'white'
  }
});

// Function to create the nitrogen classification legend
function createNitrogenClassLegend() {
  nitrogenClassLegendPanel.clear();
  
  nitrogenClassLegendPanel.add(ui.Label({
    value: 'Vegetation Classification',
    style: {fontSize: '13px', fontWeight: 'bold', margin: '0 0 8px 0'}
  }));
  
  var classInfo = [
    {color: 'olive', name: 'Needle Leaf'},
    {color: 'green', name: 'Non-Needle Leaf'}
  ];
  
  classInfo.forEach(function(item) {
    var colorBox = ui.Label({
      style: {
        backgroundColor: item.color,
        padding: '8px',
        margin: '0 8px 0 0',
        border: '0.5px solid grey'
      }
    });
    
    var label = ui.Label({
      value: item.name,
      style: {margin: '0 0 6px 0', fontSize: '11px'}
    });
    
    var legendItem = ui.Panel({
      widgets: [colorBox, label],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
    
    nitrogenClassLegendPanel.add(legendItem);
  });
}

// Function to manage nitrogen classification legend visibility
function updateNitrogenClassLegendVisibility() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  
  // Show legend only if CNC collection is selected AND classification band is chosen in either selector
  var isCNCSelected = (collection1 && String(collection1).indexOf('CNC/002') !== -1) || 
                      (collection2 && String(collection2).indexOf('CNC/002') !== -1);
  var isClassificationBand = currentNitrogenBand1 === 'Needle Leaf/Non-Needle Leaf Classification' ||
                             currentNitrogenBand2 === 'Needle Leaf/Non-Needle Leaf Classification';
  
  if (isCNCSelected && isClassificationBand) {
    createNitrogenClassLegend();
    nitrogenClassLegendPanel.style().set('shown', true);
  } else {
    nitrogenClassLegendPanel.style().set('shown', false);
  }
}

// Add the nitrogen classification legend panel to the map
Map.add(nitrogenClassLegendPanel);

// ----------------------------
// Nitrogen Continuous Legends (Percent N and Uncertainty)
// ----------------------------

// Helper function to create color bar for continuous legends
function makeColorBarParams(palette) {
  return {
    bbox: [0, 0, 1, 0.1],
    dimensions: '200x10',
    format: 'png',
    min: 0,
    max: 1,
    palette: palette,
  };
}

// Create Percent Nitrogen legend
var percentNPalette = ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725'];
var percentNColorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0),
  params: makeColorBarParams(percentNPalette),
  style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
});

// Create label references so we can update them
var percentNMinLabel = ui.Label('...', {margin: '4px 8px'});
var percentNMaxLabel = ui.Label('...', {margin: '4px 8px', textAlign: 'right', stretch: 'horizontal'});

var percentNLegendLabels = ui.Panel({
  widgets: [percentNMinLabel, percentNMaxLabel],
  layout: ui.Panel.Layout.flow('horizontal')
});
var percentNLegendTitle = ui.Label({
  value: 'Percent Nitrogen',
  style: {
    fontWeight: 'bold',
    fontSize: '13px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '0 0 8px 0'
  }
});
var percentNLegendPanel = ui.Panel({
  widgets: [percentNLegendTitle, percentNColorBar, percentNLegendLabels],
  style: {
    width: '250px',
    padding: '10px',
    position: 'bottom-left',
    shown: false,
    backgroundColor: 'white'
  }
});

// Create Uncertainty legend
var uncertaintyPalette = ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'];
var uncertaintyColorBar = ui.Thumbnail({
  image: ee.Image.pixelLonLat().select(0),
  params: makeColorBarParams(uncertaintyPalette),
  style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'},
});

// Create label references so we can update them  
var uncertaintyMinLabel = ui.Label('...', {margin: '4px 8px'});
var uncertaintyMaxLabel = ui.Label('...', {margin: '4px 8px', textAlign: 'right', stretch: 'horizontal'});

var uncertaintyLegendLabels = ui.Panel({
  widgets: [uncertaintyMinLabel, uncertaintyMaxLabel],
  layout: ui.Panel.Layout.flow('horizontal')
});
var uncertaintyLegendTitle = ui.Label({
  value: 'Canopy Nitrogen Model Uncertainty',
  style: {
    fontWeight: 'bold',
    fontSize: '13px',
    textAlign: 'center',
    stretch: 'horizontal',
    margin: '0 0 8px 0'
  }
});
var uncertaintyLegendPanel = ui.Panel({
  widgets: [uncertaintyLegendTitle, uncertaintyColorBar, uncertaintyLegendLabels],
  style: {
    width: '250px',
    padding: '10px',
    position: 'bottom-left',
    shown: false,
    backgroundColor: 'white'
  }
});

// Add the nitrogen continuous legend panels to the map
Map.add(percentNLegendPanel);
Map.add(uncertaintyLegendPanel);

// ----------------------------
// Derived Indices/Terrain Products Legend
// ----------------------------

// Unit suffixes and decimal places for each derived product
var DERIVED_LEGEND_META = {
  NDVI:      {unit: '',  decimals: 2},
  EVI:       {unit: '',  decimals: 2},
  ARVI:      {unit: '',  decimals: 2},
  PRI:       {unit: '',  decimals: 3},
  SAVI:      {unit: '',  decimals: 2},
  Slope:     {unit: '\u00b0', decimals: 0},  // °
  Aspect:    {unit: '\u00b0', decimals: 0},
  Hillshade: {unit: '',  decimals: 0}
};

var derivedLegendPanel = ui.Panel({
  style: {
    width: '250px',
    padding: '10px',
    position: 'bottom-left',
    shown: false,
    backgroundColor: 'white'
  }
});
Map.add(derivedLegendPanel);

function createDerivedLegend(productName) {
  derivedLegendPanel.clear();
  var vis = DERIVED_VIS[productName];
  var meta = DERIVED_LEGEND_META[productName];

  derivedLegendPanel.add(ui.Label({
    value: productName,
    style: {fontWeight: 'bold', fontSize: '13px', textAlign: 'center',
            stretch: 'horizontal', margin: '0 0 8px 0'}
  }));

  derivedLegendPanel.add(ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: makeColorBarParams(vis.palette),
    style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'}
  }));

  var fmt = function(val) {
    return val.toFixed(meta.decimals) + meta.unit;
  };
  derivedLegendPanel.add(ui.Panel({
    widgets: [
      ui.Label(fmt(vis.min), {margin: '4px 8px'}),
      ui.Label(fmt(vis.max), {margin: '4px 8px', textAlign: 'right', stretch: 'horizontal'})
    ],
    layout: ui.Panel.Layout.flow('horizontal')
  }));

  derivedLegendPanel.style().set('shown', true);
}

function updateDerivedLegendVisibility() {
  var c1 = selectCollection1.getValue();
  var c2 = selectCollection2.getValue();
  var showDerived = (c1 && String(c1).indexOf('Derived Indices') !== -1) ||
                   (c2 && String(c2).indexOf('Derived Indices') !== -1);
  if (showDerived) {
    createDerivedLegend(currentDerivedProduct);
  } else {
    derivedLegendPanel.style().set('shown', false);
  }
}

// Function to manage nitrogen continuous legend visibility
function updateNitrogenContinuousLegendsVisibility() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  var isCNC1 = collection1 && String(collection1).indexOf('CNC/002') !== -1;
  var isCNC2 = collection2 && String(collection2).indexOf('CNC/002') !== -1;
  
  // Determine which bands are being displayed
  var showPercentN = false;
  var showUncertainty = false;
  
  if (isCNC1 && isCNC2) {
    // Both are CNC - check both selectors
    showPercentN = currentNitrogenBand1 === 'Percent Nitrogen (%)' || currentNitrogenBand2 === 'Percent Nitrogen (%)';
    showUncertainty = currentNitrogenBand1 === 'Canopy Nitrogen Model Uncertainty' || currentNitrogenBand2 === 'Canopy Nitrogen Model Uncertainty';
  } else if (isCNC1 || isCNC2) {
    // Only one is CNC - use only currentNitrogenBand1 (the single visible selector)
    showPercentN = currentNitrogenBand1 === 'Percent Nitrogen (%)';
    showUncertainty = currentNitrogenBand1 === 'Canopy Nitrogen Model Uncertainty';
  }
  // If neither is CNC, both remain false
  
  percentNLegendPanel.style().set('shown', showPercentN);
  uncertaintyLegendPanel.style().set('shown', showUncertainty);
  
  // Update legend labels with current values
  if (showPercentN) {
    updateNitrogenLegendLabels();
  }
  if (showUncertainty) {
    updateUncertaintyLegendLabels();
  }
}

// Function to update nitrogen legend labels with actual min/max values
function updateNitrogenLegendLabels() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  var isCNC1 = collection1 && String(collection1).indexOf('CNC/002') !== -1;
  var isCNC2 = collection2 && String(collection2).indexOf('CNC/002') !== -1;
  
  // Determine which image(s) are showing Percent Nitrogen
  var showingPercentN1 = false;
  var showingPercentN2 = false;
  
  if (isCNC1 && isCNC2) {
    showingPercentN1 = currentNitrogenBand1 === 'Percent Nitrogen (%)';
    showingPercentN2 = currentNitrogenBand2 === 'Percent Nitrogen (%)';
  } else if (isCNC1) {
    showingPercentN1 = currentNitrogenBand1 === 'Percent Nitrogen (%)';
  } else if (isCNC2) {
    showingPercentN2 = currentNitrogenBand1 === 'Percent Nitrogen (%)';
  }
  
  // Use the range from whichever image(s) are displaying
  var minVal, maxVal;
  var hasActualValues = false;
  
  if (showingPercentN1 && showingPercentN2) {
    // Both showing - use the combined range
    minVal = Math.min(nitrogenMinMax.image1.min, nitrogenMinMax.image2.min);
    maxVal = Math.max(nitrogenMinMax.image1.max, nitrogenMinMax.image2.max);
    // Check if these are actual calculated values (not defaults)
    hasActualValues = !(nitrogenMinMax.image1.min === 0 && nitrogenMinMax.image1.max === 4);
  } else if (showingPercentN1) {
    minVal = nitrogenMinMax.image1.min;
    maxVal = nitrogenMinMax.image1.max;
    hasActualValues = !(minVal === 0 && maxVal === 4);
  } else if (showingPercentN2) {
    minVal = nitrogenMinMax.image2.min;
    maxVal = nitrogenMinMax.image2.max;
    hasActualValues = !(minVal === 0 && maxVal === 4);
  } else {
    minVal = 0;
    maxVal = 4;
  }
  
  // Only update labels if we have actual calculated values
  if (hasActualValues) {
    percentNMinLabel.setValue(minVal.toFixed(1) + '%');
    percentNMaxLabel.setValue(maxVal.toFixed(1) + '%');
  }
}

// Function to update uncertainty legend labels with actual min/max values
function updateUncertaintyLegendLabels() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  var isCNC1 = collection1 && String(collection1).indexOf('CNC/002') !== -1;
  var isCNC2 = collection2 && String(collection2).indexOf('CNC/002') !== -1;
  
  // Determine which image(s) are showing Uncertainty
  var showingUncertainty1 = false;
  var showingUncertainty2 = false;
  
  if (isCNC1 && isCNC2) {
    showingUncertainty1 = currentNitrogenBand1 === 'Canopy Nitrogen Model Uncertainty';
    showingUncertainty2 = currentNitrogenBand2 === 'Canopy Nitrogen Model Uncertainty';
  } else if (isCNC1) {
    showingUncertainty1 = currentNitrogenBand1 === 'Canopy Nitrogen Model Uncertainty';
  } else if (isCNC2) {
    showingUncertainty2 = currentNitrogenBand1 === 'Canopy Nitrogen Model Uncertainty';
  }
  
  // Use the range from whichever image(s) are displaying
  var minVal, maxVal;
  var hasActualValues = false;
  
  if (showingUncertainty1 && showingUncertainty2) {
    // Both showing - use the combined range
    minVal = Math.min(uncertaintyMinMax.image1.min, uncertaintyMinMax.image2.min);
    maxVal = Math.max(uncertaintyMinMax.image1.max, uncertaintyMinMax.image2.max);
    // Check if these are actual calculated values (not defaults)
    hasActualValues = !(uncertaintyMinMax.image1.min === 0 && uncertaintyMinMax.image1.max === 1);
  } else if (showingUncertainty1) {
    minVal = uncertaintyMinMax.image1.min;
    maxVal = uncertaintyMinMax.image1.max;
    hasActualValues = !(minVal === 0 && maxVal === 1);
  } else if (showingUncertainty2) {
    minVal = uncertaintyMinMax.image2.min;
    maxVal = uncertaintyMinMax.image2.max;
    hasActualValues = !(minVal === 0 && maxVal === 1);
  } else {
    minVal = 0;
    maxVal = 1;
  }
  
  // Only update labels if we have actual calculated values
  if (hasActualValues) {
    uncertaintyMinLabel.setValue(minVal.toFixed(2) + '%');
    uncertaintyMaxLabel.setValue(maxVal.toFixed(2) + '%');
  }
}

// Define the checkbox for NLCD Landcover toggle
var nlcdCheckbox = ui.Checkbox({
  label: 'NLCD Landcover',
  value: false, // Initially unchecked
  onChange: function(checked) {
    nlcdLayer.setShown(checked);
  },
  style: {color: 'black', fontSize: '11px', fontWeight: 'bold'}//, width: '100%', margin: '10px 0'}
});

// Add the checkbox to the right panel
rightPanel.add(nlcdCheckbox);

// ----------------------------
// Visualization Parameters and Cloud Filter
// ----------------------------

var visParamsOptions = {
  'Natural Color Composite (B053, B035, B019)': {
    bands: ['B053', 'B035', 'B019'],
    min: 103,
    max: 1160,
    gamma: 1.0
  },
  'False Color Composite (B094, B253, B052)': {
    bands: ['B094', 'B253', 'B052'],
    min: 503,
    max: 4060,
    gamma: 1.0
  }
};

// Add custom band selection option
visParamsOptions['Custom Band Selection'] = {
  bands: ['B191', 'B074', 'B070'], // Default to a sensible combination
  min: 100,
  max: 4000,
  gamma: 1.0
};

// Create dropdowns for custom band selection
var redBandSelect = ui.Select({
  items: Array.apply(null, {length: 426}).map(function(_, i) {
    var bandNumber = (i + 1).toString(); // Convert index to string
    while (bandNumber.length < 3) bandNumber = '0' + bandNumber; // Pad with zeros
    return 'B' + bandNumber; // Generate B001 to B426
  }),
  placeholder: 'Select Red Band',
  value: 'B191', // Default Red band
  onChange: updateCustomBands,
  style: {width: '30%', margin: '10px 1%'}
});

var greenBandSelect = ui.Select({
  items: Array.apply(null, {length: 426}).map(function(_, i) {
    var bandNumber = (i + 1).toString(); // Convert index to string
    while (bandNumber.length < 3) bandNumber = '0' + bandNumber; // Pad with zeros
    return 'B' + bandNumber; // Generate B001 to B426
  }),
  placeholder: 'Select Green Band',
  value: 'B074', // Default Green band
  onChange: updateCustomBands,
  style: {width: '30%', margin: '10px 1%'}
});

var blueBandSelect = ui.Select({
  items: Array.apply(null, {length: 426}).map(function(_, i) {
    var bandNumber = (i + 1).toString(); // Convert index to string
    while (bandNumber.length < 3) bandNumber = '0' + bandNumber; // Pad with zeros
    return 'B' + bandNumber; // Generate B001 to B426
  }),
  placeholder: 'Select Blue Band',
  value: 'B070', // Default Blue band
  onChange: updateCustomBands,
  style: {width: '30%', margin: '10px 1%'}
});

// Add band selectors to the main panel
var customBandsPanel = ui.Panel({
  widgets: [redBandSelect, greenBandSelect, blueBandSelect],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {width: '100%', margin: '10px 0'}
});

// Default visualization parameters for SDR and BRDF images
var currentVisParams = visParamsOptions['Natural Color Composite (B053, B035, B019)']; // Default visualization

// Default visualization for RGB collection
var visParamsRGB = {bands: ['R', 'G', 'B'], min: 40, max: 200, gamma: 0.65};

// Default visualization for Canopy Nitrogen Concentration collection
var visParamsNitrogen = {bands: ['nitrogen'], min: 0, max: 4, palette: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725']};

function updateCustomBands() {
  currentVisParams = {
    bands: [
      redBandSelect.getValue(),
      greenBandSelect.getValue(),
      blueBandSelect.getValue()
    ],
    min: 150, // Adjust based on actual data
    max: 3500, // Adjust based on actual data
    gamma: 1.0
  };

  // Log selected bands and visualization parameters for debugging
  print('Custom Bands:', currentVisParams.bands);
  print('Visualization Params:', currentVisParams);

  // Trigger map update with the new visualization parameters
  updateMap(select1.getValue(), select2.getValue(), currentVisParams);
}

// ----------------------------
// Nitrogen Band Options Panel (Dynamic)
// ----------------------------

// Track currently selected nitrogen bands globally
var currentNitrogenBand1 = 'Percent Nitrogen (%)';
var currentNitrogenBand2 = 'Canopy Nitrogen Model Uncertainty';

// Global storage for nitrogen min/max values for legend updates
var nitrogenMinMax = {
  image1: {min: 0, max: 4},
  image2: {min: 0, max: 4}
};
var uncertaintyMinMax = {
  image1: {min: 0, max: 1},
  image2: {min: 0, max: 1}
};

// Function to toggle second nitrogen band selector visibility
function updateNitrogenSelector2Visibility() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  
  // Check which images are CNC collections
  var image1IsCNC = collection1 && String(collection1).indexOf('CNC/002') !== -1;
  var image2IsCNC = collection2 && String(collection2).indexOf('CNC/002') !== -1;
  var bothAreCNC = image1IsCNC && image2IsCNC;
  
  // Update label text based on which image is CNC
  if (bothAreCNC) {
    // Both are CNC: show "1st Image:" for first selector, "2nd Image:" for second
    nitrogenBandLabel1.setValue('1st Image:');
    nitrogenBandLabel2.setValue('2nd Image:');
    nitrogenBandLabel2.style().set('shown', true);
    nitrogenBandSelect2.style().set('shown', true);
  } else if (image1IsCNC && !image2IsCNC) {
    // Only Image 1 is CNC: show "1st Image:" for first selector
    nitrogenBandLabel1.setValue('1st Image:');
    nitrogenBandLabel2.style().set('shown', false);
    nitrogenBandSelect2.style().set('shown', false);
  } else if (!image1IsCNC && image2IsCNC) {
    // Only Image 2 is CNC: show "2nd Image:" for first selector
    nitrogenBandLabel1.setValue('2nd Image:');
    nitrogenBandLabel2.style().set('shown', false);
    nitrogenBandSelect2.style().set('shown', false);
  } else {
    // Neither is CNC: hide second selector
    nitrogenBandLabel2.style().set('shown', false);
    nitrogenBandSelect2.style().set('shown', false);
  }
  
  // Reset second selector to default when hidden
  if (!bothAreCNC) {
    currentNitrogenBand2 = 'Canopy Nitrogen Model Uncertainty';
    nitrogenBandSelect2.setValue('Canopy Nitrogen Model Uncertainty', false); // false = don't trigger onChange
  }
}

// Create label for Image 1 nitrogen selector
var nitrogenBandLabel1 = ui.Label({
  value: '1st Image:',
  style: {fontStyle: 'italic', fontSize: '10px', color: '#666666', margin: '5px 0 2px 0'}
});

// Create nitrogen band selector dropdown for Image 1
var nitrogenBandSelect1 = ui.Select({
  items: [
    'Percent Nitrogen (%)',
    'Canopy Nitrogen Model Uncertainty',
    'Needle Leaf/Non-Needle Leaf Classification'
  ],
  placeholder: 'Select nitrogen band',
  value: 'Percent Nitrogen (%)',
  onChange: function(selectedOption) {
    currentNitrogenBand1 = selectedOption; // Update global tracker
    updateNitrogenSelector2Visibility();
    updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    updateNitrogenClassLegendVisibility();
    updateNitrogenContinuousLegendsVisibility();
  },
  style: {width: '100%', margin: '10px 0'}
});

// Create label for Image 2 nitrogen selector (initially hidden)
var nitrogenBandLabel2 = ui.Label({
  value: '2nd Image:',
  style: {fontStyle: 'italic', fontSize: '10px', color: '#666666', margin: '5px 0 2px 0', shown: false}
});

// Create nitrogen band selector dropdown for Image 2 (initially hidden)
var nitrogenBandSelect2 = ui.Select({
  items: [
    'Percent Nitrogen (%)',
    'Canopy Nitrogen Model Uncertainty',
    'Needle Leaf/Non-Needle Leaf Classification'
  ],
  placeholder: 'Select nitrogen band',
  value: 'Canopy Nitrogen Model Uncertainty',
  onChange: function(selectedOption) {
    currentNitrogenBand2 = selectedOption; // Update global tracker
    updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    updateNitrogenClassLegendVisibility();
    updateNitrogenContinuousLegendsVisibility();
  },
  style: {width: '100%', margin: '10px 0', shown: false}
});

// Create nitrogen options panel (initially hidden)
var nitrogenOptionsPanel = ui.Panel({
  widgets: [
    ui.Panel([
      ui.Label({
        value: '_______________________________________________',
        style: {fontWeight: 'bold', color: '4A997E'}
      })
    ]),
    ui.Panel({
      widgets: [
        ui.Panel([
          ui.Label({
            value: ' ',
            style: {stretch: 'horizontal'}
          }),
          ui.Panel([
            ui.Label({
              value: 'Nitrogen Band Selection',
              style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
            })
          ]),
          ui.Label({
            value: ' ',
            style: {stretch: 'horizontal'}
          })
        ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
      ]
    }),
    nitrogenBandLabel1,
    nitrogenBandSelect1,
    nitrogenBandLabel2,
    nitrogenBandSelect2
  ],
  style: {shown: false, width: '100%'}
});

mainPanel.add(nitrogenOptionsPanel);

// ----------------------------
// Derived Indices/Terrain Products Panel (Dynamic)
// Appears only when "Derived Indices/Terrain Products" collection is selected.
// Radio-button behavior simulated with mutually exclusive checkboxes.
// ----------------------------

var currentDerivedProduct = 'NDVI';  // Default selection
var derivedCheckboxes = {};          // Registry for mutual-exclusion logic

// Factory function — creates one checkbox and registers it in derivedCheckboxes.
// Must be defined before the column panels that call it via .map().
function makeDerivedCheckbox(productName) {
  var cb = ui.Checkbox({
    label: productName,
    value: productName === 'NDVI',   // NDVI pre-selected by default
    onChange: function(checked) {
      if (checked) {
        // Update state and deselect all others (false = don't fire their onChange)
        currentDerivedProduct = productName;
        Object.keys(derivedCheckboxes).forEach(function(key) {
          if (key !== productName) {
            derivedCheckboxes[key].setValue(false, false);
          }
        });
        updateMap(select1.getValue(), select2.getValue(), currentVisParams);
      } else {
        // Prevent the user from unchecking the active selection
        derivedCheckboxes[productName].setValue(true, false);
      }
    },
    style: {fontSize: '11px', fontWeight: 'bold', color: 'black', margin: '2px 0'}
  });
  derivedCheckboxes[productName] = cb;
  return cb;
}

var viProductNames   = ['NDVI', 'EVI', 'ARVI', 'PRI', 'SAVI'];
var topoProductNames = ['Slope', 'Aspect', 'Hillshade'];

// Left column: Vegetation Indices
var derivedViColumn = ui.Panel({
  widgets: [
    ui.Label({value: 'Vegetation Indices',
              style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0'}})
  ].concat(viProductNames.map(makeDerivedCheckbox)),
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '50%'}
});

// Right column: Terrain Products
var derivedTopoColumn = ui.Panel({
  widgets: [
    ui.Label({value: 'Terrain',
              style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0'}})
  ].concat(topoProductNames.map(makeDerivedCheckbox)),
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '50%'}
});

var derivedOptionsPanel = ui.Panel({
  widgets: [
    ui.Panel([
      ui.Label({
        value: '_______________________________________________',
        style: {fontWeight: 'bold', color: '4A997E'}
      })
    ]),
    ui.Panel({
      widgets: [
        ui.Panel([
          ui.Label({value: ' ', style: {stretch: 'horizontal'}}),
          ui.Panel([
            ui.Label({
              value: 'Derived Indices/Terrain Products',
              style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
            })
          ]),
          ui.Label({value: ' ', style: {stretch: 'horizontal'}})
        ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
      ]
    }),
    ui.Panel({
      widgets: [derivedViColumn, derivedTopoColumn],
      layout: ui.Panel.Layout.flow('horizontal'),
      style: {width: '100%'}
    })
  ],
  style: {shown: false, width: '100%'}
});

mainPanel.add(derivedOptionsPanel);

// ----------------------------
// Reflectance Image Filters Panel (Dynamic)
// ----------------------------

// Dropdown for visualization parameters
var visParamsSelect = ui.Select({
  items: Object.keys(visParamsOptions),
  placeholder: 'Select band combination',
  value: 'Natural Color Composite (B053, B035, B019)',
  onChange: function(selectedOption) {
    currentVisParams = visParamsOptions[selectedOption];

    // Show or hide custom band selectors based on selection
    customBandsPanel.style().set('shown', selectedOption === 'Custom Band Selection');

    updateMap(select1.getValue(), select2.getValue(), currentVisParams);
  },
  style: {width: '100%', margin: '10px 0'}
});

// Dropdown for cloud cover filter
var cloudFilterOptions = ['All Cloud Conditions', '< 10% Cloud Cover'];
var cloudFilterSelect = ui.Select({
  items: cloudFilterOptions,
  placeholder: 'Select cloud filter',
  value: 'All Cloud Conditions',
  onChange: function(selectedOption) {
    updateMap(select1.getValue(), select2.getValue(), currentVisParams);
  },
  style: {width: '100%', margin: '10px 0'}
});

// Hide the custom bands panel by default
customBandsPanel.style().set('shown', false);

// Create reflectance filters panel (initially hidden)
var reflectanceFiltersPanel = ui.Panel({
  widgets: [
    ui.Panel([
      ui.Label({
        value: '_______________________________________________',
        style: {fontWeight: 'bold', color: '4A997E'}
      })
    ]),
    ui.Panel({
      widgets: [
        ui.Panel([
          ui.Label({
            value: ' ',
            style: {stretch: 'horizontal'}
          }),
          ui.Panel([
            ui.Label({
              value: 'Reflectance Image Filters',
              style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
            })
          ]),
          ui.Label({
            value: ' ',
            style: {stretch: 'horizontal'}
          })
        ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
      ]
    }),
    visParamsSelect,
    customBandsPanel,
    cloudFilterSelect
  ],
  style: {shown: false, width: '100%'}
});

mainPanel.add(reflectanceFiltersPanel);

// Function to update filter panel visibility based on selected collections
function updateFilterPanelVisibility() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  
  // Helper: true only for the two spectrometer reflectance collections (not derived products,
  // which also contains "HSI_REFL" in the name but uses a separate panel)
  var isSpecRefl = function(col) {
    return col === 'Spectrometer Directional Reflectance (HSI_REFL/001)' ||
           col === 'Spectrometer Bidirectional Reflectance (HSI_REFL/002)';
  };
  
  // Show reflectance filters only for actual spectrometer reflectance collections
  var showReflectance = (collection1 && isSpecRefl(collection1)) || 
                        (collection2 && isSpecRefl(collection2));
  reflectanceFiltersPanel.style().set('shown', showReflectance);
  
  // Show nitrogen options if either image is CNC
  var showNitrogen = (collection1 && String(collection1).indexOf('CNC/002') !== -1) || 
                     (collection2 && String(collection2).indexOf('CNC/002') !== -1);
  nitrogenOptionsPanel.style().set('shown', showNitrogen);
  
  // Show derived indices/terrain panel when derived products collection is selected
  var showDerived = (collection1 && String(collection1).indexOf('Derived Indices') !== -1) ||
                    (collection2 && String(collection2).indexOf('Derived Indices') !== -1);
  derivedOptionsPanel.style().set('shown', showDerived);
  
  // Update nitrogen selector 2 visibility (only when both are CNC)
  updateNitrogenSelector2Visibility();
  
  // Update nitrogen classification legend visibility
  updateNitrogenClassLegendVisibility();
  
  // Update nitrogen continuous legends visibility
  updateNitrogenContinuousLegendsVisibility();

  // Update derived indices/terrain legend visibility
  updateDerivedLegendVisibility();
}

//This creates another panel to house a line separator and instructions for the user
var metaTitle = ui.Panel([
  ui.Label({
    //value: '--------------Image Metadata--------------',
    value: '_______________________________________________',
    style: {fontWeight: 'bold',  color: '4A997E'},
  }),
  // ui.Label({
  //   //value:'Image Metadata',
  //   value:'',
  //   style: {fontSize: '12px', fontWeight: 'bold'}
  //})]);
  ]);

mainPanel.add(metaTitle)
          .add(exportButton)
          .add(exportPanel)
          .add(sampleScriptButton);

var metadataPanel = ui.Panel({
  style: {width: '100%', padding: '8px', border: '1px solid #ccc', margin: '10px 0'}
});
mainPanel.add(metadataPanel);

// Add the horizontal panel with NEON Data Portal URL link to the main panel
mainPanel.add(URLhorizontalPanel1);

// Add the horizontal panel with PhenoFlight URL link to the main panel
mainPanel.add(URLhorizontalPanel3);

// Add the horizontal panel with MobileAOP Data Viewer URL link and QR code to the main panel
mainPanel.add(URLhorizontalPanel2);

// ----------------------------
// Add Spectral Curve Chart Functionality
// ----------------------------

// Create the title label for map
var chartTitle1 = ui.Label('AOP Earth Engine Data Viewer', {
  position: 'top-center',
  border: '1px solid black',
  fontSize: '24px',
  fontWeight: 'bold',
  backgroundColor: '#4CE4DA',
  padding: '10px'
});
Map.add(chartTitle1);

// Create the title label for spectral chart
var chartTitle2 = ui.Label('Click on spectrometer image to view spectra (export panel must be closed; refresh browser if spectral plot freezes)', {
  position: 'bottom-center',
  color: 'blue',
  fontSize: '13px',
  fontWeight: 'bold',
  padding: '10px'
});
Map.add(chartTitle2);

// Create a panel for the 1st chart
var panel = ui.Panel({
  style: {
    //width: '500px',
    //height: '270px',
    width: '300px',
    height: '200px',
    position: 'bottom-right',
    shown: false
  }
});
Map.add(panel);

// Create a panel for the 2nd chart
var panel2 = ui.Panel({
  style: {
    width: '300px',
    height: '200px',
    position: 'bottom-right',
    shown: false
  }
});
Map.add(panel2);

// ----------------------------
// Map Update Function
// ----------------------------

function getDynamicDSMVisParams(DSMimage) {
  var DSMpercentClip = DSMimage.reduceRegion({
    reducer: ee.Reducer.percentile([2, 98]),
    scale: 10,
    maxPixels: 3e7
  });

  var keys = DSMpercentClip.keys();
  var minserver = ee.Number(DSMpercentClip.get(keys.get(0))).round();
  var maxserver = ee.Number(DSMpercentClip.get(keys.get(1))).round();

  return {
    bands: 'DSM',
    min: minserver.getInfo(),
    max: maxserver.getInfo(),
    palette: ['000000', 'FFFFFF']
    //palette: dem_palette
  };
}

function getDynamicDTMVisParams(DTMimage) {
  var DTMpercentClip = DTMimage.reduceRegion({
    reducer: ee.Reducer.percentile([2, 98]),
    scale: 10,
    maxPixels: 3e7
  });

  var keys = DTMpercentClip.keys();
  var minserver = ee.Number(DTMpercentClip.get(keys.get(0))).round();
  var maxserver = ee.Number(DTMpercentClip.get(keys.get(1))).round();

  return {
    bands: 'DTM',
    min: minserver.getInfo(),
    max: maxserver.getInfo(),
    palette: ['000000', 'FFFFFF']
  };
}

function getDynamicCHMVisParams(CHMimage) {
      var CHMpercentClip = CHMimage.reduceRegion({
        reducer: ee.Reducer.percentile([2, 98]),
        scale: 10,
        maxPixels: 3e7
      });
      
      var keys = CHMpercentClip.keys();
      var minserver = ee.Number(CHMpercentClip.get(keys.get(0))).round();
      var maxserver = ee.Number(CHMpercentClip.get(keys.get(1))).round();
      
      var minVal = minserver.getInfo();
      var maxVal = maxserver.getInfo();
      
      // If min and max are the same (e.g., both 0), use fallback values
      if (minVal === maxVal) {
        minVal = 0;
        maxVal = 2;
      }
      
      return {
        bands: 'CHM',
        min: minVal,
        max: maxVal,
        palette: ['E6F7E0', '063B00']
      };
    }

function getDynamicNitrogenVisParams(nitrogenImage, imageNumber) {
  // Apply nitrogen mask before calculating percentiles
  var maskedNitrogen = maskNitrogen(nitrogenImage).select('Nitrogen_Percent');
  
  var nitrogenPercentClip = maskedNitrogen.reduceRegion({
    reducer: ee.Reducer.percentile([2.5, 97.5]),
    scale: 10,
    maxPixels: 3e7
  });
  
  var keys = nitrogenPercentClip.keys();
  var minVal = ee.Number(nitrogenPercentClip.get(keys.get(0))).getInfo();
  var maxVal = ee.Number(nitrogenPercentClip.get(keys.get(1))).getInfo();
  
  // If min and max are the same, use fallback values
  if (minVal === maxVal) {
    minVal = 0;
    maxVal = 4;
  }
  
  // Store values for legend updates
  if (imageNumber === 1) {
    nitrogenMinMax.image1 = {min: minVal, max: maxVal};
  } else if (imageNumber === 2) {
    nitrogenMinMax.image2 = {min: minVal, max: maxVal};
  }
  
  return {
    bands: ['Nitrogen_Percent'],
    min: minVal,
    max: maxVal,
    palette: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725']
  };
}

function getNitrogenUncertaintyVisParams(nitrogenImage, imageNumber) {
  // Apply nitrogen mask and calculate mean ± 2 standard deviations for uncertainty band
  var maskedUncertainty = maskNitrogen(nitrogenImage).select('Nitrogen_Uncertainty');
  
  var uncertaintyStats = maskedUncertainty.reduceRegion({
    reducer: ee.Reducer.mean().combine({
      reducer2: ee.Reducer.stdDev(),
      sharedInputs: true
    }),
    scale: 10,
    maxPixels: 3e7
  });
  
  var mean = ee.Number(uncertaintyStats.get('Nitrogen_Uncertainty_mean')).getInfo();
  var stdDev = ee.Number(uncertaintyStats.get('Nitrogen_Uncertainty_stdDev')).getInfo();
  
  var minVal = mean - (2 * stdDev);
  var maxVal = mean + (2 * stdDev);
  
  // Ensure values stay within valid range [0, 1]
  minVal = Math.max(0, minVal);
  maxVal = Math.min(1, maxVal);
  
  // If min and max are the same, use fallback values
  if (minVal === maxVal) {
    minVal = 0;
    maxVal = 1;
  }
  
  // Store values for legend updates
  if (imageNumber === 1) {
    uncertaintyMinMax.image1 = {min: minVal, max: maxVal};
  } else if (imageNumber === 2) {
    uncertaintyMinMax.image2 = {min: minVal, max: maxVal};
  }
  
  return {
    bands: ['Nitrogen_Uncertainty'],
    min: minVal,
    max: maxVal,
    palette: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921']
  };
}

function getNitrogenClassificationVisParams(nitrogenImage) {
  return {
    bands: ['Needle_Non-needle_Classification'],
    min: 0,
    max: 1,
    palette: ['olive', 'green']
  };
}

// Wrapper function to get the appropriate nitrogen visualization based on selected band
function getNitrogenVisParams(nitrogenImage, imageNumber) {
  // imageNumber: 1 for Image 1, 2 for Image 2
  // But if only one image is CNC, use currentNitrogenBand1 (the always-visible selector)
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();
  var isCNC1 = collection1 && String(collection1).indexOf('CNC/002') !== -1;
  var isCNC2 = collection2 && String(collection2).indexOf('CNC/002') !== -1;
  
  var selectedBand;
  if (isCNC1 && isCNC2) {
    // Both are CNC - use the appropriate selector
    selectedBand = (imageNumber === 1) ? currentNitrogenBand1 : currentNitrogenBand2;
  } else {
    // Only one is CNC - always use currentNitrogenBand1 (the single visible selector)
    selectedBand = currentNitrogenBand1;
  }
  
  if (selectedBand === 'Canopy Nitrogen Model Uncertainty') {
    return getNitrogenUncertaintyVisParams(nitrogenImage, imageNumber);
  } else if (selectedBand === 'Needle Leaf/Non-Needle Leaf Classification') {
    return getNitrogenClassificationVisParams(nitrogenImage);
  } else {
    // Default: Percent Nitrogen (%) - pass imageNumber to store values
    return getDynamicNitrogenVisParams(nitrogenImage, imageNumber);
  }
}

// ----------------------------
// Derived Indices/Terrain Products: Constants and Compute Functions
// ----------------------------

var VI_SCALE_FACTOR = 10000;  // NEON stores reflectance as integer * 10000

var VI_BAND_RANGES = {
  blue:   [459.0, 479.0],
  red:    [635.5, 670.0],
  nir:    [850.0, 880.0],
  pri1:   [523.5, 538.5],
  pri2:   [562.5, 577.5],
  water1: [845.0, 855.0],   // NIR water mask window (±5nm)
  water2: [1595.0, 1605.0]  // SWIR water mask window (±5nm)
};

var VI_EVI_G  = 2.5, VI_EVI_C1 = 6.0, VI_EVI_C2 = 7.5, VI_EVI_L = 1.0;
var VI_ARVI_GAMMA = 1.0;
var VI_SAVI_L = 0.5;
var VI_WATER_THRESH_NIR  = 0.01;
var VI_WATER_THRESH_SWIR = 0.005;

// Visualization parameters for each derived product
var DERIVED_VIS = {
  NDVI: {min: -0.1, max: 0.9,
         palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#66bd63','#1a9850']},
  EVI:  {min: -0.1, max: 0.8,
         palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#66bd63','#1a9850']},
  ARVI: {min: -0.1, max: 0.8,
         palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#66bd63','#1a9850']},
  PRI:  {min: -0.05, max: 0.05,
         palette: ['#8c510a','#bf812d','#dfc27d','#f6e8c3','#c7eae5','#80cdc1','#35978f','#01665e']},
  SAVI: {min: -0.1, max: 0.8,
         palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#66bd63','#1a9850']},
  Slope:     {min: 0,   max: 60,  palette: ['#ffffff','#8b4513']},
  Aspect:    {min: 0,   max: 360, palette: ['#d53e4f','#f46d43','#fdae61','#fee08b',
                                             '#e6f598','#abdda4','#66c2a5','#3288bd','#d53e4f']},
  Hillshade: {min: 0,   max: 255, palette: ['#000000','#ffffff']}
};

// Core helper: mean reflectance (0–1) across all bands in [minWl, maxWl]
function vi_getBandMean(image, minWl, maxWl) {
  var wlDict = image.toDictionary().select(['WL_FWHM_B\\d+']);
  var keys = wlDict.keys();
  var inRangeKeys = keys.map(function(key) {
    key = ee.String(key);
    var centerWl = ee.Number.parse(ee.String(wlDict.get(key)).split(',').get(0));
    return ee.Algorithms.If(centerWl.gte(minWl).and(centerWl.lte(maxWl)), key, 'EXCLUDE');
  }).filter(ee.Filter.neq('item', 'EXCLUDE'));
  var bandNames = inRangeKeys.map(function(key) {
    return ee.String(key).replace('WL_FWHM_', '');
  });
  return image.select(bandNames).divide(VI_SCALE_FACTOR).reduce(ee.Reducer.mean()).rename('band_mean');
}

// Water mask: 1 = valid land, 0 = water
function vi_getWaterMask(image) {
  var nirW  = vi_getBandMean(image, VI_BAND_RANGES.water1[0], VI_BAND_RANGES.water1[1]);
  var swirW = vi_getBandMean(image, VI_BAND_RANGES.water2[0], VI_BAND_RANGES.water2[1]);
  return nirW.lt(VI_WATER_THRESH_NIR).and(swirW.lt(VI_WATER_THRESH_SWIR)).not();
}

// Precompute all needed spectral bands once per image
function vi_precompute(image) {
  return {
    blue:  vi_getBandMean(image, VI_BAND_RANGES.blue[0],  VI_BAND_RANGES.blue[1]),
    red:   vi_getBandMean(image, VI_BAND_RANGES.red[0],   VI_BAND_RANGES.red[1]),
    nir:   vi_getBandMean(image, VI_BAND_RANGES.nir[0],   VI_BAND_RANGES.nir[1]),
    pri1:  vi_getBandMean(image, VI_BAND_RANGES.pri1[0],  VI_BAND_RANGES.pri1[1]),
    pri2:  vi_getBandMean(image, VI_BAND_RANGES.pri2[0],  VI_BAND_RANGES.pri2[1]),
    water: vi_getWaterMask(image)
  };
}

// Individual index compute functions
function vi_ndvi(b) {
  return b.nir.subtract(b.red).divide(b.nir.add(b.red)).rename('NDVI').updateMask(b.water);
}
function vi_evi(b) {
  var denom = b.nir.add(b.red.multiply(VI_EVI_C1)).subtract(b.blue.multiply(VI_EVI_C2)).add(VI_EVI_L);
  return b.nir.subtract(b.red).multiply(VI_EVI_G).divide(denom).rename('EVI').updateMask(b.water);
}
function vi_arvi(b) {
  var rho_rb = b.red.subtract(b.blue.subtract(b.red).multiply(VI_ARVI_GAMMA));
  return b.nir.subtract(rho_rb).divide(b.nir.add(rho_rb)).rename('ARVI').updateMask(b.water);
}
function vi_pri(b) {
  return b.pri1.subtract(b.pri2).divide(b.pri1.add(b.pri2)).rename('PRI').updateMask(b.water);
}
function vi_savi(b) {
  return b.nir.subtract(b.red)
              .divide(b.nir.add(b.red).add(VI_SAVI_L))
              .multiply(1 + VI_SAVI_L)
              .rename('SAVI').updateMask(b.water);
}

// Main dispatch: compute and add the selected derived product as a map layer
function addDerivedProductLayer(image, productName, layerLabel) {
  var vis = DERIVED_VIS[productName];
  var label = layerLabel + productName;

  // Terrain products: compute per-tile to preserve native UTM projection, then mosaic
  var terrainBandMap = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};
  if (terrainBandMap.hasOwnProperty(productName)) {
    var demCollection = ee.ImageCollection('projects/neon-prod-earthengine/assets/DEM/001')
      .filterBounds(image.geometry());
    var terrainMosaic = demCollection.select('DTM').map(function(tile) {
      return ee.Terrain.products(tile);
    }).mosaic();
    Map.addLayer(terrainMosaic.select(terrainBandMap[productName]), vis, label);
    createDerivedLegend(productName);
    return;
  }

  // Vegetation indices: precompute bands then dispatch
  var b = vi_precompute(image);
  var result;
  if      (productName === 'NDVI') result = vi_ndvi(b);
  else if (productName === 'EVI')  result = vi_evi(b);
  else if (productName === 'ARVI') result = vi_arvi(b);
  else if (productName === 'PRI')  result = vi_pri(b);
  else if (productName === 'SAVI') result = vi_savi(b);
  Map.addLayer(result, vis, label);
  createDerivedLegend(productName);
}

// Variable to store the last selected site
var lastSelectedSite = null;

// Function to mask NaN values while preserving zeros
function maskNaN(image) {
  var mask = image.expression(
    'img == img', {
      'img': image
  });
  return image.updateMask(mask);
}

// Normalize CNC band names — transparently handles both old (nitrogen_valid, etc.)
// and new (Valid_Pixel_Classification, etc.) naming conventions so the script works
// during the transition period when not all images have been updated yet.
function normalizeCNCBandNames(image) {
  var bandNames = image.bandNames();
  return ee.Image(ee.Algorithms.If(
    bandNames.contains('nitrogen_valid'),
    image.rename(bandNames.map(function(b) {
      b = ee.String(b);
      return ee.String(ee.Dictionary({
        'nitrogen':                 'Nitrogen_Percent',
        'nitrogen_uncertainty':     'Nitrogen_Uncertainty',
        'nitrogen_classification':  'Needle_Non-needle_Classification',
        'nitrogen_valid':           'Valid_Pixel_Classification'
      }).get(b, b));
    })),
    image
  ));
}

// Function to mask nitrogen using the Valid_Pixel_Classification band
function maskNitrogen(image) {
  image = normalizeCNCBandNames(image);
  var nit_valid = image.select('Valid_Pixel_Classification');
  return image.updateMask(nit_valid);
}

function updateMap(selectedImageName1, selectedImageName2, visParams) {
  // Clear existing layers and reset to NLCD layer
  Map.layers().reset([nlcdLayer]);

  if (!selectedImageName1) return;

  // Filter the collections for selected images
  var collection1 = imageCollections[selectCollection1.getValue()];
  selectedImage1 = collection1.filter(ee.Filter.eq('system:index', selectedImageName1)).first();

  selectedImage2 = null;
  if (selectedImageName2) {
    var collection2 = imageCollections[selectCollection2.getValue()];
    selectedImage2 = collection2.filter(ee.Filter.eq('system:index', selectedImageName2)).first();
  }

  // Apply visualization parameters based on the collection type
  var visParams1 = visParams; // Default to the passed visualization parameters
  var visParams2 = visParams; // Default to the passed visualization parameters
  
  // Check if PUUM site and adjust Natural Color bands for spectrometer collections
  var selectedSite = neonSiteSelect.getValue();
  if (selectedSite === 'PUUM' && 
      (selectCollection1.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" || 
       selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)")) {
    // Check if using Natural Color Composite
    if (visParams1.bands && 
        visParams1.bands[0] === 'B053' && 
        visParams1.bands[1] === 'B035' && 
        visParams1.bands[2] === 'B019') {
      visParams1 = {
        bands: ['B060', 'B042', 'B026'],
        min: 100,
        max: 1400,
        gamma: 1.0
      };
    }
  }

  if (selectCollection1.getValue() === "Digital Surface Model (DEM/001)") {
    visParams1 = getDynamicDSMVisParams(selectedImage1);
  } else if (selectCollection1.getValue() === "Digital Terrain Model (DEM/001)") {
    visParams1 = getDynamicDTMVisParams(selectedImage1);
  } else if (selectCollection1.getValue() === "Canopy Height Model (CHM/001)") {
    visParams1 = getDynamicCHMVisParams(selectedImage1);
  } else if (selectCollection1.getValue() === "RGB Camera Photography (RGB/001)") {
    visParams1 = visParamsRGB;
  } else if (selectCollection1.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
    visParams1 = getNitrogenVisParams(selectedImage1, 1);
  }

  if (selectedImage2) {
    // Check if PUUM site and adjust Natural Color bands for spectrometer collections (2nd image)
    if (selectedSite === 'PUUM' && 
        (selectCollection2.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" || 
         selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)")) {
      // Check if using Natural Color Composite
      if (visParams2.bands && 
          visParams2.bands[0] === 'B053' && 
          visParams2.bands[1] === 'B035' && 
          visParams2.bands[2] === 'B019') {
        visParams2 = {
          bands: ['B060', 'B042', 'B026'],
          min: 100,
          max: 1400,
          gamma: 1.0
        };
      }
    }
    
    if (selectCollection2.getValue() === "Digital Surface Model (DEM/001)") {
      visParams2 = getDynamicDSMVisParams(selectedImage2);
    } else if (selectCollection2.getValue() === "Digital Terrain Model (DEM/001)") {
      visParams2 = getDynamicDTMVisParams(selectedImage2);
    } else if (selectCollection2.getValue() === "Canopy Height Model (CHM/001)") {
      visParams2 = getDynamicCHMVisParams(selectedImage2);
    } else if (selectCollection2.getValue() === "RGB Camera Photography (RGB/001)") {
      visParams2 = visParamsRGB;
    } else if (selectCollection2.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
      visParams2 = getNitrogenVisParams(selectedImage2, 2);
    }
  }

  // Apply cloud filter if needed and only for SDR or BRDF collections
  if (cloudFilterSelect.getValue() === '< 10% Cloud Cover') {
    if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" || selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)") {
      selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').eq(1));
    }
    if (selectedImage2 && (selectCollection2.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" || selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)")) {
      selectedImage2 = selectedImage2.updateMask(selectedImage2.select('Weather_Quality_Indicator').eq(1));
    }
  }
  
   // Add layers with the appropriate visualization parameters and NaN masking for DSM/DTM
  var displayImage1 = selectedImage1;
  if (selectCollection1.getValue() === "Digital Surface Model (DEM/001)" || 
      selectCollection1.getValue() === "Digital Terrain Model (DEM/001)") {
    displayImage1 = maskNaN(selectedImage1);
  } else if (selectCollection1.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
    displayImage1 = maskNitrogen(selectedImage1);
  }
  selectedImage1 = displayImage1;
  
  if (selectedImage2) {
    var displayImage2 = selectedImage2;
    if (selectCollection2.getValue() === "Digital Surface Model (DEM/001)" || 
        selectCollection2.getValue() === "Digital Terrain Model (DEM/001)") {
      displayImage2 = maskNaN(selectedImage2);
    } else if (selectCollection2.getValue() === "Canopy Nitrogen Concentration (CNC/002)") {
      displayImage2 = maskNitrogen(selectedImage2);
    }
    selectedImage2 = displayImage2;
  }
  
  // Add layers with the appropriate visualization parameters
  if (selectCollection1.getValue() === 'Derived Indices (HSI_REFL/002) / Terrain Products (DEM/001)') {
    // Route to derived product compute pipeline instead of displaying raw reflectance
    addDerivedProductLayer(selectedImage1, currentDerivedProduct, '1st Image: ');
  } else {
    Map.addLayer(selectedImage1, visParams1, '1st Image: ' + selectedImageName1);
  }
  
  if (selectedImage2) {
    if (selectCollection2.getValue() === 'Derived Indices (HSI_REFL/002) / Terrain Products (DEM/001)') {
      addDerivedProductLayer(selectedImage2, currentDerivedProduct, '2nd Image: ');
    } else {
      Map.addLayer(selectedImage2, visParams2, '2nd Image: ' + selectedImageName2);
    }
  }
  
  // Update the Terrestrial Sampling Boundaries layer if its checkbox is checked
  var boundaryChecked = checkboxList['Terrestrial Sampling Boundaries'].getValue();
  displayTerrestrialBoundaries(boundaryChecked);

  // Update the NEON Airshed layer if its checkbox is checked
  var airshedChecked = checkboxList['NEON Airshed'].getValue();
  displayAirsheds(airshedChecked);

  // Update the NEON Towers layer if its checkbox is checked
  var towerChecked = checkboxList['NEON Tower'].getValue();
  displayTowers(towerChecked);

  // Update the Terrestrial Sampling Plots layer if its checkbox is checked
  var plotsChecked = checkboxList['Terrestrial Sampling Plots'].getValue();
  displayTerrestrialPlots(plotsChecked);

  // Update the NEON AOP Flight Box layer if its checkbox is checked
  var flightboxChecked = checkboxList['NEON AOP Flight Box'].getValue();
  displayFlightboxBoundaries(flightboxChecked);
  
  // Center the map only if the site has changed
  var currentSite = neonSiteSelect.getValue();
  if (currentSite !== lastSelectedSite) {
    Map.centerObject(selectedImage1, 12.5); // Adjust the scale as needed
    lastSelectedSite = currentSite; // Update the last selected site
  }

// Initialize an object to hold metadata panels for each image
var metadataPanels = {
  '1st Image': null,
  '2nd Image': null
};

function displayMetadata(image, imageLabel) {
  image.get('system:time_start').evaluate(function(startTime) {
    var startDate = startTime ? new Date(startTime).toDateString() : 'N/A';

    image.get('system:time_end').evaluate(function(endTime) {
      var endDate = endTime ? new Date(endTime).toDateString() : 'N/A';

      image.get('PROVISIONAL_RELEASED').evaluate(function(status) {
        var metadataContent = [
          ui.Label({value: imageLabel + ' Acquisition Start Date: ' + startDate, style: {fontSize: '11px'}}),
          ui.Label({value: imageLabel + ' Acquisition End Date: ' + endDate, style: {fontSize: '11px'}}),
          ui.Label({value: imageLabel + ' Status: ' + status, style: {fontSize: '11px'}})
        ];

        if (status === 'RELEASED') {
          image.get('RELEASE_YEAR').evaluate(function(releaseYear) {
            if (releaseYear) {
              metadataContent.push(ui.Label({value: imageLabel + ' Release Tag: RELEASE-' + releaseYear, style: {fontSize: '11px'}}));
            } else {
              metadataContent.push(ui.Label({value: imageLabel + ' Release Year: N/A', style: {fontSize: '11px'}}));
            }
            metadataPanels[imageLabel] = ui.Panel(metadataContent, ui.Panel.Layout.flow('vertical'));
            updateMetadataPanel();
          });
        } else {
          metadataContent.push(ui.Label({value: imageLabel + ' Release Year: N/A', style: {fontSize: '11px'}}));
          metadataPanels[imageLabel] = ui.Panel(metadataContent, ui.Panel.Layout.flow('vertical'));
          updateMetadataPanel();
        }
      });
    });
  });
}

function updateMetadataPanel() {
  // Clear the main metadata panel
  metadataPanel.clear();
  
  // Add the metadata panels in the desired order
  if (metadataPanels['1st Image']) {
    metadataPanel.add(metadataPanels['1st Image']);
  }
  if (metadataPanels['2nd Image']) {
    metadataPanel.add(metadataPanels['2nd Image']);
  }
}

// Display metadata for the first image
displayMetadata(selectedImage1, '1st Image');

// Display metadata for the second image if it exists
if (selectedImage2) {
  displayMetadata(selectedImage2, '2nd Image');
}

// Update nitrogen legends with calculated values
updateNitrogenContinuousLegendsVisibility();

}

// ----------------------------
// Chart display on map click
// ---------------------------- 
 
// Register a function to draw a chart when a user clicks on the map
Map.style().set('cursor', 'crosshair'); // Ensure the cursor remains a crosshair
Map.onClick(function(coords) {
  // Only process spectral clicks when export panel is closed
  if (!spectralClickEnabled) {
    return; // Exit early if spectral clicking is disabled
  }
  // Define current images for use throughout the function
  var currentImage1 = selectedImage1;
  var currentImage2 = selectedImage2;
  
  // Define or clear the message label
  var messageLabel = ui.Label();
  Map.add(messageLabel); // Add the label to the map interface

  // Determine if the collections are eligible for spectral curves
  var isEligibleCollection1 = selectCollection1.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" ||
                              selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)";
  var isEligibleCollection2 = selectCollection2.getValue() === "Spectrometer Directional Reflectance (HSI_REFL/001)" ||
                              selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (HSI_REFL/002)";

  // Clear panels if needed
  if (panel.style().get('shown')) {
    panel.style().set('shown', false);
    panel.clear();
  }

  if (panel2.style().get('shown')) {
    panel2.style().set('shown', false);
    panel2.clear();
  }

  // Only proceed if at least one of the images is from an eligible collection
  if (!isEligibleCollection1 && !isEligibleCollection2) {
    messageLabel.setValue("Spectral chart not available for the selected image collections.")
                .setStyle({color: 'red', fontSize: '16px', fontWeight: 'bold', position: 'bottom-left'});
    return;
  }

  // If the message was previously set, clear it
  messageLabel.setValue("");

  // Show panels only if eligible
  if (isEligibleCollection1) {
    panel.style().set('shown', true);
  }

  if (isEligibleCollection2 && currentImage2) {
    panel2.style().set('shown', true);
  }

  var point = ee.Geometry.Point(coords.lon, coords.lat);

  // Process the first image
  if (isEligibleCollection1) {
    var bandNames = currentImage1.bandNames().filter(ee.Filter.stringContains('item', 'B'));
    var properties = currentImage1.toDictionary();
    var wl_fwhm_dict = properties.select(['WL_FWHM_B+\\d{3}']);
    var wl_fwhm_list = wl_fwhm_dict.values();

    var wavelengths = wl_fwhm_list.map(function(x) {
      var str_split = ee.String(x).split(',');
      return ee.Number.parse(str_split.get(0));
    });

    var selectedBands = currentImage1.select(bandNames);

    var chart = ui.Chart.image.regions(selectedBands, point, null, 1, 'λ (nm)', wavelengths.getInfo());
    chart.setSeriesNames(['Spectral Values'])
      .setOptions({
        colors: ['red'],
        title: currentImage1.get('NEON_DOMAIN').getInfo() + ' ' + currentImage1.get('NEON_SITE').getInfo() + ' ' + currentImage1.get('FLIGHT_YEAR').getInfo(),
        hAxis: {title: 'Wavelength (nm)', gridlines: { count: 5 }},
        vAxis: {title: 'Scaled Reflectance', viewWindow: { min: -200, max: 8000 }},
        width: 280, 
        height: 130 
      });

    var location = 'Longitude: ' + coords.lon.toFixed(2) + ' ' + 'Latitude: ' + coords.lat.toFixed(2);
    var locationLabel = ui.Label({
      value: location,
      style: {
        fontSize: '10px', 
        color: 'gray',    
        margin: '5px 0',
        fontWeight: 'bold'
      }
    });
    panel.widgets().set(0, locationLabel);
    panel.add(chart);
  }

  // Process the second image
  if (isEligibleCollection2 && currentImage2) {
    var bandNames2 = currentImage2.bandNames().filter(ee.Filter.stringContains('item', 'B'));
    var properties2 = currentImage2.toDictionary();
    var wl_fwhm_dict2 = properties2.select(['WL_FWHM_B+\\d{3}']);
    var wl_fwhm_list2 = wl_fwhm_dict2.values();

    var wavelengths2 = wl_fwhm_list2.map(function(x) {
      var str_split = ee.String(x).split(',');
      return ee.Number.parse(str_split.get(0));
    });

    var selectedBands2 = currentImage2.select(bandNames2);

    var chart2 = ui.Chart.image.regions(selectedBands2, point, null, 1, 'λ (nm)', wavelengths2.getInfo());
    chart2.setSeriesNames(['Spectral Values'])
      .setOptions({
        title: currentImage2.get('NEON_DOMAIN').getInfo() + ' ' + currentImage2.get('NEON_SITE').getInfo() + ' ' + currentImage2.get('FLIGHT_YEAR').getInfo(),
        hAxis: {title: 'Wavelength (nm)', gridlines: { count: 5 }},
        vAxis: {title: 'Scaled Reflectance', viewWindow: { min: -200, max: 8000 }},
        width: 280, 
        height: 130 
      });

    var location2 = 'Longitude: ' + coords.lon.toFixed(2) + ' ' + 'Latitude: ' + coords.lat.toFixed(2);
    var locationLabel2 = ui.Label({
      value: location2,
      style: {
        fontSize: '10px', 
        color: 'gray',    
        margin: '5px 0',
        fontWeight: 'bold'
      }
    });
    panel2.widgets().set(0, locationLabel2);
    panel2.add(chart2);
  }
});
