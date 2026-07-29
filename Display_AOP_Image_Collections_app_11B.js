  // Author: J Musinsky, Sonnet 5, July 2026
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
  var demAvailableForYear = null;  // null=unknown, true=DEM exists for year, false=no matching DEM

  // Import the NLCD collection
  var dataset = ee.ImageCollection('USGS/NLCD_RELEASES/2021_REL/NLCD');
  // Filter the collection to the 2021 product
  var nlcd2021 = dataset.filter(ee.Filter.eq('system:index', '2021')).first();

  // NLCD layer object â€” only added to the map when the checkbox is checked,
  // so it never appears in the Layers panel when deselected.
  var nlcdLayer = null;

  // MODIS EVI background layer â€” matched to 1st image acquisition date
  // MOD13Q1 (16-day, 250 m) is searched back 30 days from the flight date; newest composite wins.
  // Post-decommission fallback: dates beyond 2026-12-31 are capped at that date so the last
  // available annual composite continues to display rather than returning null.
  var modisEviVisible = false;
  var MODIS_EVI_VIS = {
    min: 0, max: 7000,
    palette: ['FFFFFF', 'CE7E45', 'FCD163', '66A000', '207401', '011301']
  };
  var MODIS_DECOMMISSION_DATE = ee.Date('2026-12-31');

  // Set the default map layer to Satellite
  //Map.setOptions('SATELLITE');

  // ----------------------------
  // Define Image Collections, Feature Collections, Templates
  // ----------------------------

  // Define available image collections
  var imageCollections = {
    "Spectrometer Directional Reflectance (DP3.30006.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/001"),
    "Spectrometer Bidirectional Reflectance (DP3.30006.002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/002"),
    "Canopy Height Model (DP3.30015.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CHM/001"),
    "Digital Surface Model (DP3.30024.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
    "Digital Terrain Model (DP3.30024.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
    "RGB Camera Photography (DP3.30010.001)": ee.ImageCollection('projects/neon-prod-earthengine/assets/RGB/001'),
    "Canopy Nitrogen Content (DP3.30018.002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CNC/002"),
    "Derived Indices (from DP3.30006.001 - Dir. Refl.)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/001"),
    "Derived Indices (from DP3.30006.002 - BiDir. Refl.)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/002"),
    "Derived Terrain Products (from DP3.30024.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001")
  };

  // Sample script templates for different collection types
  var scriptTemplates = {
    "Spectrometer Directional Reflectance (DP3.30006.001)": {
      collectionPath: "projects/neon-prod-earthengine/assets/HSI_REFL/001",
      collectionVariable: "refl001",
      collectionName: "Directional Reflectance",
      bands: "['B053','B035','B019']",
      visParams: "{min: 103, max: 1160, bands: ['B053','B035','B019'], gamma: 1.0}",
      layerName: "Directional Reflectance"
    },
    "Spectrometer Bidirectional Reflectance (DP3.30006.002)": {
      collectionPath: "projects/neon-prod-earthengine/assets/HSI_REFL/002",
      collectionVariable: "refl002",
      collectionName: "Bidirectional Reflectance",
      bands: "['B053','B035','B019']",
      visParams: "{min: 340, max: 2150, bands: ['B053','B035','B019'], gamma: 2}",
      layerName: "Bidirectional Reflectance"
    },
    "Canopy Height Model (DP3.30015.001)": {
      collectionPath: "projects/neon-prod-earthengine/assets/CHM/001",
      collectionVariable: "chm",
      collectionName: "CHM",
      bands: "['CHM']",
      visParams: "{min: 0, max: 35, palette: ['E6F7E0', '063B00']}",
      layerName: "Canopy Height Model (m)"
    },
    "Digital Surface Model (DP3.30024.001)": {
      collectionPath: "projects/neon-prod-earthengine/assets/DEM/001",
      collectionVariable: "dsm",
      collectionName: "DSM",
      bands: "['DSM']",
      visParams: "{bands: ['DSM'], min: 0, max: 4000, palette: ['000000', 'FFFFFF']}",
      layerName: "Digital Surface Model (m)"
    },
    "Digital Terrain Model (DP3.30024.001)": {
      collectionPath: "projects/neon-prod-earthengine/assets/DEM/001",
      collectionVariable: "dtm",
      collectionName: "DTM",
      bands: "['DTM']",
      visParams: "{bands: ['DTM'], min: 0, max: 4000, palette: ['000000', 'FFFFFF']}",
      layerName: "Digital Terrain Model (m)"
    },
    "RGB Camera Photography (DP3.30010.001)": {
      collectionPath: "projects/neon-prod-earthengine/assets/RGB/001",
      collectionVariable: "rgb",
      collectionName: "RGB",
      bands: "['R','G','B']",
      visParams: "{min: 40, max: 200, bands: ['R','G','B'], gamma: 0.65}",
      layerName: "RGB Camera Photography"
    },
    "Canopy Nitrogen Content (DP3.30018.002)": {
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
      width: '336px', // Fixed width
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

  // Floating Hide/Show Panel toggle button, positioned in the small gap
  // above the map's built-in zoom (+/-) control in the top-left corner.
  var isMainPanelVisible = true;
  var mainPanelToggleButton = ui.Button({
    label: 'Hide Main Panel',
    style: {
      position: 'top-left',
      margin: '0 0 0 0',
      padding: '2px',
      fontSize: '8px',
      color: 'blue'
    },
    onClick: function() {
      if (isMainPanelVisible) {
        ui.root.remove(mainPanel);
        mainPanelToggleButton.setLabel('Show Main Panel');
      } else {
        ui.root.insert(0, mainPanel);
        mainPanelToggleButton.setLabel('Hide Main Panel');
      }
      isMainPanelVisible = !isMainPanelVisible;
    }
  });
  Map.add(mainPanelToggleButton);

  // Add dropdowns to select image collections and images
  // Dropdown for selecting the first image collection
  var selectCollection1 = ui.Select({
    items: Object.keys(imageCollections),
    placeholder: 'Select the 1st data product',
    onChange: function(selectedCollection) {
      updateImageDropdown1(neonSiteSelect.getValue());
    },
    style: {width: '100%', margin: '10px 0'}
  });

  // Dropdown for selecting the second image collection
  var selectCollection2 = ui.Select({
    items: Object.keys(imageCollections),
    placeholder: 'Select the 2nd data product (optional)',
    onChange: function(selectedCollection) {
      updateImageDropdown2(neonSiteSelect.getValue());
    },
    style: {width: '100%', margin: '10px 0'}
  });

  // Merge all image collections into a single FeatureCollection
  var mergedCollections = ee.FeatureCollection(imageCollections['Spectrometer Directional Reflectance (DP3.30006.001)'])
    .merge(ee.FeatureCollection(imageCollections['Spectrometer Bidirectional Reflectance (DP3.30006.002)']))
    .merge(ee.FeatureCollection(imageCollections['Canopy Height Model (DP3.30015.001)']))
    .merge(ee.FeatureCollection(imageCollections['Digital Surface Model (DP3.30024.001)']))
    .merge(ee.FeatureCollection(imageCollections['Digital Terrain Model (DP3.30024.001)']))
    .merge(ee.FeatureCollection(imageCollections['RGB Camera Photography (DP3.30010.001)']))
    .merge(ee.FeatureCollection(imageCollections['Canopy Nitrogen Content (DP3.30018.002)']));

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

  // Paired/alias sites: AOP imagery is stored under the primary site ID,
  // but the alias site appears as a separate selectable entry in the dropdown.
  // Each alias entry uses its own site ID as the dropdown value (so no two entries
  // share the same value, avoiding dropdown selection confusion).  The pairedSiteMap
  // lookup is used only when filtering image collections, so imagery is fetched from
  // the correct GEE collection while all ancillary data (towers, airsheds, etc.) is
  // filtered by the alias site ID the user actually selected.
  var pairedSiteMap = {
    'DCFS': 'WOOD',
    'KONA': 'KONZ',
    'TREE': 'STEI'
  };
  // Full names for alias sites â€” used in generated sample script comments
  var pairedSiteNames = {
    'DCFS': 'Dakota Coteau Field Station',
    'KONA': 'Konza Prairie Agroecosystem',
    'TREE': 'Treehaven'
  };
  var pairedSites = [
    {label: 'DCFS - Dakota Coteau Field Station', value: 'DCFS'},
    {label: 'KONA - Konza Prairie Agroecosystem',  value: 'KONA'},
    {label: 'TREE - Treehaven',                    value: 'TREE'}
  ];
  pairedSites.forEach(function(p) { dropdownItems.push(p); });
  dropdownItems.sort(function(a, b) { return a.label.localeCompare(b.label); });

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
    // Reset DEM availability state whenever the collection or site changes
    demAvailableForYear = null;
    if (terrainWarningLabel) { terrainWarningLabel.style().set('shown', false); }

    var collection1 = imageCollections[selectCollection1.getValue()];

    if (collection1 && selectedSite) {
      // Resolve the GEE site ID: alias sites (e.g. DCFS) map to a primary site (e.g. WOOD)
      var geeSite1 = pairedSiteMap[selectedSite] || selectedSite;
      // Filter the first collection by the GEE site ID
      collection1 = collection1.filter(ee.Filter.eq('NEON_SITE', geeSite1));

      // Retrieve the image indices for the filtered collection
      var imageList = collection1.aggregate_array('system:index').getInfo();

      // For paired alias sites, show labels with the alias ID but keep the real index as value
      // so that image filtering and script generation always receive the correct GEE index.
      var dropdownItems1 = pairedSiteMap[selectedSite]
        ? imageList.map(function(idx) {
            return {label: idx.replace(geeSite1, selectedSite), value: idx};
          })
        : imageList;

      // Reset dropdown options for the first image selection
      select1.items().reset(dropdownItems1);
      select1.setPlaceholder(imageList.length ? 'Select the 1st image' : 'No images for this site from this collection');

      // Clear the selection, waiting for user input
      select1.setValue(null);

      // Clear the map for the first image layer
      updateMap(null, select2.getValue(), currentVisParams);
    }
  }

  // Update function to populate the second image dropdown based on the selected NEON_SITE and second image collection
  function updateImageDropdown2(selectedSite) {
    // Reset DEM availability state whenever the collection or site changes
    demAvailableForYear = null;
    if (terrainWarningLabel) { terrainWarningLabel.style().set('shown', false); }

    var collection2 = imageCollections[selectCollection2.getValue()];

    if (collection2 && selectedSite) {
      // Resolve the GEE site ID: alias sites (e.g. DCFS) map to a primary site (e.g. WOOD)
      var geeSite2 = pairedSiteMap[selectedSite] || selectedSite;
      // Filter the second collection by the GEE site ID
      collection2 = collection2.filter(ee.Filter.eq('NEON_SITE', geeSite2));

      // Retrieve the image indices for the filtered collection
      var imageList = collection2.aggregate_array('system:index').getInfo();

      // For paired alias sites, show labels with the alias ID but keep the real index as value
      var dropdownItems2 = pairedSiteMap[selectedSite]
        ? imageList.map(function(idx) {
            return {label: idx.replace(geeSite2, selectedSite), value: idx};
          })
        : imageList;

      // Reset dropdown options for the second image selection
      select2.items().reset(dropdownItems2);
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
    
    // Handle HSI-based Derived Indices (both /002 BRDF-corrected and /001 directional)
    // â€” no scriptTemplates entry needed; generate the compute pipeline inline.
    if (selectedCollection === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)' ||
        selectedCollection === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)') {
      var hsiCollPath = (selectedCollection === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)')
        ? 'projects/neon-prod-earthengine/assets/HSI_REFL/002'
        : 'projects/neon-prod-earthengine/assets/HSI_REFL/001';
      var hsiCollVar = (selectedCollection === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)') ? 'refl002' : 'refl001';
      var hsiCollLabel = (selectedCollection === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)')
        ? 'NEON AOP Bidirectional Reflectance Image Collection (HSI_REFL/002)'
        : 'NEON AOP Directional Reflectance Image Collection (HSI_REFL/001)';

      var hsiCollection = imageCollections[selectedCollection];
      var hsiImage = hsiCollection.filter(ee.Filter.eq('system:index', select1.getValue())).first();
      hsiImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR'];
        var citation = props['CITATION'] || null;
        var product = currentDerivedProduct;
        var vis = DERIVED_VIS[product];
        var paletteStr = JSON.stringify(vis.palette);
        var site = neonSiteSelect.getValue();
        var idx  = select1.getValue();

        var pairedNoteDerived = pairedSiteMap[site]
          ? '// Note: AOP imagery for ' + site + ' (' + (pairedSiteNames[site] || site) + ') is stored\n' +
            '// in GEE under the NEON site ID ' + pairedSiteMap[site] + '.'
          : null;

        var lines = [
          (citation ? '// Citation: ' + citation : null),
          (citation ? '' : null),
          '// NEON AOP Derived ' + product + ' \u2014 generated by AOP GEE Data Viewer',
          '// Source: ' + selectedCollection,
          '// Site: ' + site + '  |  Year: ' + year + '  |  Image: ' + idx,
          '',
          pairedNoteDerived
        ].filter(function(l) { return l !== null; });

        // Veg / water index â€” include the full compute pipeline
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
            '// Read in the ' + hsiCollLabel,
            'var ' + hsiCollVar + ' = ee.ImageCollection(\'' + hsiCollPath + '\');',
            '',
            '// Filter by specific image index',
            'var img = ' + hsiCollVar + '.filter(ee.Filter.eq(\'system:index\', \'' + idx + '\')).first();',
            '',
            '// Compute reflectance band means (scaled 0-1) for relevant wavelength ranges (nm)',
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
          } else if (product === 'LAI') {
            lines = lines.concat([
              '// LAI -- NEON ATBD Eq. 3 (DOC.002385): LAI = -(1/a2) * ln((a0 - SAVI) / a1)',
              'var L = 0.5;',
              'var SAVI = NIR.subtract(Red).divide(NIR.add(Red).add(L)).multiply(1 + L);',
              'var arg = ee.Image(0.82).subtract(SAVI).divide(0.78);',
              'var lai = arg.log().multiply(-1.0 / 0.60).rename(\'LAI\');',
              'var validMask = arg.gt(0).and(lai.gte(0)).and(lai.lte(15));',
              'var result = lai.updateMask(validMask).updateMask(landMask);'
            ]);
          } else if (product === 'fPAR') {
            lines = lines.concat([
              '// fPAR -- NEON ATBD Eq. 3 (DOC.003840): fPAR = C * [1 - A * exp(-B * LAI)]',
              'var L = 0.5;',
              'var SAVI = NIR.subtract(Red).divide(NIR.add(Red).add(L)).multiply(1 + L);',
              'var arg = ee.Image(0.82).subtract(SAVI).divide(0.78);',
              'var lai = arg.log().multiply(-1.0 / 0.60);',
              'var laiValid = arg.gt(0).and(lai.gte(0)).and(lai.lte(15));',
              'lai = lai.updateMask(laiValid).updateMask(landMask);',
              'var result = ee.Image(1).multiply(',
              '  ee.Image(1).subtract(ee.Image(1).multiply(lai.multiply(-0.4).exp()))',
              ').rename(\'fPAR\').clamp(0, 1);'
            ]);
          } else if (product === 'WBI') {
            lines = lines.concat([
              '// WBI \u2014 NEON ATBD (DOC.004364) Eq. 1: WBI = \u03c1970 / \u03c1900',
              'var rho900 = getBandMean(img, 892.5, 907.5);',
              'var rho970 = getBandMean(img, 962.5, 977.5);',
              'var result = rho970.divide(rho900).rename(\'WBI\').updateMask(landMask);'
            ]);
          } else if (product === 'NMDI') {
            lines = lines.concat([
              '// NMDI \u2014 NEON ATBD (DOC.004364) Eq. 2: NMDI = (\u03c1860 \u2212 (\u03c11640 \u2212 \u03c12130)) / (\u03c1860 + (\u03c11640 \u2212 \u03c12130))',
              'var rho860  = getBandMean(img, 841.0, 876.0);',
              'var rho1640 = getBandMean(img, 1628.0, 1652.0);',
              'var rho2130 = getBandMean(img, 2105.0, 2155.0);',
              'var diff = rho1640.subtract(rho2130);',
              'var result = rho860.subtract(diff).divide(rho860.add(diff)).rename(\'NMDI\').updateMask(landMask);'
            ]);
          } else if (product === 'NDWI') {
            lines = lines.concat([
              '// NDWI \u2014 NEON ATBD (DOC.004364) Eq. 3: NDWI = (\u03c1857 \u2212 \u03c11241) / (\u03c1857 + \u03c11241)',
              'var rho857  = getBandMean(img, 849.5, 864.5);',
              'var rho1241 = getBandMean(img, 1232.5, 1247.5);',
              'var result = rho857.subtract(rho1241).divide(rho857.add(rho1241)).rename(\'NDWI\').updateMask(landMask);'
            ]);
          } else if (product === 'NDII') {
            lines = lines.concat([
              '// NDII \u2014 NEON ATBD (DOC.004364) Eq. 4: NDII = (\u03c1819 \u2212 \u03c11649) / (\u03c1819 + \u03c11649)',
              'var rho819  = getBandMean(img, 811.5, 826.5);',
              'var rho1649 = getBandMean(img, 1640.5, 1656.5);',
              'var result = rho819.subtract(rho1649).divide(rho819.add(rho1649)).rename(\'NDII\').updateMask(landMask);'
            ]);
          } else if (product === 'MSI') {
            lines = lines.concat([
              '// MSI \u2014 NEON ATBD (DOC.004364) Eq. 5: MSI = \u03c11599 / \u03c1819',
              'var rho819  = getBandMean(img, 811.5, 826.5);',
              'var rho1599 = getBandMean(img, 1591.5, 1606.5);',
              'var result = rho1599.divide(rho819).rename(\'MSI\').updateMask(landMask);'
            ]);
          } else if (product === 'Albedo') {
            // Albedo always uses HSI_REFL/001 â€” build self-contained script with embedded constants
            var albedoPaletteStr = JSON.stringify(vis.palette);
            var albedoLines = [
              (citation ? '// Citation: ' + citation : null),
              (citation ? '' : null),
              '// NEON AOP Surface Albedo \u2014 NEON.DOC.004326',
              '// Solar irradiance weighting: Thuillier (2003), convolved to NIS band centres via Gaussian',
              '// Band subset: NIS bands 10\u2013401 (~430\u20132440 nm), excluding noisy UV and SWIR edges',
              '// Site: ' + site + '  |  Year: ' + year,
              '',
              '// Helper: mean reflectance (0-1) across all bands in [minWl, maxWl] (used for water mask)',
              'function getBandMean(image, minWl, maxWl) {',
              '  var wlDict = image.toDictionary().select([\'WL_FWHM_B\\\\d+\']);',
              '  var keys = wlDict.keys();',
              '  var inRange = keys.map(function(key) {',
              '    key = ee.String(key);',
              '    var wl = ee.Number.parse(ee.String(wlDict.get(key)).split(\',\').get(0));',
              '    return ee.Algorithms.If(wl.gte(minWl).and(wl.lte(maxWl)), key, \'EXCLUDE\');',
              '  }).filter(ee.Filter.neq(\'item\', \'EXCLUDE\'));',
              '  var bands = inRange.map(function(k) { return ee.String(k).replace(\'WL_FWHM_\', \'\'); });',
              '  return image.select(bands).divide(10000).reduce(ee.Reducer.mean()).rename(\'band_mean\');',
              '}',
              '',
              '// Solar irradiance vector convolved to 392 NIS band centres (bands 10-401)',
              '// Units: mW cm-2 um-1',
              'var E_CONV_NIS = ee.Array([',
              '  1.650271282160394719e+02, 1.794630017135746414e+02, 1.929359516356887525e+02, 2.026858013892427834e+02, 2.064544946513590276e+02, 2.081866317678654923e+02, 2.062439551303360190e+02,',
              '  2.024629010178193482e+02, 2.069531638666528863e+02, 2.089547460934192600e+02, 1.980508346157546669e+02, 1.931686065368342327e+02, 1.978667100347372809e+02, 1.939585900786733816e+02,',
              '  1.936802703769751020e+02, 1.938394365759994002e+02, 1.837704064145841016e+02, 1.771268840531500075e+02, 1.835063085475040339e+02, 1.854273715089803147e+02, 1.879489738072874445e+02,',
              '  1.850738805163688880e+02, 1.860570492220202539e+02, 1.870366395286923762e+02, 1.857137218784827724e+02, 1.797042734261003716e+02, 1.789309384871939130e+02, 1.788344529827337794e+02,',
              '  1.806603061931229206e+02, 1.797836339789159581e+02, 1.795992249445797597e+02, 1.740150848466721243e+02, 1.758229435627229691e+02, 1.744244723204684533e+02, 1.732310933179095400e+02,',
              '  1.703115213058718211e+02, 1.659862112815920057e+02, 1.655104475526865144e+02, 1.648549029990095391e+02, 1.647565871637505666e+02, 1.630271814503140888e+02, 1.615395252755717195e+02,',
              '  1.592243342017944485e+02, 1.578598934352210392e+02, 1.509612397592067907e+02, 1.504692379974273138e+02, 1.530970211453305012e+02, 1.516402271358592486e+02, 1.493240130653108508e+02,',
              '  1.477537292049484279e+02, 1.460819250548289574e+02, 1.464228706257249826e+02, 1.454276905584594886e+02, 1.439381237845170176e+02, 1.428626868214669514e+02, 1.400308265201580298e+02,',
              '  1.372925158928031806e+02, 1.356269070084709654e+02, 1.344771767964045637e+02, 1.324959337308964962e+02, 1.314218539833641159e+02, 1.280344721985259469e+02, 1.280409196426045071e+02,',
              '  1.272687795747461195e+02, 1.266702090199374027e+02, 1.258481220371638187e+02, 1.240274642963611882e+02, 1.225177673002387166e+02, 1.196234762081260641e+02, 1.166424820478065101e+02,',
              '  1.156222305011885823e+02, 1.146273137858508164e+02, 1.125636922281381089e+02, 1.124090422087441539e+02, 1.113505865325294479e+02, 1.105378773816180313e+02, 1.101697217884907758e+02,',
              '  1.073183816923224612e+02, 1.067287250547729514e+02, 1.055438203977159048e+02, 1.035512145191637927e+02, 1.028051140457616270e+02, 1.011519951786459188e+02, 9.673012668526364166e+01,',
              '  9.264226827795924635e+01, 9.725517751012658607e+01, 9.548836983544548218e+01, 9.520620442954265172e+01, 9.524518279366145634e+01, 9.462175146783033597e+01, 9.309563889752809018e+01,',
              '  9.241452292576127547e+01, 9.122314358986288596e+01, 8.934018114924998599e+01, 8.873338049822343976e+01, 8.756763532869508992e+01, 8.737888629101517779e+01, 8.546596488660021862e+01,',
              '  8.367277449996475980e+01, 8.454614436805377409e+01, 8.380453022214111058e+01, 8.194746340415404973e+01, 8.109935939742700839e+01, 8.105680877338649282e+01, 7.902201544536121958e+01,',
              '  7.896217570349921289e+01, 7.793668025726447013e+01, 7.739826599408672791e+01, 7.641202802980492947e+01, 7.568387603595793678e+01, 7.494101480841720786e+01, 7.397473994291902955e+01,',
              '  7.360084901155207149e+01, 7.276589644310521976e+01, 7.075719926828483608e+01, 7.106194625107136176e+01, 7.022813206975207834e+01, 6.922150431221666622e+01, 6.909318558168114066e+01,',
              '  6.826245017249381419e+01, 6.712002255357866431e+01, 6.659399070206066540e+01, 6.587766443465493182e+01, 6.546597926623819319e+01, 6.488304230387815608e+01, 6.382236125477834321e+01,',
              '  6.327062490097414127e+01, 6.206420597643008819e+01, 6.198080189313005661e+01, 6.121047217373921256e+01, 6.045866242481028507e+01, 5.985321696970926553e+01, 5.815906033133323660e+01,',
              '  5.832466988901912686e+01, 5.836182885387955821e+01, 5.784193443906516308e+01, 5.725700727952131786e+01, 5.660789736883162959e+01, 5.576724515213269484e+01, 5.516437225446961179e+01,',
              '  5.473717545844859700e+01, 5.390603782856802439e+01, 5.388577894424905423e+01, 5.364340177570404222e+01, 5.315599834466301132e+01, 5.206998793220002852e+01, 5.167307929952985290e+01,',
              '  5.147056792111501267e+01, 5.093570248499040787e+01, 5.045606357410301257e+01, 4.993624712656259845e+01, 4.959109277999639431e+01, 4.916049222086103754e+01, 4.820789623370671251e+01,',
              '  4.801490155976777174e+01, 4.743987217038382198e+01, 4.780066113593640864e+01, 4.741347897452448734e+01, 4.682192471640978226e+01, 4.635655837945245139e+01, 4.598047492935602065e+01,',
              '  4.548428372965392441e+01, 4.510327039015672312e+01, 4.482749057952602101e+01, 4.442111973667398672e+01, 4.419710742656050684e+01, 4.381476694538512362e+01, 4.356279762034393599e+01,',
              '  4.326082258026923455e+01, 4.160669566219082327e+01, 4.155440567522126116e+01, 4.206554967236864684e+01, 4.192907063635539799e+01, 4.156555526528281774e+01, 4.116380333903529731e+01,',
              '  4.062374151145466783e+01, 3.997786222042908122e+01, 4.006269265737991248e+01, 3.971652965235278288e+01, 3.918822328921737608e+01, 3.912142277751959085e+01, 3.873152983732168764e+01,',
              '  3.856892178736585919e+01, 3.819760582749071887e+01, 3.774353946150589678e+01, 3.744351991605785202e+01, 3.715759503512735051e+01, 3.679029969233353370e+01, 3.655916663291690583e+01,',
              '  3.638379741357911001e+01, 3.613035666018929959e+01, 3.590190706417072875e+01, 3.560726500802322647e+01, 3.517511828959365516e+01, 3.496671887573391757e+01, 3.461233524004019557e+01,',
              '  3.439504541347053390e+01, 3.403226153332805382e+01, 3.351984126795458252e+01, 3.342874621084050801e+01, 3.349343552878734442e+01, 3.282695103977871298e+01, 3.270717465702476545e+01,',
              '  3.246881137477918600e+01, 3.215784027781012355e+01, 3.209357528431434758e+01, 3.177945485366366540e+01, 3.142527406150341207e+01, 3.097339806120423589e+01, 3.097540370177284075e+01,',
              '  3.052789605686702856e+01, 3.038561193967657559e+01, 3.042376123849405545e+01, 2.976231717349915940e+01, 2.890144833628411192e+01, 2.950004245343435727e+01, 2.928047086759118756e+01,',
              '  2.899445394516310870e+01, 2.880101236776953755e+01, 2.843056618041375927e+01, 2.821548300070963577e+01, 2.788619396937657768e+01, 2.784753659349075861e+01, 2.746033253909206095e+01,',
              '  2.718270806574431120e+01, 2.717576149540557751e+01, 2.689299367778141558e+01, 2.665188327511280519e+01, 2.587586958140941462e+01, 2.600128830600024088e+01, 2.559648135599845986e+01,',
              '  2.503775156709789940e+01, 2.562229929054955946e+01, 2.539671449485788557e+01, 2.505679116932746098e+01, 2.454157732431924543e+01, 2.431069406904677521e+01, 2.422068352412154013e+01,',
              '  2.444901254308650351e+01, 2.422731703835858141e+01, 2.351091661776071717e+01, 2.279657121623294813e+01, 2.294888866415028161e+01, 2.298842071490565431e+01, 2.303272478824457181e+01,',
              '  2.295257643301005857e+01, 2.256133585707047828e+01, 2.216219895353788871e+01, 2.169973636957806917e+01, 2.105265925637836943e+01, 2.136711300783277778e+01, 2.151108891005260659e+01,',
              '  2.144090497741925105e+01, 2.107592737359114921e+01, 2.078986832659458628e+01, 2.050649642454986576e+01, 2.060033060221130796e+01, 2.025221984834368882e+01, 2.005144438201552504e+01,',
              '  1.966603743331004139e+01, 1.887882067491752380e+01, 1.922056257132612700e+01, 1.924111962967824141e+01, 1.913676605997273938e+01, 1.909137516553425939e+01, 1.877683453831428295e+01,',
              '  1.858901546097600743e+01, 1.841737075039524285e+01, 1.813447366608484757e+01, 1.793971653284465972e+01, 1.786280651851418000e+01, 1.777091369975427426e+01, 1.762095814889652345e+01,',
              '  1.742849057783933731e+01, 1.730513703506624879e+01, 1.708891161613548348e+01, 1.633670232102009834e+01, 1.627443182115354148e+01, 1.661553738141614645e+01, 1.652434425539599161e+01,',
              '  1.636482417409289525e+01, 1.612953967142590983e+01, 1.589908217430995663e+01, 1.594324683135464049e+01, 1.581115143494842989e+01, 1.560602660511883855e+01, 1.539875787808963636e+01,',
              '  1.497001528496961598e+01, 1.424478331160416467e+01, 1.491033199922018682e+01, 1.492102441426940729e+01, 1.465309679914842000e+01, 1.440856310400574536e+01, 1.446681467156298240e+01,',
              '  1.434945203115844414e+01, 1.419002913982698644e+01, 1.408902334317856742e+01, 1.396939758945926258e+01, 1.383745165804353228e+01, 1.358844153221602546e+01, 1.354252214699148027e+01,',
              '  1.309897448395990693e+01, 1.266351910543527204e+01, 1.303424645243821800e+01, 1.319880861013936801e+01, 1.299573816395493786e+01, 1.285241833991318927e+01, 1.270122998169208905e+01,',
              '  1.248963645985539372e+01, 1.237049540190843366e+01, 1.229181219553565896e+01, 1.221589781361418403e+01, 1.207020273041353597e+01, 1.200508423260539459e+01, 1.191521179719435786e+01,',
              '  1.185867789123570404e+01, 1.173278188901760366e+01, 1.153979148226473761e+01, 1.145477265938085587e+01, 1.131467407981666717e+01, 1.120259029129188377e+01, 1.118570698197790847e+01,',
              '  1.115069389836490288e+01, 1.101498754681969139e+01, 1.091441366418805003e+01, 1.073824963013578504e+01, 1.067860959298920953e+01, 1.062019787975027008e+01, 1.057431571647980029e+01,',
              '  1.042018304617774049e+01, 1.035677813958737303e+01, 1.020674763357895642e+01, 1.012237591988340490e+01, 1.010859787620816697e+01, 1.004466127326725911e+01, 9.935518980373309716e+00,',
              '  9.823038498567784771e+00, 9.708673793969547106e+00, 9.638346157468721032e+00, 9.606681569220411276e+00, 9.512838881624377407e+00, 9.485733427489352110e+00, 9.421592892531540642e+00,',
              '  9.355980092180956831e+00, 9.262205984113187185e+00, 9.012647166019746692e+00, 8.662690746426411792e+00, 8.902756377101820107e+00, 8.896812162821756687e+00, 8.846348249502979044e+00,',
              '  8.781225413877777441e+00, 8.700664999849086811e+00, 8.639241430676934286e+00, 8.532411548907502308e+00, 8.359245585125254507e+00, 8.357727253166183701e+00, 8.300657782739536472e+00,',
              '  8.243018320421303002e+00, 8.147349094599377395e+00, 8.104604926202574333e+00, 8.009665129350688417e+00, 7.928474944328707252e+00, 7.869024488511085380e+00, 7.787192954566027225e+00,',
              '  7.720260567373536276e+00, 7.653905085248974949e+00, 7.608208207609318485e+00, 7.564683129378471094e+00, 7.495763680321632094e+00, 7.374248767349293132e+00, 7.351043354425163656e+00,',
              '  7.261259989024161143e+00, 7.155834958176903626e+00, 7.162282665077674082e+00, 7.125617923970958500e+00, 7.061780056618998991e+00, 6.972525585400952686e+00, 6.850858676190341612e+00,',
              '  6.775906363156108725e+00, 6.772715462056085656e+00, 6.727710697625720826e+00, 6.707219643926721986e+00, 6.655731470671780059e+00, 6.513634326942824515e+00, 6.443908457764250031e+00,',
              '  6.456680394629650266e+00, 6.422272949356701233e+00, 6.338968079970473291e+00, 6.297055179991104090e+00, 6.175530438799182953e+00, 6.059619062311526250e+00, 6.074705863602101630e+00',
              ']);',
              '// Normalization denominator \u2014 sum over full extended range (300-2397 nm)',
              'var E_SUM_FULL = 26063.107378627945;',
              '',
              '// Load ' + hsiCollLabel + ' for this site and year',
              (pairedSiteMap[site]
                ? '// Note: AOP imagery for ' + site + ' (' + (pairedSiteNames[site] || site) + ') is stored\n' +
                  '// in GEE under the NEON site ID ' + pairedSiteMap[site] + '.'
                : null),
              'var collection = ee.ImageCollection(\'' + hsiCollPath + '\')',
              '  .filter(ee.Filter.eq(\'NEON_SITE\', \'' + (pairedSiteMap[site] || site) + '\'))',
              '  .filter(ee.Filter.eq(\'FLIGHT_YEAR\', ' + year + '));',
              '',
              '// Compute surface albedo per tile, then mosaic.',
              '// Processing per tile preserves WL_FWHM_B* wavelength properties that getBandMean requires.',
              'var result = collection.map(function(img) {',
              '  // Water mask: NIR (~850 nm) < 0.01 AND SWIR (~1600 nm) < 0.005 = water',
              '  var nirW  = getBandMean(img, 845, 855);',
              '  var swirW = getBandMean(img, 1595, 1605);',
              '  var landMask = nirW.lt(0.01).and(swirW.lt(0.005)).not();',
              '  // Irradiance-weighted surface albedo (bands 10-401, ~430-2440 nm)',
              '  var bandNames = img.bandNames()',
              '    .filter(ee.Filter.stringContains(\'item\', \'B\'))',
              '    .slice(10, 402);',
              '  var refl = img.select(bandNames).divide(10000);',
              '  var weights = ee.Image.constant(E_CONV_NIS.toList());',
              '  return refl.multiply(weights).reduce(ee.Reducer.sum())',
              '    .divide(E_SUM_FULL)',
              '    .rename(\'Albedo\')',
              '    .updateMask(landMask)',
              '    .clamp(0, 1);',
              '}).mosaic();'
            ].filter(function(l) { return l !== null; });

            displaySampleScript(albedoLines.concat([
              '',
              '// Add the layer to the map and center on the site',
              'Map.addLayer(result, {min: ' + vis.min + ', max: ' + vis.max + ', palette: ' + albedoPaletteStr + '}, \'' + site + ' ' + year + ' Albedo\');',
              'Map.centerObject(collection);'
            ]).join('\n'));
            return;
          }

          lines = lines.concat([
            '',
            '// Define the visualization parameters',
            '// Add the layer to the map and center on the site',
            'Map.addLayer(result, {min: ' + vis.min + ', max: ' + vis.max + ', palette: ' + paletteStr + '}, \'' + site + ' ' + year + ' ' + product + '\');',
            'Map.centerObject(img);'
          ]);

        displaySampleScript(lines.join('\n'));
      });
      return;
    }

    // Handle Derived Terrain Products â€” script uses DEM tile directly (no HSI reference needed)
    if (selectedCollection === 'Derived Terrain Products (from DP3.30024.001)') {
      var demColl = imageCollections[selectedCollection];
      var demImg = demColl.filter(ee.Filter.eq('system:index', select1.getValue())).first();
      demImg.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR'];
        var citation = props['CITATION'] || null;
        var product = currentTerrainProduct;
        var vis = DERIVED_VIS[product];
        var paletteStr = JSON.stringify(vis.palette);
        var site = neonSiteSelect.getValue();
        var idx  = select1.getValue();
        var terrainBandMap = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};

        var lines = [
          (citation ? '// Citation: ' + citation : null),
          (citation ? '' : null),
          '// NEON AOP Derived Terrain ' + product + ' \u2014 generated by AOP GEE Data Viewer',
          '// Source: Derived Terrain Products (from DP3.30024.001)',
        ].filter(function(l) { return l !== null; }).concat([
          '// Site: ' + site + '  |  Year: ' + year + '  |  DEM Tile: ' + idx,
          '',
          '// Read the NEON AOP Digital Elevation Model tile from DEM/001',
          'var demImage = ee.ImageCollection(\'projects/neon-prod-earthengine/assets/DEM/001\')',
          '  .filter(ee.Filter.eq(\'system:index\', \'' + idx + '\')).first();',
          '',
          '// Compute terrain derivatives from the DTM band',
          'var result = ee.Terrain.products(demImage.select(\'DTM\'))',
          '  .select(\'' + terrainBandMap[product] + '\')',
          '  .rename(\'' + product + '\');',
          '',
          '// Define the visualization parameters',
          '// Add the layer to the map and center on the tile',
          'Map.addLayer(result, {min: ' + vis.min + ', max: ' + vis.max + ', palette: ' + paletteStr + '}, \'' + site + ' ' + year + ' ' + product + '\');',
          'Map.centerObject(demImage);'
        ]);

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
    if (selectedCollection === "Digital Surface Model (DP3.30024.001)") {
      var dynamicParams = applyManualOverride(1, getDynamicDSMVisParams(selectedImage));
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var visParamsString = '{bands: [\'DSM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'000000\', \'FFFFFF\']}';
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        displaySampleScript(sampleScript);
      });
    } else if (selectedCollection === "Digital Terrain Model (DP3.30024.001)") {
      var dynamicParams = applyManualOverride(1, getDynamicDTMVisParams(selectedImage));
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var visParamsString = '{bands: [\'DTM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'000000\', \'FFFFFF\']}';
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        displaySampleScript(sampleScript);
      });
    } else if (selectedCollection === "Canopy Height Model (DP3.30015.001)") {
      var dynamicParams = applyManualOverride(1, getDynamicCHMVisParams(selectedImage));
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR'];
        var citation = props['CITATION'] || null;
        var visParamsString = '{bands: [\'CHM\'], min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', palette: [\'E6F7E0\', \'063B00\']}';
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) {
          sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        }
        displaySampleScript(sampleScript);
      });
    } else if (selectedCollection === "Canopy Nitrogen Content (DP3.30018.002)") {
      var dynamicParams = applyManualOverride(1, getNitrogenVisParams(selectedImage, 1));
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var visParamsString;
        var selectedBand = currentNitrogenBand1;
        
        if (selectedBand === 'Canopy Nitrogen Model Uncertainty') {
          visParamsString = '{bands: [\'Nitrogen_Uncertainty\'], min: ' + dynamicParams.min.toFixed(2) + ', max: ' + dynamicParams.max.toFixed(2) + ', palette: [\'#0d0887\', \'#7e03a8\', \'#cc4778\', \'#f89540\', \'#f0f921\']}';
        } else if (selectedBand === 'Needle Leaf/Non-Needle Leaf Classification') {
          visParamsString = '{bands: [\'Needle_Non-needle_Classification\'], min: ' + dynamicParams.min.toFixed(0) + ', max: ' + dynamicParams.max.toFixed(0) + ', palette: [\'olive\', \'green\']}';
        } else {
          visParamsString = '{bands: [\'Nitrogen_Percent\'], min: ' + dynamicParams.min.toFixed(2) + ', max: ' + dynamicParams.max.toFixed(2) + ', palette: [\'#440154\', \'#3b528b\', \'#21908c\', \'#5dc963\', \'#fde725\']}';
        }
        
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        displaySampleScript(sampleScript);
      });
    } else if (selectedCollection === "RGB Camera Photography (DP3.30010.001)") {
      // Use current vis params (min, max, gamma), including any manual override
      // applied via the Universal Image Display Adjustments panel for the 1st Image.
      var dynamicParams = applyManualOverride(1, visParamsRGB);
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var visParamsString = '{min: ' + dynamicParams.min + ', max: ' + dynamicParams.max + ', bands: [\'R\',\'G\',\'B\'], gamma: ' + dynamicParams.gamma + '}';
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        displaySampleScript(sampleScript);
      });
    } else if (selectedCollection === "Spectrometer Directional Reflectance (DP3.30006.001)" ||
               selectedCollection === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
      // Use current vis params (bands, min, max, gamma) from the viewer UI,
      // including any manual override applied for the 1st Image.
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var vp = applyManualOverride(1, currentVisParams);
        var bandsStr = "['" + vp.bands.join("','") + "']";
        var visParamsString = '{min: ' + vp.min + ', max: ' + vp.max + ', bands: ' + bandsStr + ', gamma: ' + vp.gamma + '}';
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year, visParamsString);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
        displaySampleScript(sampleScript);
      });
    } else {
      // For other collections, use template defaults
      selectedImage.toDictionary(['FLIGHT_YEAR', 'CITATION']).evaluate(function(props) {
        var year = props['FLIGHT_YEAR']; var citation = props['CITATION'] || null;
        var sampleScript = generateScriptContent(template, selectedSite, selectedImageIndex, year);
        if (citation) sampleScript = '// Citation: ' + citation + '\n\n' + sampleScript;
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
      // For paired alias sites, add a note explaining why the index contains the primary site ID
      (pairedSiteMap[site]
        ? '// Note: AOP imagery for ' + site + ' (' + (pairedSiteNames[site] || site) + ') is stored\n' +
          '// in GEE under the NEON site ID ' + pairedSiteMap[site] + '.'
        : null),
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
    
    return scriptLines.filter(function(l) { return l !== null; }).join('\n');
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
    var col1val = selectCollection1.getValue();
    var isDerivedExport = (col1val === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)' ||
                           col1val === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)' ||
                           col1val === 'Derived Terrain Products (from DP3.30024.001)');
    if (isDerivedExport) {
      var activeProduct1 = (col1val === 'Derived Terrain Products (from DP3.30024.001)') ? currentTerrainProduct : currentDerivedProduct;

      // Surface Albedo cannot be exported — the multi-band weighted sum exceeds GEE's per-user
      // memory limit even for small areas. Use the generated sample script to export instead.
      if (activeProduct1 === 'Albedo') {
        var albedoExportMsg = ui.Panel({
          widgets: [
            ui.Label('Surface Albedo export not supported', {fontWeight: 'bold', color: 'red'}),
            ui.Label(
              'The on-the-fly computation of 392 weighted bands exceeds the GEE Export-to-GeoTIFF capability. ' +
              'To export Surface Albedo as a GeoTIFF, use the "Sample Script" button to generate ' +
              'a standalone GEE script, then run and export it from the Code Editor.',
              {fontSize: '11px', color: '#333333', whiteSpace: 'wrap'}
            )
          ],
          style: {position: 'top-center', padding: '10px', backgroundColor: 'white', border: '2px solid red'}
        });
        var albedoMsgClose = ui.Button({
          label: 'Close',
          onClick: function() { Map.remove(albedoExportMsg); },
          style: {margin: '5px 0 0 0', fontSize: '10px'}
        });
        albedoExportMsg.add(albedoMsgClose);
        Map.add(albedoExportMsg);
        return;
      }
      var terrainBandMapExport = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};
      if (terrainBandMapExport.hasOwnProperty(activeProduct1)) {
        // For Derived Terrain Products, image IS the DEM tile â€” compute terrain directly
        selectedImage1 = ee.Terrain.products(selectedImage1.select('DTM'))
          .select(terrainBandMapExport[activeProduct1]).rename(activeProduct1);
      } else {
        var viBands = vi_precompute(selectedImage1);
        if      (activeProduct1 === 'NDVI') selectedImage1 = vi_ndvi(viBands);
        else if (activeProduct1 === 'EVI')  selectedImage1 = vi_evi(viBands);
        else if (activeProduct1 === 'ARVI') selectedImage1 = vi_arvi(viBands);
        else if (activeProduct1 === 'PRI')  selectedImage1 = vi_pri(viBands);
        else if (activeProduct1 === 'SAVI') selectedImage1 = vi_savi(viBands);
        else if (activeProduct1 === 'LAI')  selectedImage1 = vi_lai(viBands);
        else if (activeProduct1 === 'fPAR') selectedImage1 = vi_fpar(viBands);
        // Water indices
        else if (activeProduct1 === 'WBI')  selectedImage1 = wi_wbi(selectedImage1,  viBands.water);
        else if (activeProduct1 === 'NMDI') selectedImage1 = wi_nmdi(selectedImage1, viBands.water);
        else if (activeProduct1 === 'NDWI') selectedImage1 = wi_ndwi(selectedImage1, viBands.water);
        else if (activeProduct1 === 'NDII') selectedImage1 = wi_ndii(selectedImage1, viBands.water);
        else if (activeProduct1 === 'MSI')  selectedImage1 = wi_msi(selectedImage1,  viBands.water);
        // Surface Albedo  computed from whichever reflectance collection is selected
        else if (activeProduct1 === 'Albedo') {
          selectedImage1 = computeAlbedo(selectedImage1, vi_getWaterMask(selectedImage1));
        }
      }
    }

    // Apply cloud filter if needed
    if (cloudFilterSelect.getValue() === '< 10% Cloud Cover') {
      if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || 
          selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
        selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').eq(1));
      }
    } else if (cloudFilterSelect.getValue() === '< 50% Cloud Cover') {
      if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || 
          selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
        selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').gte(1).and(selectedImage1.select('Weather_Quality_Indicator').lte(2)));
      }
    }
    
    // Apply NaN masking for DSM/DTM if needed
    if (selectCollection1.getValue() === "Digital Surface Model (DP3.30024.001)" || 
        selectCollection1.getValue() === "Digital Terrain Model (DP3.30024.001)") {
      selectedImage1 = maskNaN(selectedImage1);
    }
    
    // Apply nitrogen masking if needed
    if (selectCollection1.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
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
      
      print('Export area: ' + (areaMeters / 1000000).toFixed(2) + ' kmÂ²');
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
        var dVis = DERIVED_VIS[activeProduct1];
        exportVisParams = {min: dVis.min, max: dVis.max, palette: dVis.palette};
        exportVisParams.forceRgbOutput = true;
      } else if (selectCollection1.getValue() === "Digital Surface Model (DP3.30024.001)") {
        exportVisParams = getDynamicDSMVisParams(selectedImage1);
        exportVisParams.forceRgbOutput = true;
      } else if (selectCollection1.getValue() === "Digital Terrain Model (DP3.30024.001)") {
        exportVisParams = getDynamicDTMVisParams(selectedImage1);
        exportVisParams.forceRgbOutput = true;
      } else if (selectCollection1.getValue() === "Canopy Height Model (DP3.30015.001)") {
        exportVisParams = getDynamicCHMVisParams(selectedImage1);
        exportVisParams.forceRgbOutput = true;
      } else if (selectCollection1.getValue() === "RGB Camera Photography (DP3.30010.001)") {
        exportVisParams = visParamsRGB;
      } else if (selectCollection1.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
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

  var versionLabel = ui.Label({
    value: 'v10.5  |  July 2026',
    style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '4px 0 0 0', textAlign: 'center', stretch: 'horizontal'}
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

  // Create a horizontal panel for the Vegetation Phenology link (centered row)
  var URLhorizontalPanel4 = ui.Panel({
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

  // Create a label with a hyperlink to the AOP GEE Tutorial Series
  var linkLabelTutorial = ui.Label({
    value: 'AOP Data in GEE Tutorial Series',
    style: {color: 'blue', textDecoration: 'underline', fontSize: '10px', fontWeight: 'bold'},
    targetUrl: 'https://www.neonscience.org/resources/learning-hub/tutorials/intro-aop-data-google-earth-engine-gee-tutorial-series'
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
    value: 'Vegetation Phenology During Flights', 
    style: {color: 'blue', textDecoration: 'underline', fontSize: '10px', fontWeight: 'bold', },
    targetUrl: 'https://phenoflight.neonscience.org/'
  });

  var URLspacerRight = ui.Label({
    value: ' ',
    style: {stretch: 'horizontal'}
  });

  // Row 1: NEON Data Portal (left) + AOP Tutorial (right)
  URLhorizontalPanel1.add(URLspacerLeft);
  URLhorizontalPanel1.add(linkLabel);
  URLhorizontalPanel1.add(linkLabelTutorial);
  URLhorizontalPanel1.add(URLspacerRight);

  // Row 2 (new): Vegetation Phenology centered
  var URLspacerLeft4 = ui.Label({value: ' ', style: {stretch: 'horizontal'}});
  var URLspacerRight4 = ui.Label({value: ' ', style: {stretch: 'horizontal'}});
  URLhorizontalPanel4.add(URLspacerLeft4);
  URLhorizontalPanel4.add(phenoFlightLinkLabel);
  URLhorizontalPanel4.add(URLspacerRight4);

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

  // Floating Hide/Show toggle for the ancillary layers (right) panel - lets
  // users free up space if the spectral plot panel overlaps it on small screens.
  // Added to Map BEFORE rightPanel (and never removed) so it always stays the
  // topmost widget in the top-right stack, regardless of hide/show toggling -
  // otherwise re-adding rightPanel on "show" would push it below the button.
  var isRightPanelVisible = true;
  var rightPanelToggleButton = ui.Button({
    label: 'Hide Right Panel',
    style: {
      position: 'top-right',
      margin: '0 0 0 0',
      padding: '2px',
      fontSize: '8px',
      color: 'blue'
    },
    onClick: function() {
      if (isRightPanelVisible) {
        Map.remove(rightPanel);
        rightPanelToggleButton.setLabel('Show Right Panel');
      } else {
        Map.add(rightPanel);
        rightPanelToggleButton.setLabel('Hide Right Panel');
      }
      isRightPanelVisible = !isRightPanelVisible;
    }
  });
  Map.add(rightPanelToggleButton);

  Map.add(rightPanel);

  // Define the checkbox for the TOS boundary

  var checkboxList = {
    'NEON Tower': ui.Checkbox({
      label: 'NEON Tower or Aquatic site',
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
      // Flightboxes are keyed to the primary site ID; resolve alias sites via pairedSiteMap
      var flightboxSite = pairedSiteMap[selectedSite] || selectedSite;
      // Filter flightboxes by site using 'Site' field
      var filteredFeatures = neonFlightboxBoundaries.filter(ee.Filter.eq('Site', flightboxSite));
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
    var isCNCSelected = (collection1 && String(collection1).indexOf('DP3.30018.002') !== -1) || 
                        (collection2 && String(collection2).indexOf('DP3.30018.002') !== -1);
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
    LAI:       {unit: '',  decimals: 1},
    fPAR:      {unit: '',  decimals: 2},
    Slope:     {unit: '\u00b0', decimals: 0},  // Â°
    Aspect:    {unit: '\u00b0', decimals: 0},
    Hillshade: {unit: '',  decimals: 0},
    WBI:  {unit: '', decimals: 3},
    NMDI: {unit: '', decimals: 3},
    NDWI: {unit: '', decimals: 3},
    NDII: {unit: '', decimals: 3},
    MSI:  {unit: '', decimals: 3},
    Albedo: {unit: '', decimals: 2}
  };

  var derivedLegendPanel1 = ui.Panel({
    style: {
      width: '250px',
      padding: '10px',
      position: 'bottom-left',
      shown: false,
      backgroundColor: 'white'
    }
  });
  Map.add(derivedLegendPanel1);

  var derivedLegendPanel2 = ui.Panel({
    style: {
      width: '250px',
      padding: '10px',
      position: 'bottom-left',
      shown: false,
      backgroundColor: 'white'
    }
  });
  Map.add(derivedLegendPanel2);

  // createDerivedLegend builds the colour-bar legend for a derived product in the
  // specified image slot (1 or 2) and returns {min, max} label widget refs so the
  // caller's async evaluate() callback can update them without stomping the other slot.
  function createDerivedLegend(productName, slotNum) {
    var panel = (slotNum === 2) ? derivedLegendPanel2 : derivedLegendPanel1;
    panel.clear();
    var vis  = DERIVED_VIS[productName];
    var meta = DERIVED_LEGEND_META[productName];

    panel.add(ui.Label({
      value: productName,
      style: {fontWeight: 'bold', fontSize: '13px', textAlign: 'center',
              stretch: 'horizontal', margin: '0 0 8px 0'}
    }));

    panel.add(ui.Thumbnail({
      image: ee.Image.pixelLonLat().select(0),
      params: makeColorBarParams(vis.palette),
      style: {stretch: 'horizontal', margin: '0px 8px', maxHeight: '24px'}
    }));

    var fmt = function(val) { return val.toFixed(meta.decimals) + meta.unit; };
    var minLabel = ui.Label(fmt(vis.min), {margin: '4px 8px'});
    var maxLabel = ui.Label(fmt(vis.max), {margin: '4px 8px', textAlign: 'right', stretch: 'horizontal'});
    panel.add(ui.Panel({
      widgets: [minLabel, maxLabel],
      layout: ui.Panel.Layout.flow('horizontal')
    }));
    panel.style().set('shown', true);
    return {min: minLabel, max: maxLabel};
  }

  function updateDerivedLegendVisibility() {
    var c1 = selectCollection1.getValue();
    var c2 = selectCollection2.getValue();
    var isDerivedColl = function(col) {
      return col && (String(col).indexOf('Derived Indices') !== -1 || col === 'Derived Terrain Products (from DP3.30024.001)');
    };
    if (isDerivedColl(c1)) {
      var p1 = (c1 === 'Derived Terrain Products (from DP3.30024.001)') ? currentTerrainProduct : currentDerivedProduct;
      createDerivedLegend(p1, 1);
    } else {
      derivedLegendPanel1.style().set('shown', false);
    }
    if (isDerivedColl(c2)) {
      var p2 = (c2 === 'Derived Terrain Products (from DP3.30024.001)') ? currentTerrainProduct : currentDerivedProduct;
      createDerivedLegend(p2, 2);
    } else {
      derivedLegendPanel2.style().set('shown', false);
    }
  }

  // Function to manage nitrogen continuous legend visibility
  function updateNitrogenContinuousLegendsVisibility() {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    var isCNC1 = collection1 && String(collection1).indexOf('DP3.30018.002') !== -1;
    var isCNC2 = collection2 && String(collection2).indexOf('DP3.30018.002') !== -1;
    
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

  // Function to update nitrogen legend labels with actual image min/max values
  function updateNitrogenLegendLabels() {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    var isCNC1 = collection1 && String(collection1).indexOf('DP3.30018.002') !== -1;
    var isCNC2 = collection2 && String(collection2).indexOf('DP3.30018.002') !== -1;
    
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
    
    // Use actual min/max for legend labels (stretch stays at percentile values)
    var minVal, maxVal;
    var hasActualValues = false;
    
    if (showingPercentN1 && showingPercentN2) {
      var a1 = nitrogenActualMinMax.image1, a2 = nitrogenActualMinMax.image2;
      if (a1.min !== null && a2.min !== null) {
        minVal = Math.min(a1.min, a2.min);
        maxVal = Math.max(a1.max, a2.max);
        hasActualValues = true;
      }
    } else if (showingPercentN1) {
      var a1 = nitrogenActualMinMax.image1;
      if (a1.min !== null) { minVal = a1.min; maxVal = a1.max; hasActualValues = true; }
    } else if (showingPercentN2) {
      var a2 = nitrogenActualMinMax.image2;
      if (a2.min !== null) { minVal = a2.min; maxVal = a2.max; hasActualValues = true; }
    }
    
    if (hasActualValues) {
      percentNMinLabel.setValue(minVal.toFixed(1) + '%');
      percentNMaxLabel.setValue(maxVal.toFixed(1) + '%');
    }
  }

  // Function to update uncertainty legend labels with actual image min/max values
  function updateUncertaintyLegendLabels() {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    var isCNC1 = collection1 && String(collection1).indexOf('DP3.30018.002') !== -1;
    var isCNC2 = collection2 && String(collection2).indexOf('DP3.30018.002') !== -1;
    
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
    
    // Use actual min/max for legend labels (stretch stays at mean Â± 2Ïƒ)
    var minVal, maxVal;
    var hasActualValues = false;

    if (showingUncertainty1 && showingUncertainty2) {
      var u1 = uncertaintyActualMinMax.image1, u2 = uncertaintyActualMinMax.image2;
      if (u1.min !== null && u2.min !== null) {
        minVal = Math.min(u1.min, u2.min);
        maxVal = Math.max(u1.max, u2.max);
        hasActualValues = true;
      }
    } else if (showingUncertainty1) {
      var u1 = uncertaintyActualMinMax.image1;
      if (u1.min !== null) { minVal = u1.min; maxVal = u1.max; hasActualValues = true; }
    } else if (showingUncertainty2) {
      var u2 = uncertaintyActualMinMax.image2;
      if (u2.min !== null) { minVal = u2.min; maxVal = u2.max; hasActualValues = true; }
    }
    
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
      updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    },
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'}//, width: '100%', margin: '10px 0'}
  });

  // Add the checkbox to the right panel
  rightPanel.add(nlcdCheckbox);

  // MODIS EVI checkbox â€” appears below NLCD in the ancillary panel
  var modisEviCheckbox = ui.Checkbox({
    label: 'MODIS EVI (closest to 1st image flight date)',
    value: false,
    onChange: function(checked) {
      modisEviVisible = checked;
      if (!checked) modisEviDateLabel.setValue('');
      updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    },
    style: {color: 'black', fontSize: '11px', fontWeight: 'bold'}
  });
  rightPanel.add(modisEviCheckbox);

  // Label updated asynchronously with the matched composite date
  var modisEviDateLabel = ui.Label({
    value: '',
    style: {fontSize: '10px', color: '#555555', margin: '-2px 0 4px 20px', fontStyle: 'italic'}
  });
  rightPanel.add(modisEviDateLabel);

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

  // ----------------------------
  // Universal Image Display Adjustments (Min/Max/Gamma) - state & helpers
  // ----------------------------
  // Applies an in-app "gear icon" style stretch/gamma override to whichever image
  // (1st or 2nd) the user selects via the panel's radio buttons, regardless of the
  // image's collection/product type. Overrides are stored per-slot and keyed to the
  // specific sub-type currently active in that slot (band combo / nitrogen band /
  // derived product) so a stale override is never silently applied after the user
  // switches to a different sub-type in the same slot.
  var manualOverrides = {1: null, 2: null};        // {key, min, max, gamma} or null
  var universalAdjustSlot = 1;                     // which slot (1 or 2) the panel currently edits
  var naturalVisParamsBySlot = {1: null, 2: null};  // pre-override vis params, refreshed by updateMap
  var effectiveVisParamsBySlot = {1: null, 2: null}; // post-override (as-displayed) vis params

  function isReflCollection(col) {
    return col === 'Spectrometer Directional Reflectance (DP3.30006.001)' ||
           col === 'Spectrometer Bidirectional Reflectance (DP3.30006.002)';
  }
  function isRGBCollection(col) { return col === 'RGB Camera Photography (DP3.30010.001)'; }
  function isDSMCollection(col) { return col === 'Digital Surface Model (DP3.30024.001)'; }
  function isDTMCollection(col) { return col === 'Digital Terrain Model (DP3.30024.001)'; }
  function isCHMCollection(col) { return col === 'Canopy Height Model (DP3.30015.001)'; }
  function isNitrogenCollection(col) { return !!col && String(col).indexOf('DP3.30018.002') !== -1; }
  function isDerivedIndicesCollection(col) {
    return col === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)' ||
           col === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)';
  }
  function isDerivedTerrainCollection(col) { return col === 'Derived Terrain Products (from DP3.30024.001)'; }

  // Mirrors the band-selector fallback logic in getNitrogenVisParams: when both
  // slots are CNC, each slot has its own band selector; when only one is CNC, the
  // always-visible selector (currentNitrogenBand1) governs regardless of slot.
  function getEffectiveNitrogenBand(slot) {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    if (isNitrogenCollection(collection1) && isNitrogenCollection(collection2)) {
      return (slot === 1) ? currentNitrogenBand1 : currentNitrogenBand2;
    }
    return currentNitrogenBand1;
  }

  // Returns a string uniquely identifying the "sub-type" currently active in a
  // slot, so an override computed for e.g. NDVI doesn't get silently re-applied
  // after the user switches to EVI in the same slot. Returns null if no image/
  // collection is active in that slot.
  function getOverrideKey(slot) {
    var col = (slot === 1) ? selectCollection1.getValue() : selectCollection2.getValue();
    if (!col) return null;
    if (isReflCollection(col)) return col + '|' + visParamsSelect.getValue();
    if (isNitrogenCollection(col)) return col + '|' + getEffectiveNitrogenBand(slot);
    if (isDerivedIndicesCollection(col)) return col + '|' + currentDerivedProduct;
    if (isDerivedTerrainCollection(col)) return col + '|' + currentTerrainProduct;
    return col; // RGB, DSM, DTM, CHM - one sub-type per collection
  }

  // Merges the active manual override (if any, and if it still matches the
  // slot's current sub-type) on top of a "natural" (computed default) vis params
  // object. Only min/max/gamma are overridden; bands/palette are left untouched.
  function applyManualOverride(slot, natural) {
    var key = getOverrideKey(slot);
    var ov = manualOverrides[slot];
    if (ov && key && ov.key === key) {
      var merged = {};
      for (var k in natural) { if (natural.hasOwnProperty(k)) merged[k] = natural[k]; }
      merged.min = ov.min;
      merged.max = ov.max;
      // GEE's Image.visualize() throws "Cannot provide both a gamma function and
      // a fixed color palette" if both keys are set - only carry gamma through
      // for types whose natural vis params already have it (Reflectance/RGB,
      // which have no palette). Palette-based types (DSM/DTM/CHM/Nitrogen/
      // Derived Indices/Terrain/Albedo) keep the Min/Max override but never
      // get a gamma key added.
      if (natural.gamma !== undefined) { merged.gamma = ov.gamma; }
      return merged;
    }
    return natural;
  }

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
  // Actual (true) image min/max â€” used for legend label display only;
  // vis params (color stretch) continue to use the percentile-based values above.
  var nitrogenActualMinMax = {
    image1: {min: null, max: null},
    image2: {min: null, max: null}
  };
  var uncertaintyActualMinMax = {
    image1: {min: null, max: null},
    image2: {min: null, max: null}
  };

  // Function to toggle second nitrogen band selector visibility
  function updateNitrogenSelector2Visibility() {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    
    // Check which images are CNC collections
    var image1IsCNC = collection1 && String(collection1).indexOf('DP3.30018.002') !== -1;
    var image2IsCNC = collection2 && String(collection2).indexOf('DP3.30018.002') !== -1;
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
    style: {width: '100%', margin: '10px 0 0 0'}
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
    style: {width: '100%', margin: '10px 0 0 0', shown: false}
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
    style: {shown: false, width: '100%', padding: '0 0 13px 0'}
  });

  mainPanel.add(nitrogenOptionsPanel);

  // ----------------------------
  // Derived Indices/Terrain Products Panel (Dynamic)
  // Appears only when "Derived Indices/Terrain Products" collection is selected.
  // Radio-button behavior simulated with mutually exclusive checkboxes.
  // ----------------------------

  var currentDerivedProduct = 'NDVI';  // Active product for HSI-based (index) collections
  var currentTerrainProduct = 'Slope'; // Active product for Derived Terrain Products collection
  var derivedCheckboxes = {};          // Registry for index mutual-exclusion
  var terrainCheckboxes = {};          // Registry for terrain mutual-exclusion (independent)

  // Factory: index checkboxes â€” mutual exclusion within derivedCheckboxes only.
  function makeDerivedCheckbox(productName, displayLabel) {
    var cb = ui.Checkbox({
      label: displayLabel !== undefined ? displayLabel : productName,
      value: productName === 'NDVI',
      onChange: function(checked) {
        if (checked) {
          currentDerivedProduct = productName;
          Object.keys(derivedCheckboxes).forEach(function(key) {
            if (key !== productName) derivedCheckboxes[key].setValue(false, false);
          });
          updateMap(select1.getValue(), select2.getValue(), currentVisParams);
        } else {
          derivedCheckboxes[productName].setValue(true, false);
        }
      },
      style: {fontSize: '11px', fontWeight: 'bold', color: 'black', margin: '2px 0'}
    });
    derivedCheckboxes[productName] = cb;
    return cb;
  }

  // Factory: terrain checkboxes â€” mutual exclusion within terrainCheckboxes only.
  function makeTerrainCheckbox(productName) {
    var cb = ui.Checkbox({
      label: productName,
      value: productName === 'Slope',
      onChange: function(checked) {
        if (checked) {
          currentTerrainProduct = productName;
          Object.keys(terrainCheckboxes).forEach(function(key) {
            if (key !== productName) terrainCheckboxes[key].setValue(false, false);
          });
          updateMap(select1.getValue(), select2.getValue(), currentVisParams);
        } else {
          terrainCheckboxes[productName].setValue(true, false);
        }
      },
      style: {fontSize: '11px', fontWeight: 'bold', color: 'black', margin: '2px 0'}
    });
    terrainCheckboxes[productName] = cb;
    return cb;
  }

  // Indices split across columns to avoid the GEE layout-engine clipping bug
  // (>4 items in a single vertical panel may be clipped).
  var viProductNames   = ['NDVI', 'EVI', 'ARVI', 'PRI', 'SAVI'];
  var viProductNames2  = ['LAI', 'fPAR'];
  var wiProductNames   = ['WBI', 'NMDI', 'NDWI', 'NDII', 'MSI'];
  var radioProductNames = ['Albedo'];  // Radiometric products column
  var topoProductNames = ['Slope', 'Aspect', 'Hillshade'];

  // Column 1: vegetation indices (25% width â€” 4-column layout)
  var derivedViColumn = ui.Panel({
    widgets: [
      ui.Label({value: 'Veg. Indices',
                style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0',
                        textDecoration: 'underline'},
                targetUrl: 'https://data.neonscience.org/data-products/DP3.30026.002'})
    ].concat(viProductNames.map(function(n) { return makeDerivedCheckbox(n); }))
    .concat([ui.Label({value: '', style: {margin: '0', height: '13px'}})]),
    layout: ui.Panel.Layout.flow('vertical'),
    style: {width: '25%'}
  });

  // Column 2: biophysical indices (25% width)
  var derivedViColumn2 = ui.Panel({
    widgets: [
      ui.Label({value: 'Biophysical',
                style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0',
                        textDecoration: 'underline'},
                targetUrl: 'https://data.neonscience.org/data-products/DP3.30012.002'})
    ].concat(viProductNames2.map(function(n) { return makeDerivedCheckbox(n); }))
    .concat([ui.Label({value: '', style: {margin: '0', height: '13px'}})]),
    layout: ui.Panel.Layout.flow('vertical'),
    style: {width: '25%'}
  });

  // Column 3: water indices (25% width)
  var derivedWiColumn = ui.Panel({
    widgets: [
      ui.Label({value: 'Water Indices',
                style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0',
                        textDecoration: 'underline'},
                targetUrl: 'https://data.neonscience.org/data-products/DP3.30019.002'})
    ].concat(wiProductNames.map(function(n) { return makeDerivedCheckbox(n); }))
    .concat([ui.Label({value: '', style: {margin: '0', height: '13px'}})]),
    layout: ui.Panel.Layout.flow('vertical'),
    style: {width: '25%'}
  });

  // Column 4: radiometric products â€” Albedo (25% width)
  var derivedRadioColumn = ui.Panel({
    widgets: [
      ui.Label({value: 'Radiometric',
                style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '0 0 2px 0',
                        textDecoration: 'underline'},
                targetUrl: 'https://data.neonscience.org/data-products/DP3.30011.001'})
    ].concat(radioProductNames.map(function(n) {
      var RADIO_DISPLAY_NAMES = {'Albedo': 'Surface Albedo'};
      return makeDerivedCheckbox(n, RADIO_DISPLAY_NAMES[n]);
    }))
    .concat([ui.Label({value: '', style: {margin: '0', height: '13px'}})]),
    layout: ui.Panel.Layout.flow('vertical'),
    style: {width: '25%'}
  });

  // Terrain columns â€” one per product, each 33% wide, in the separate derivedTerrainPanel
  var derivedTopoColumns = topoProductNames.map(function(n) {
    return ui.Panel({
      widgets: [makeTerrainCheckbox(n)],
      layout: ui.Panel.Layout.flow('vertical'),
      style: {width: '33%'}
    });
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
                value: 'Derived Indices',
                style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
              })
            ]),
            ui.Label({value: ' ', style: {stretch: 'horizontal'}})
          ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
        ]
      }),
      ui.Panel({
        widgets: [derivedViColumn, derivedViColumn2, derivedWiColumn, derivedRadioColumn],
        layout: ui.Panel.Layout.flow('horizontal'),
        style: {width: '100%'}
      })
    ],
    style: {shown: false, width: '100%', padding: '0 0 2px 0'}
  });

  mainPanel.add(derivedOptionsPanel);

  // Separate panel for Derived Terrain Products â€” shown only when that collection is selected
  var derivedTerrainPanel = ui.Panel({
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
                value: 'Derived Terrain Products',
                style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E',
                        textDecoration: 'underline'},
                targetUrl: 'https://data.neonscience.org/data-products/DP3.30025.001'
              })
            ]),
            ui.Label({value: ' ', style: {stretch: 'horizontal'}})
          ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
        ]
      }),
      ui.Panel({
        widgets: derivedTopoColumns,
        layout: ui.Panel.Layout.flow('horizontal'),
        style: {width: '100%'}
      })
    ],
    style: {shown: false, width: '100%'}
  });

  mainPanel.add(derivedTerrainPanel);

  // Warning label â€” retained for compatibility; not triggered in current design
  // (terrain products now computed directly from DEM tiles, so DEM is always available)
  var terrainWarningLabel = ui.Label({
    value: '\u26a0 No matching-year DEM found for this image.\nTerrain products are unavailable.',
    style: {
      shown: false,
      color: '#cc4400',
      fontSize: '10px',
      fontWeight: 'bold',
      margin: '4px 4px 0 4px',
      whiteSpace: 'pre'
    }
  });
  derivedTerrainPanel.add(terrainWarningLabel);

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
    style: {width: '100%', margin: '10px 0 0 0'}
  });

  // Dropdown for cloud cover filter
  var cloudFilterOptions = ['All Cloud Conditions', '< 10% Cloud Cover', '< 50% Cloud Cover'];
  var cloudFilterSelect = ui.Select({
    items: cloudFilterOptions,
    placeholder: 'Select cloud filter',
    value: 'All Cloud Conditions',
    onChange: function(selectedOption) {
      updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    },
    style: {width: '100%', margin: '10px 0 0 0'}
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
    style: {shown: false, width: '100%', padding: '0 0 13px 0'}
  });

  mainPanel.add(reflectanceFiltersPanel);

  // ----------------------------
  // Universal Image Display Adjustments Panel (Min/Max/Gamma) - Dynamic
  // ----------------------------
  // In-app equivalent of the "gear icon" layer visualization editor (hidden from
  // end users in published GEE Apps), generalized to ANY currently displayed
  // image type (Reflectance, RGB, DSM, DTM, CHM, Nitrogen, Derived Indices/
  // Terrain/Albedo). Radio buttons pick whether the 1st or 2nd Image slot is
  // being edited; each slot keeps its own independent override.

  var universalStretchPanelOpen = false;

  // Tracks which auto-stretch preset (if any) is currently active per slot, so
  // the dropdown can keep showing e.g. "90%" after refreshUniversalPanelFields()
  // re-runs (which happens on every subsequent updateMap() while the panel is
  // open) instead of always collapsing back to "Custom". Manually editing
  // Min/Max (Apply button) or hitting Reset clears it back to 'Custom'.
  // universalPresetKeyBySlot pairs each recorded label with the override key
  // active when it was set, so switching sub-type/image in that slot (a
  // different key) invalidates the stale preset label automatically.
  var universalPresetLabelBySlot = {1: 'Custom', 2: 'Custom'};
  var universalPresetKeyBySlot = {1: null, 2: null};

  // Radio-button behavior simulated with mutually exclusive checkboxes
  // (same pattern used for the Derived Indices/Terrain product selectors).
  var universalSlotCheckboxes = {};
  function makeUniversalSlotCheckbox(slotNum, displayLabel) {
    var cb = ui.Checkbox({
      label: displayLabel,
      value: slotNum === 1,
      onChange: function(checked) {
        if (checked) {
          universalAdjustSlot = slotNum;
          Object.keys(universalSlotCheckboxes).forEach(function(key) {
            if (Number(key) !== slotNum) universalSlotCheckboxes[key].setValue(false, false);
          });
          refreshUniversalPanelFields();
        } else {
          // Prevent unchecking both - re-check this one (mutual exclusion only)
          universalSlotCheckboxes[slotNum].setValue(true, false);
        }
      },
      style: {fontSize: '11px', fontWeight: 'bold', color: 'black', margin: '2px 0'}
    });
    universalSlotCheckboxes[slotNum] = cb;
    return cb;
  }
  var universalSlot1Checkbox = makeUniversalSlotCheckbox(1, '1st Image');
  var universalSlot2Checkbox = makeUniversalSlotCheckbox(2, '2nd Image');
  // Wrap each checkbox in its own percentage-width column (same proven pattern
  // as the Derived Indices product columns) instead of relying on the
  // checkbox's own intrinsic label width, which can silently overflow a
  // horizontal-flow row and force a horizontal scrollbar on the whole panel.
  var universalSlot1Column = ui.Panel({
    widgets: [universalSlot1Checkbox],
    style: {width: '48%', margin: '0 2% 0 0'}
  });
  var universalSlot2Column = ui.Panel({
    widgets: [universalSlot2Checkbox],
    style: {width: '48%', margin: '0'}
  });
  var universalSlotRow = ui.Panel({
    widgets: [universalSlot1Column, universalSlot2Column],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {width: '100%', margin: '4px 0 0 0'}
  });

  // Returns which bands to compute auto-stretch statistics against for the
  // image currently loaded in a slot, or null if auto-stretch presets don't
  // apply to that sub-type (categorical/derived products - see slotSupportsAutoStretch).
  function getSlotStatsBands(slot) {
    var col = (slot === 1) ? selectCollection1.getValue() : selectCollection2.getValue();
    if (!col) return null;
    if (isReflCollection(col)) return currentVisParams.bands;
    if (isRGBCollection(col)) return ['R', 'G', 'B'];
    if (isDSMCollection(col)) return ['DSM'];
    if (isDTMCollection(col)) return ['DTM'];
    if (isCHMCollection(col)) return ['CHM'];
    if (isNitrogenCollection(col)) {
      var band = getEffectiveNitrogenBand(slot);
      if (band === 'Canopy Nitrogen Model Uncertainty') return ['Nitrogen_Uncertainty'];
      if (band === 'Needle Leaf/Non-Needle Leaf Classification') return null;
      return ['Nitrogen_Percent'];
    }
    return null; // Derived Indices/Terrain/Albedo - fixed defaults, no live auto-stretch
  }

  function slotSupportsAutoStretch(slot) {
    return getSlotStatsBands(slot) !== null;
  }

  // GEE's Image.visualize() throws an error if both "gamma" and "palette" are
  // supplied. Reflectance and RGB are the only types visualized with direct
  // band values (no palette), so they're the only ones where the Gamma slider
  // can actually take effect.
  function slotSupportsGamma(slot) {
    var col = (slot === 1) ? selectCollection1.getValue() : selectCollection2.getValue();
    if (!col) return false;
    return isReflCollection(col) || isRGBCollection(col);
  }

  // Computes a shared min/max across the active band(s) for the given stretch
  // mode and applies it. Generalizes applyReflectanceStretchPreset/applyRGBStretchPreset
  // from 10N to work against whichever image type is active in the selected slot.
  function applyUniversalStretchPreset(mode) {
    if (mode === 'Custom') return; // user enters Min/Max manually, nothing to compute
    var slot = universalAdjustSlot;
    var img = (slot === 1) ? selectedImage1 : selectedImage2;
    if (!img) {
      print('Image Display Adjustments: select an image in this slot first to use an auto-stretch preset.');
      return;
    }
    var bands = getSlotStatsBands(slot);
    if (!bands) {
      print('Image Display Adjustments: auto-stretch presets are not available for this image type. Enter Min/Max manually instead.');
      return;
    }

    var reducer, lowSuffix, highSuffix, stdDevMultiplier;
    if (mode === '100%') {
      reducer = ee.Reducer.minMax();
      lowSuffix = '_min'; highSuffix = '_max';
    } else if (mode === '98%') {
      reducer = ee.Reducer.percentile([1, 99]);
      lowSuffix = '_p1'; highSuffix = '_p99';
    } else if (mode === '90%') {
      reducer = ee.Reducer.percentile([5, 95]);
      lowSuffix = '_p5'; highSuffix = '_p95';
    } else if (mode === '2 x Std Dev' || mode === '3 x Std Dev') {
      reducer = ee.Reducer.mean().combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true});
      stdDevMultiplier = (mode === '2 x Std Dev') ? 2 : 3;
    } else {
      return;
    }

    var stats = img.select(bands).reduceRegion({
      reducer: reducer,
      geometry: img.geometry(),
      scale: 20,
      bestEffort: true,
      maxPixels: 1e8,
      tileScale: 4
    }).getInfo();

    var lowVals = [], highVals = [];
    bands.forEach(function(band) {
      if (stdDevMultiplier) {
        var mean = stats[band + '_mean'];
        var sd = stats[band + '_stdDev'];
        if (mean === null || sd === null || mean === undefined || sd === undefined) return;
        lowVals.push(mean - stdDevMultiplier * sd);
        highVals.push(mean + stdDevMultiplier * sd);
      } else {
        var lo = stats[band + lowSuffix];
        var hi = stats[band + highSuffix];
        if (lo === null || hi === null || lo === undefined || hi === undefined) return;
        lowVals.push(lo);
        highVals.push(hi);
      }
    });

    if (!lowVals.length || !highVals.length) {
      print('Image Display Adjustments: could not compute stretch statistics for this image.');
      return;
    }

    var newMin = Math.round(Math.min.apply(null, lowVals));
    var newMax = Math.round(Math.max.apply(null, highVals));
    if (newMin >= newMax) { newMax = newMin + 1; }

    universalMinBox.setValue(String(newMin));
    universalMaxBox.setValue(String(newMax));
    applyUniversalStretch(true /* skip min/max re-read, already valid */);
    // applyUniversalStretch -> updateMap -> refreshUniversalPanelFields (panel is
    // open) all run synchronously above and would otherwise leave the dropdown
    // showing "Custom" - record the active preset and re-apply it to the widget
    // now that the whole chain has settled.
    universalPresetLabelBySlot[slot] = mode;
    universalPresetKeyBySlot[slot] = getOverrideKey(slot);
    universalStretchModeSelect.setValue(mode, false);
  }

  var universalMinBox = ui.Textbox({
    value: '0',
    style: {width: '18%', margin: '2px 2% 2px 1%'}
  });
  var universalMaxBox = ui.Textbox({
    value: '1',
    style: {width: '18%', margin: '2px 2% 2px 0'}
  });
  var universalStretchModeSelect = ui.Select({
    items: ['Custom', '100%', '98%', '90%', '2 x Std Dev', '3 x Std Dev'],
    value: 'Custom',
    onChange: function(mode) { applyUniversalStretchPreset(mode); },
    style: {stretch: 'horizontal', margin: '2px 1% 2px 0'}
  });
  var universalStretchModeLabel = ui.Label('Stretch', {stretch: 'horizontal', margin: '0 1% 0 0', fontSize: '11px', color: 'gray'});
  var universalMinMaxLabels = ui.Panel({
    widgets: [
      ui.Label('Min', {width: '18%', margin: '0 2% 0 1%', fontSize: '11px', color: 'gray'}),
      ui.Label('Max', {width: '18%', margin: '0 2% 0 0', fontSize: '11px', color: 'gray'}),
      universalStretchModeLabel
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {width: '100%'}
  });
  var universalMinMaxRow = ui.Panel({
    widgets: [universalMinBox, universalMaxBox, universalStretchModeSelect],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {width: '100%'}
  });

  var universalGammaLabel = ui.Label('Gamma: 1.00', {fontSize: '11px', margin: '4px 1%'});
  var universalGammaSlider = ui.Slider({
    min: 0.1,
    max: 3.0,
    value: 1.0,
    step: 0.05,
    style: {width: '100%', margin: '2px 1%'},
    onChange: function(value) {
      universalGammaLabel.setValue('Gamma: ' + value.toFixed(2));
      applyUniversalStretch(true /* skip min/max re-read, already valid */);
    }
  });

  // Applies the current Min/Max/Gamma fields as a manual override for whichever
  // slot the radio buttons currently point to, then redraws the map.
  function applyUniversalStretch(skipMinMaxParse) {
    var slot = universalAdjustSlot;
    var key = getOverrideKey(slot);
    if (!key) {
      print('Image Display Adjustments: select an image in this slot first.');
      return;
    }
    var minVal = parseFloat(universalMinBox.getValue());
    var maxVal = parseFloat(universalMaxBox.getValue());
    if (!skipMinMaxParse) {
      if (isNaN(minVal) || isNaN(maxVal) || minVal >= maxVal) {
        print('Image Display Adjustments: please enter valid Min/Max values (Min must be less than Max).');
        return;
      }
      universalPresetLabelBySlot[slot] = 'Custom';
      universalStretchModeSelect.setValue('Custom', false);
    }
    manualOverrides[slot] = {
      key: key,
      min: minVal,
      max: maxVal,
      gamma: universalGammaSlider.getValue()
    };
    updateMap(select1.getValue(), select2.getValue(), currentVisParams);
  }

  var universalApplyButton = ui.Button({
    label: 'Apply',
    onClick: function() { applyUniversalStretch(false); },
    style: {width: '48%', margin: '4px 1%'}
  });

  var universalResetButton = ui.Button({
    label: 'Reset to default',
    onClick: function() {
      manualOverrides[universalAdjustSlot] = null;
      universalPresetLabelBySlot[universalAdjustSlot] = 'Custom';
      universalStretchModeSelect.setValue('Custom', false);
      updateMap(select1.getValue(), select2.getValue(), currentVisParams);
    },
    style: {width: '48%', margin: '4px 1%'}
  });

  var universalButtonRow = ui.Panel({
    widgets: [universalApplyButton, universalResetButton],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {width: '100%'}
  });

  var universalStretchPanel = ui.Panel({
    widgets: [
      universalSlotRow,
      universalMinMaxLabels,
      universalMinMaxRow,
      universalGammaLabel,
      universalGammaSlider,
      universalButtonRow
    ],
    style: {
      shown: false,
      padding: '8px',
      border: '1px solid #4A997E',
      backgroundColor: '#f2f8f6',
      width: '100%',
      margin: '6px 0'
    }
  });

  var universalStretchToggleButton = ui.Button({
    label: 'Histogram Stretch / Gamma',
    onClick: function() {
      universalStretchPanelOpen = !universalStretchPanelOpen;
      if (universalStretchPanelOpen) { refreshUniversalPanelFields(); }
      universalStretchPanel.style().set('shown', universalStretchPanelOpen);
    },
    style: {width: '100%', margin: '4px 0 0 0', shown: false}
  });

  var universalStretchSeparator = ui.Label({
    value: '_______________________________________________',
    style: {fontWeight: 'bold', color: '4A997E', shown: false}
  });

  var universalStretchTitle = ui.Panel({
    widgets: [
      ui.Panel([
        ui.Label({value: ' ', style: {stretch: 'horizontal'}}),
        ui.Panel([
          ui.Label({
            value: 'Image Display Adjustments',
            style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
          })
        ]),
        ui.Label({value: ' ', style: {stretch: 'horizontal'}})
      ], ui.Panel.Layout.flow('horizontal'), {stretch: 'horizontal'})
    ],
    style: {shown: false}
  });

  mainPanel.add(universalStretchSeparator);
  mainPanel.add(universalStretchTitle);
  mainPanel.add(universalStretchToggleButton);
  mainPanel.add(universalStretchPanel);

  // Updates the Min/Max/Gamma fields (and the auto-stretch dropdown's enabled
  // state) to reflect whichever slot the radio buttons currently point to.
  function refreshUniversalPanelFields() {
    var slot = universalAdjustSlot;
    var eff = effectiveVisParamsBySlot[slot];
    if (!eff) return;
    universalMinBox.setValue(String(eff.min));
    universalMaxBox.setValue(String(eff.max));
    var gamma = (eff.gamma !== undefined) ? eff.gamma : 1.0;
    universalGammaSlider.setValue(gamma);
    var gammaOk = slotSupportsGamma(slot);
    universalGammaSlider.setDisabled(!gammaOk);
    universalGammaLabel.setValue(gammaOk ?
      ('Gamma: ' + gamma.toFixed(2)) :
      'Gamma: not available for this image type (palette-based)');
    // If the user switched to a different image/sub-type in this slot since a
    // preset was last chosen, the recorded label is stale - fall back to Custom.
    if (universalPresetKeyBySlot[slot] !== getOverrideKey(slot)) {
      universalPresetLabelBySlot[slot] = 'Custom';
    }
    universalStretchModeSelect.setValue(universalPresetLabelBySlot[slot] || 'Custom', false);
    var autoStretchOk = slotSupportsAutoStretch(slot);
    universalStretchModeSelect.setDisabled(!autoStretchOk);
    universalStretchModeLabel.setValue(autoStretchOk ?
      'Stretch' :
      'Stretch: not available for this image type (use Min/Max)');
  }

  // Shows/hides the whole panel group, enables/disables the 2nd Image radio
  // button based on whether a 2nd image is currently loaded, and forces the
  // active slot back to 1 if the 2nd image slot becomes empty while selected.
  // Called at the end of updateMap() so it always reflects what's on the map.
  function updateUniversalAdjustPanel() {
    var hasImage1 = !!effectiveVisParamsBySlot[1];
    var hasImage2 = !!effectiveVisParamsBySlot[2];

    universalStretchSeparator.style().set('shown', hasImage1);
    universalStretchTitle.style().set('shown', hasImage1);
    universalStretchToggleButton.style().set('shown', hasImage1);
    if (!hasImage1) {
      universalStretchPanel.style().set('shown', false);
      universalStretchPanelOpen = false;
      return;
    }

    universalSlot2Checkbox.setDisabled(!hasImage2);
    universalSlot2Checkbox.style().set('color', hasImage2 ? 'black' : '#a0a0a0');
    if (!hasImage2 && universalAdjustSlot === 2) {
      universalAdjustSlot = 1;
      universalSlot1Checkbox.setValue(true, false);
      universalSlot2Checkbox.setValue(false, false);
    }

    if (universalStretchPanelOpen) { refreshUniversalPanelFields(); }
  }

  // Function to update filter panel visibility based on selected collections
  function updateFilterPanelVisibility() {
    var collection1 = selectCollection1.getValue();
    var collection2 = selectCollection2.getValue();
    
    // Helper: true only for the two spectrometer reflectance collections (not derived products,
    // which also contains "HSI_REFL" in the name but uses a separate panel)
    var isSpecRefl = function(col) {
      return col === 'Spectrometer Directional Reflectance (DP3.30006.001)' ||
            col === 'Spectrometer Bidirectional Reflectance (DP3.30006.002)';
    };
    
    // Show reflectance filters only for actual spectrometer reflectance collections
    var showReflectance = (collection1 && isSpecRefl(collection1)) || 
                          (collection2 && isSpecRefl(collection2));
    reflectanceFiltersPanel.style().set('shown', showReflectance);
    
    // Show nitrogen options if either image is CNC
    var showNitrogen = (collection1 && String(collection1).indexOf('DP3.30018.002') !== -1) || 
                      (collection2 && String(collection2).indexOf('DP3.30018.002') !== -1);
    nitrogenOptionsPanel.style().set('shown', showNitrogen);
    
    // Show derived veg/water indices panel for HSI-based derived collections
    var showDerivedIndices = (collection1 && String(collection1).indexOf('Derived Indices') !== -1) ||
                             (collection2 && String(collection2).indexOf('Derived Indices') !== -1);
    derivedOptionsPanel.style().set('shown', showDerivedIndices);

    // Show terrain panel for Derived Terrain Products collection
    var showTerrainDerived = (collection1 === 'Derived Terrain Products (from DP3.30024.001)') ||
                             (collection2 === 'Derived Terrain Products (from DP3.30024.001)');
    derivedTerrainPanel.style().set('shown', showTerrainDerived);
    
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

  // Add the horizontal panel with NEON Data Portal + AOP Tutorial URL links to the main panel
  mainPanel.add(URLhorizontalPanel1);

  // Add the Vegetation Phenology centered row
  mainPanel.add(URLhorizontalPanel4);

  // Add the Mobile AOP Data Viewer centered row
  mainPanel.add(URLhorizontalPanel3);

  // Add the horizontal panel with Mobile AOP Data Viewer QR code to the main panel
  mainPanel.add(URLhorizontalPanel2);
  mainPanel.add(versionLabel);

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
  // Two-line, narrower, smaller-font layout so it doesn't overlap adjacent
  // panels on smaller laptop screens.
  var chartTitle2 = ui.Label(
    'Click on image(s) to view pixel values or spectra\n' +
    '(export panel must be closed; refresh browser if spectral plot freezes)',
    {
      position: 'bottom-center',
      color: 'blue',
      fontSize: '11px',
      fontWeight: 'bold',
      padding: '6px',
      width: '360px',
      whiteSpace: 'pre',
      textAlign: 'center'
    }
  );
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

  // Pixel value info panel â€” non-reflectance, non-RGB images; shown on map click
  var pixelInfoPanel = ui.Panel({
    style: {
      width: '300px',
      position: 'bottom-right',
      shown: false,
      padding: '4px',
      backgroundColor: 'white'
    }
  });
  Map.add(pixelInfoPanel);

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
    
    // Store percentile values for vis params
    if (imageNumber === 1) {
      nitrogenMinMax.image1 = {min: minVal, max: maxVal};
    } else if (imageNumber === 2) {
      nitrogenMinMax.image2 = {min: minVal, max: maxVal};
    }

    // Compute actual image min/max for legend labels (separate from the stretch)
    var actualStats = maskedNitrogen.reduceRegion({
      reducer: ee.Reducer.minMax(),
      scale: 10,
      maxPixels: 3e7
    });
    var actualMin = ee.Number(actualStats.get('Nitrogen_Percent_min')).getInfo();
    var actualMax = ee.Number(actualStats.get('Nitrogen_Percent_max')).getInfo();
    if (imageNumber === 1) {
      nitrogenActualMinMax.image1 = {min: actualMin, max: actualMax};
    } else if (imageNumber === 2) {
      nitrogenActualMinMax.image2 = {min: actualMin, max: actualMax};
    }
    
    return {
      bands: ['Nitrogen_Percent'],
      min: minVal,
      max: maxVal,
      palette: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725']
    };
  }

  function getNitrogenUncertaintyVisParams(nitrogenImage, imageNumber) {
    // Apply nitrogen mask and calculate mean Â± 2 standard deviations for uncertainty band
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
    
    // Store percentile values for vis params
    if (imageNumber === 1) {
      uncertaintyMinMax.image1 = {min: minVal, max: maxVal};
    } else if (imageNumber === 2) {
      uncertaintyMinMax.image2 = {min: minVal, max: maxVal};
    }

    // Compute actual image min/max for legend labels (separate from the stretch)
    var actualUncertaintyStats = maskedUncertainty.reduceRegion({
      reducer: ee.Reducer.minMax(),
      scale: 10,
      maxPixels: 3e7
    });
    var actualUncMin = Math.max(0, ee.Number(actualUncertaintyStats.get('Nitrogen_Uncertainty_min')).getInfo());
    var actualUncMax = Math.min(1, ee.Number(actualUncertaintyStats.get('Nitrogen_Uncertainty_max')).getInfo());
    if (imageNumber === 1) {
      uncertaintyActualMinMax.image1 = {min: actualUncMin, max: actualUncMax};
    } else if (imageNumber === 2) {
      uncertaintyActualMinMax.image2 = {min: actualUncMin, max: actualUncMax};
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
    var isCNC1 = collection1 && String(collection1).indexOf('DP3.30018.002') !== -1;
    var isCNC2 = collection2 && String(collection2).indexOf('DP3.30018.002') !== -1;
    
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
    water1: [845.0, 855.0],   // NIR water mask window (Â±5nm)
    water2: [1595.0, 1605.0], // SWIR water mask window (Â±5nm)
    // Water indices (NEON.DOC.004364, DP3.30019.001)
    wbi1:  [892.5,  907.5],   // Ï900  (WBI denominator)
    wbi2:  [962.5,  977.5],   // Ï970  (WBI numerator)
    nmdi1: [841.0,  876.0],   // Ï860
    nmdi2: [1628.0, 1652.0],  // Ï1640
    nmdi3: [2105.0, 2155.0],  // Ï2130
    ndwi1: [849.5,  864.5],   // Ï857
    ndwi2: [1232.5, 1247.5],  // Ï1241
    ndii1: [811.5,  826.5],   // Ï819  (shared with MSI)
    ndii2: [1640.5, 1656.5],  // Ï1649
    msi2:  [1591.5, 1606.5]   // Ï1599
  };

  var VI_EVI_G  = 2.5, VI_EVI_C1 = 6.0, VI_EVI_C2 = 7.5, VI_EVI_L = 1.0;
  var VI_ARVI_GAMMA = 1.0;
  var VI_SAVI_L = 0.5;
  var VI_WATER_THRESH_NIR  = 0.01;
  var VI_WATER_THRESH_SWIR = 0.005;

  // LAI ATBD coefficients (NEON.DOC.002385, Eq. 3): LAI = -(1/a2) * ln((a0 - SAVI) / a1)
  var LAI_A0 = 0.82, LAI_A1 = 0.78, LAI_A2 = 0.60;
  // fPAR ATBD coefficients (NEON.DOC.003840, Eq. 3): fPAR = C * [1 - A * exp(-B * LAI)]
  var FPAR_A = 1.0, FPAR_B = 0.4, FPAR_C = 1.0;

  // ============================================================
  // NEON AOP Surface Albedo â€” NEON.DOC.004326
  // Solar irradiance convolved to 392 NIS band centres (bands 10-401, ~430-2440 nm)
  // Thuillier (2003) spectrum; units: mW cm-2 um-1
  // ============================================================
  var E_CONV_NIS = ee.Array([
    1.650271282160394719e+02, 1.794630017135746414e+02, 1.929359516356887525e+02, 2.026858013892427834e+02, 2.064544946513590276e+02, 2.081866317678654923e+02, 2.062439551303360190e+02,
    2.024629010178193482e+02, 2.069531638666528863e+02, 2.089547460934192600e+02, 1.980508346157546669e+02, 1.931686065368342327e+02, 1.978667100347372809e+02, 1.939585900786733816e+02,
    1.936802703769751020e+02, 1.938394365759994002e+02, 1.837704064145841016e+02, 1.771268840531500075e+02, 1.835063085475040339e+02, 1.854273715089803147e+02, 1.879489738072874445e+02,
    1.850738805163688880e+02, 1.860570492220202539e+02, 1.870366395286923762e+02, 1.857137218784827724e+02, 1.797042734261003716e+02, 1.789309384871939130e+02, 1.788344529827337794e+02,
    1.806603061931229206e+02, 1.797836339789159581e+02, 1.795992249445797597e+02, 1.740150848466721243e+02, 1.758229435627229691e+02, 1.744244723204684533e+02, 1.732310933179095400e+02,
    1.703115213058718211e+02, 1.659862112815920057e+02, 1.655104475526865144e+02, 1.648549029990095391e+02, 1.647565871637505666e+02, 1.630271814503140888e+02, 1.615395252755717195e+02,
    1.592243342017944485e+02, 1.578598934352210392e+02, 1.509612397592067907e+02, 1.504692379974273138e+02, 1.530970211453305012e+02, 1.516402271358592486e+02, 1.493240130653108508e+02,
    1.477537292049484279e+02, 1.460819250548289574e+02, 1.464228706257249826e+02, 1.454276905584594886e+02, 1.439381237845170176e+02, 1.428626868214669514e+02, 1.400308265201580298e+02,
    1.372925158928031806e+02, 1.356269070084709654e+02, 1.344771767964045637e+02, 1.324959337308964962e+02, 1.314218539833641159e+02, 1.280344721985259469e+02, 1.280409196426045071e+02,
    1.272687795747461195e+02, 1.266702090199374027e+02, 1.258481220371638187e+02, 1.240274642963611882e+02, 1.225177673002387166e+02, 1.196234762081260641e+02, 1.166424820478065101e+02,
    1.156222305011885823e+02, 1.146273137858508164e+02, 1.125636922281381089e+02, 1.124090422087441539e+02, 1.113505865325294479e+02, 1.105378773816180313e+02, 1.101697217884907758e+02,
    1.073183816923224612e+02, 1.067287250547729514e+02, 1.055438203977159048e+02, 1.035512145191637927e+02, 1.028051140457616270e+02, 1.011519951786459188e+02, 9.673012668526364166e+01,
    9.264226827795924635e+01, 9.725517751012658607e+01, 9.548836983544548218e+01, 9.520620442954265172e+01, 9.524518279366145634e+01, 9.462175146783033597e+01, 9.309563889752809018e+01,
    9.241452292576127547e+01, 9.122314358986288596e+01, 8.934018114924998599e+01, 8.873338049822343976e+01, 8.756763532869508992e+01, 8.737888629101517779e+01, 8.546596488660021862e+01,
    8.367277449996475980e+01, 8.454614436805377409e+01, 8.380453022214111058e+01, 8.194746340415404973e+01, 8.109935939742700839e+01, 8.105680877338649282e+01, 7.902201544536121958e+01,
    7.896217570349921289e+01, 7.793668025726447013e+01, 7.739826599408672791e+01, 7.641202802980492947e+01, 7.568387603595793678e+01, 7.494101480841720786e+01, 7.397473994291902955e+01,
    7.360084901155207149e+01, 7.276589644310521976e+01, 7.075719926828483608e+01, 7.106194625107136176e+01, 7.022813206975207834e+01, 6.922150431221666622e+01, 6.909318558168114066e+01,
    6.826245017249381419e+01, 6.712002255357866431e+01, 6.659399070206066540e+01, 6.587766443465493182e+01, 6.546597926623819319e+01, 6.488304230387815608e+01, 6.382236125477834321e+01,
    6.327062490097414127e+01, 6.206420597643008819e+01, 6.198080189313005661e+01, 6.121047217373921256e+01, 6.045866242481028507e+01, 5.985321696970926553e+01, 5.815906033133323660e+01,
    5.832466988901912686e+01, 5.836182885387955821e+01, 5.784193443906516308e+01, 5.725700727952131786e+01, 5.660789736883162959e+01, 5.576724515213269484e+01, 5.516437225446961179e+01,
    5.473717545844859700e+01, 5.390603782856802439e+01, 5.388577894424905423e+01, 5.364340177570404222e+01, 5.315599834466301132e+01, 5.206998793220002852e+01, 5.167307929952985290e+01,
    5.147056792111501267e+01, 5.093570248499040787e+01, 5.045606357410301257e+01, 4.993624712656259845e+01, 4.959109277999639431e+01, 4.916049222086103754e+01, 4.820789623370671251e+01,
    4.801490155976777174e+01, 4.743987217038382198e+01, 4.780066113593640864e+01, 4.741347897452448734e+01, 4.682192471640978226e+01, 4.635655837945245139e+01, 4.598047492935602065e+01,
    4.548428372965392441e+01, 4.510327039015672312e+01, 4.482749057952602101e+01, 4.442111973667398672e+01, 4.419710742656050684e+01, 4.381476694538512362e+01, 4.356279762034393599e+01,
    4.326082258026923455e+01, 4.160669566219082327e+01, 4.155440567522126116e+01, 4.206554967236864684e+01, 4.192907063635539799e+01, 4.156555526528281774e+01, 4.116380333903529731e+01,
    4.062374151145466783e+01, 3.997786222042908122e+01, 4.006269265737991248e+01, 3.971652965235278288e+01, 3.918822328921737608e+01, 3.912142277751959085e+01, 3.873152983732168764e+01,
    3.856892178736585919e+01, 3.819760582749071887e+01, 3.774353946150589678e+01, 3.744351991605785202e+01, 3.715759503512735051e+01, 3.679029969233353370e+01, 3.655916663291690583e+01,
    3.638379741357911001e+01, 3.613035666018929959e+01, 3.590190706417072875e+01, 3.560726500802322647e+01, 3.517511828959365516e+01, 3.496671887573391757e+01, 3.461233524004019557e+01,
    3.439504541347053390e+01, 3.403226153332805382e+01, 3.351984126795458252e+01, 3.342874621084050801e+01, 3.349343552878734442e+01, 3.282695103977871298e+01, 3.270717465702476545e+01,
    3.246881137477918600e+01, 3.215784027781012355e+01, 3.209357528431434758e+01, 3.177945485366366540e+01, 3.142527406150341207e+01, 3.097339806120423589e+01, 3.097540370177284075e+01,
    3.052789605686702856e+01, 3.038561193967657559e+01, 3.042376123849405545e+01, 2.976231717349915940e+01, 2.890144833628411192e+01, 2.950004245343435727e+01, 2.928047086759118756e+01,
    2.899445394516310870e+01, 2.880101236776953755e+01, 2.843056618041375927e+01, 2.821548300070963577e+01, 2.788619396937657768e+01, 2.784753659349075861e+01, 2.746033253909206095e+01,
    2.718270806574431120e+01, 2.717576149540557751e+01, 2.689299367778141558e+01, 2.665188327511280519e+01, 2.587586958140941462e+01, 2.600128830600024088e+01, 2.559648135599845986e+01,
    2.503775156709789940e+01, 2.562229929054955946e+01, 2.539671449485788557e+01, 2.505679116932746098e+01, 2.454157732431924543e+01, 2.431069406904677521e+01, 2.422068352412154013e+01,
    2.444901254308650351e+01, 2.422731703835858141e+01, 2.351091661776071717e+01, 2.279657121623294813e+01, 2.294888866415028161e+01, 2.298842071490565431e+01, 2.303272478824457181e+01,
    2.295257643301005857e+01, 2.256133585707047828e+01, 2.216219895353788871e+01, 2.169973636957806917e+01, 2.105265925637836943e+01, 2.136711300783277778e+01, 2.151108891005260659e+01,
    2.144090497741925105e+01, 2.107592737359114921e+01, 2.078986832659458628e+01, 2.050649642454986576e+01, 2.060033060221130796e+01, 2.025221984834368882e+01, 2.005144438201552504e+01,
    1.966603743331004139e+01, 1.887882067491752380e+01, 1.922056257132612700e+01, 1.924111962967824141e+01, 1.913676605997273938e+01, 1.909137516553425939e+01, 1.877683453831428295e+01,
    1.858901546097600743e+01, 1.841737075039524285e+01, 1.813447366608484757e+01, 1.793971653284465972e+01, 1.786280651851418000e+01, 1.777091369975427426e+01, 1.762095814889652345e+01,
    1.742849057783933731e+01, 1.730513703506624879e+01, 1.708891161613548348e+01, 1.633670232102009834e+01, 1.627443182115354148e+01, 1.661553738141614645e+01, 1.652434425539599161e+01,
    1.636482417409289525e+01, 1.612953967142590983e+01, 1.589908217430995663e+01, 1.594324683135464049e+01, 1.581115143494842989e+01, 1.560602660511883855e+01, 1.539875787808963636e+01,
    1.497001528496961598e+01, 1.424478331160416467e+01, 1.491033199922018682e+01, 1.492102441426940729e+01, 1.465309679914842000e+01, 1.440856310400574536e+01, 1.446681467156298240e+01,
    1.434945203115844414e+01, 1.419002913982698644e+01, 1.408902334317856742e+01, 1.396939758945926258e+01, 1.383745165804353228e+01, 1.358844153221602546e+01, 1.354252214699148027e+01,
    1.309897448395990693e+01, 1.266351910543527204e+01, 1.303424645243821800e+01, 1.319880861013936801e+01, 1.299573816395493786e+01, 1.285241833991318927e+01, 1.270122998169208905e+01,
    1.248963645985539372e+01, 1.237049540190843366e+01, 1.229181219553565896e+01, 1.221589781361418403e+01, 1.207020273041353597e+01, 1.200508423260539459e+01, 1.191521179719435786e+01,
    1.185867789123570404e+01, 1.173278188901760366e+01, 1.153979148226473761e+01, 1.145477265938085587e+01, 1.131467407981666717e+01, 1.120259029129188377e+01, 1.118570698197790847e+01,
    1.115069389836490288e+01, 1.101498754681969139e+01, 1.091441366418805003e+01, 1.073824963013578504e+01, 1.067860959298920953e+01, 1.062019787975027008e+01, 1.057431571647980029e+01,
    1.042018304617774049e+01, 1.035677813958737303e+01, 1.020674763357895642e+01, 1.012237591988340490e+01, 1.010859787620816697e+01, 1.004466127326725911e+01, 9.935518980373309716e+00,
    9.823038498567784771e+00, 9.708673793969547106e+00, 9.638346157468721032e+00, 9.606681569220411276e+00, 9.512838881624377407e+00, 9.485733427489352110e+00, 9.421592892531540642e+00,
    9.355980092180956831e+00, 9.262205984113187185e+00, 9.012647166019746692e+00, 8.662690746426411792e+00, 8.902756377101820107e+00, 8.896812162821756687e+00, 8.846348249502979044e+00,
    8.781225413877777441e+00, 8.700664999849086811e+00, 8.639241430676934286e+00, 8.532411548907502308e+00, 8.359245585125254507e+00, 8.357727253166183701e+00, 8.300657782739536472e+00,
    8.243018320421303002e+00, 8.147349094599377395e+00, 8.104604926202574333e+00, 8.009665129350688417e+00, 7.928474944328707252e+00, 7.869024488511085380e+00, 7.787192954566027225e+00,
    7.720260567373536276e+00, 7.653905085248974949e+00, 7.608208207609318485e+00, 7.564683129378471094e+00, 7.495763680321632094e+00, 7.374248767349293132e+00, 7.351043354425163656e+00,
    7.261259989024161143e+00, 7.155834958176903626e+00, 7.162282665077674082e+00, 7.125617923970958500e+00, 7.061780056618998991e+00, 6.972525585400952686e+00, 6.850858676190341612e+00,
    6.775906363156108725e+00, 6.772715462056085656e+00, 6.727710697625720826e+00, 6.707219643926721986e+00, 6.655731470671780059e+00, 6.513634326942824515e+00, 6.443908457764250031e+00,
    6.456680394629650266e+00, 6.422272949356701233e+00, 6.338968079970473291e+00, 6.297055179991104090e+00, 6.175530438799182953e+00, 6.059619062311526250e+00, 6.074705863602101630e+00
  ]);
  // Normalization denominator â€” sum over full extended range (300-2397 nm)
  var E_SUM_FULL = 26063.107378627945;

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
    LAI:  {min: 0, max: 8,
          palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#66bd63','#1a9850']},
    fPAR: {min: 0, max: 1,
          palette: ['#d73027','#f46d43','#fdae61','#fee08b','#d9ef8b','#a6d96a','#1a9850','#00b09b']},
    Slope:     {min: 0,   max: 60,  palette: ['#ffffff','#8b4513']},
    Aspect:    {min: 0,   max: 360, palette: ['#d53e4f','#f46d43','#fdae61','#fee08b',
                                              '#e6f598','#abdda4','#66c2a5','#3288bd','#d53e4f']},
    Hillshade: {min: 0,   max: 255, palette: ['#000000','#ffffff']},
    // Water indices (NEON.DOC.004364) â€” higher = more moisture stress for WBI/MSI;
    // higher = more liquid water content for NMDI/NDWI/NDII
    WBI:  {min: 0.8, max: 1.2, palette: ['#8c510a','#bf812d','#dfc27d','#f5f5f5','#80cdc1','#35978f','#01665e']},
    NMDI: {min: -0.5, max: 0.5, palette: ['#01665e','#35978f','#80cdc1','#f5f5f5','#dfc27d','#bf812d','#8c510a']},
    NDWI: {min: -0.5, max: 0.5, palette: ['#8c510a','#bf812d','#dfc27d','#f5f5f5','#80cdc1','#35978f','#01665e']},
    NDII: {min: -0.5, max: 0.5, palette: ['#8c510a','#bf812d','#dfc27d','#f5f5f5','#80cdc1','#35978f','#01665e']},
    MSI:  {min: 0.4, max: 3.0,  palette: ['#01665e','#35978f','#80cdc1','#f5f5f5','#dfc27d','#bf812d','#8c510a']},
    // Surface albedo (NEON.DOC.004326) â€” grayscale ramp
    Albedo: {min: 0.05, max: 0.25, palette: ['#000000','#404040','#808080','#c0c0c0','#ffffff']}
  };

  // Core helper: mean reflectance (0â€“1) across all bands in [minWl, maxWl]
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
  // LAI â€” NEON ATBD Eq. 3 (DOC.002385): LAI = -(1/a2) * ln((a0 - SAVI) / a1)
  // Validity mask: ln argument must be > 0 (SAVI < LAI_A0); plausibility bounds 0 â‰¤ LAI â‰¤ 15.
  function vi_lai(b) {
    var savi = vi_savi(b);  // already water-masked
    var arg = ee.Image(LAI_A0).subtract(savi).divide(LAI_A1);
    var lai = arg.log().multiply(-1.0 / LAI_A2).rename('LAI');
    var validMask = arg.gt(0).and(lai.gte(0)).and(lai.lte(15));
    return lai.updateMask(validMask);
  }
  // fPAR â€” NEON ATBD Eq. 3 (DOC.003840): fPAR = C * [1 - A * exp(-B * LAI)]; clamped to [0, 1]
  function vi_fpar(b) {
    var lai = vi_lai(b);  // inherits water + validity mask from LAIâ†’SAVI
    return ee.Image(FPAR_C)
      .multiply(
        ee.Image(1).subtract(
          ee.Image(FPAR_A).multiply(lai.multiply(-FPAR_B).exp())
        )
      )
      .rename('fPAR')
      .clamp(0, 1);
  }

  // ----------------------------
  // Canopy Water Indices â€” NEON.DOC.004364 (DP3.30019.001), Eqs. 1â€“5
  // These functions take (image, waterMask) directly; do NOT use vi_precompute().
  // ----------------------------

  // WBI = Ï970 / Ï900  (Eq. 1)
  function wi_wbi(image, waterMask) {
    var rho900 = vi_getBandMean(image, VI_BAND_RANGES.wbi1[0],  VI_BAND_RANGES.wbi1[1]);
    var rho970 = vi_getBandMean(image, VI_BAND_RANGES.wbi2[0],  VI_BAND_RANGES.wbi2[1]);
    return rho970.divide(rho900).rename('WBI').updateMask(waterMask);
  }

  // NMDI = (Ï860 âˆ’ (Ï1640 âˆ’ Ï2130)) / (Ï860 + (Ï1640 âˆ’ Ï2130))  (Eq. 2)
  function wi_nmdi(image, waterMask) {
    var rho860  = vi_getBandMean(image, VI_BAND_RANGES.nmdi1[0], VI_BAND_RANGES.nmdi1[1]);
    var rho1640 = vi_getBandMean(image, VI_BAND_RANGES.nmdi2[0], VI_BAND_RANGES.nmdi2[1]);
    var rho2130 = vi_getBandMean(image, VI_BAND_RANGES.nmdi3[0], VI_BAND_RANGES.nmdi3[1]);
    var diff = rho1640.subtract(rho2130);
    return rho860.subtract(diff).divide(rho860.add(diff)).rename('NMDI').updateMask(waterMask);
  }

  // NDWI = (Ï857 âˆ’ Ï1241) / (Ï857 + Ï1241)  (Eq. 3)
  function wi_ndwi(image, waterMask) {
    var rho857  = vi_getBandMean(image, VI_BAND_RANGES.ndwi1[0], VI_BAND_RANGES.ndwi1[1]);
    var rho1241 = vi_getBandMean(image, VI_BAND_RANGES.ndwi2[0], VI_BAND_RANGES.ndwi2[1]);
    return rho857.subtract(rho1241).divide(rho857.add(rho1241)).rename('NDWI').updateMask(waterMask);
  }

  // NDII = (Ï819 âˆ’ Ï1649) / (Ï819 + Ï1649)  (Eq. 4)
  function wi_ndii(image, waterMask) {
    var rho819  = vi_getBandMean(image, VI_BAND_RANGES.ndii1[0], VI_BAND_RANGES.ndii1[1]);
    var rho1649 = vi_getBandMean(image, VI_BAND_RANGES.ndii2[0], VI_BAND_RANGES.ndii2[1]);
    return rho819.subtract(rho1649).divide(rho819.add(rho1649)).rename('NDII').updateMask(waterMask);
  }

  // MSI = Ï1599 / Ï819  (Eq. 5)
  function wi_msi(image, waterMask) {
    var rho819  = vi_getBandMean(image, VI_BAND_RANGES.ndii1[0], VI_BAND_RANGES.ndii1[1]);
    var rho1599 = vi_getBandMean(image, VI_BAND_RANGES.msi2[0],  VI_BAND_RANGES.msi2[1]);
    return rho1599.divide(rho819).rename('MSI').updateMask(waterMask);
  }

  // Surface Albedo  NEON.DOC.004326
  // Bands 10-401 (~430-2440 nm); irradiance-weighted sum normalised by E_SUM_FULL
  function computeAlbedo(image, waterMask) {
    var bandNames = image.bandNames()
      .filter(ee.Filter.stringContains('item', 'B'))
      .slice(10, 402);
    var refl = image.select(bandNames).divide(10000);
    var weights = ee.Image.constant(E_CONV_NIS.toList());
    var weightedSum = refl.multiply(weights).reduce(ee.Reducer.sum());
    return weightedSum.divide(E_SUM_FULL)
      .rename('Albedo')
      .updateMask(waterMask)
      .clamp(0, 1);
  }

  // Main dispatch: compute and add the selected derived product as a map layer.
  // collectionName distinguishes 'Derived Terrain Products (from DP3.30024.001)' (image IS a DEM tile)
  // from the HSI-based derived collections (image is a reflectance tile).
  function addDerivedProductLayer(image, productName, layerLabel, collectionName) {
    var vis = DERIVED_VIS[productName];
    var label = layerLabel + productName;
    // Determine which legend slot to populate from the layer label
    var slotNum = (layerLabel.indexOf('1st') !== -1) ? 1 : 2;
    var meta = DERIVED_LEGEND_META[productName];

    // Record the natural (pre-override) stretch, then apply any active manual
    // override for this slot (Universal Image Display Adjustments panel).
    // Only min/max are overridden; gamma is intentionally omitted below since
    // Image.visualize() disallows combining gamma with a fixed color palette
    // (all derived products use a palette). The recorded gamma of 1.0 here is
    // display-only, for the adjustment panel's Gamma slider (which is disabled
    // for these product types).
    naturalVisParamsBySlot[slotNum] = {min: vis.min, max: vis.max, gamma: 1.0};
    vis = applyManualOverride(slotNum, {min: vis.min, max: vis.max, palette: vis.palette});
    effectiveVisParamsBySlot[slotNum] = {min: vis.min, max: vis.max, gamma: 1.0};

    // Terrain products
    var terrainBandMap = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'};
    if (terrainBandMap.hasOwnProperty(productName)) {
      var terrainBand = terrainBandMap[productName];
      var terrainResult;
      if (collectionName === 'Derived Terrain Products (from DP3.30024.001)') {
        terrainResult = ee.Terrain.products(image.select('DTM'));
      } else {
        var demCollection = ee.ImageCollection('projects/neon-prod-earthengine/assets/DEM/001')
          .filterBounds(image.geometry())
          .filter(ee.Filter.eq('FLIGHT_YEAR', image.get('FLIGHT_YEAR')));
        terrainResult = demCollection.select('DTM').map(function(tile) {
          return ee.Terrain.products(tile);
        }).mosaic();
      }
      var terrainBandResult = terrainResult.select(terrainBand);
      Map.addLayer(terrainBandResult, vis, label);
      var legendLabels = createDerivedLegend(productName, slotNum);
      terrainBandResult.reduceRegion({
        reducer: ee.Reducer.minMax(),
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true
      }).evaluate(function(stats) {
        if (!stats) return;
        var mn = stats[terrainBand + '_min'], mx = stats[terrainBand + '_max'];
        if (mn !== null && mn !== undefined) legendLabels.min.setValue(mn.toFixed(meta.decimals) + meta.unit);
        if (mx !== null && mx !== undefined) legendLabels.max.setValue(mx.toFixed(meta.decimals) + meta.unit);
      });
      return;
    }

    // Surface Albedo  computed from whichever reflectance collection is selected
    if (productName === 'Albedo') {
      var albedoResult = computeAlbedo(image, vi_getWaterMask(image));
      Map.addLayer(albedoResult, vis, label);
      var legendLabels = createDerivedLegend(productName, slotNum);
      albedoResult.reduceRegion({
        reducer: ee.Reducer.minMax(),
        scale: 10,
        maxPixels: 1e9,
        bestEffort: true
      }).evaluate(function(stats) {
        if (!stats) return;
        var mn = stats['Albedo_min'], mx = stats['Albedo_max'];
        if (mn !== null && mn !== undefined) legendLabels.min.setValue(mn.toFixed(meta.decimals) + meta.unit);
        if (mx !== null && mx !== undefined) legendLabels.max.setValue(mx.toFixed(meta.decimals) + meta.unit);
      });
      return;
    }

    // Vegetation / water indices
    var b = vi_precompute(image);
    var result;
    if      (productName === 'NDVI') result = vi_ndvi(b);
    else if (productName === 'EVI')  result = vi_evi(b);
    else if (productName === 'ARVI') result = vi_arvi(b);
    else if (productName === 'PRI')  result = vi_pri(b);
    else if (productName === 'SAVI') result = vi_savi(b);
    else if (productName === 'LAI')  result = vi_lai(b);
    else if (productName === 'fPAR') result = vi_fpar(b);
    else if (productName === 'WBI')  result = wi_wbi(image,  b.water);
    else if (productName === 'NMDI') result = wi_nmdi(image, b.water);
    else if (productName === 'NDWI') result = wi_ndwi(image, b.water);
    else if (productName === 'NDII') result = wi_ndii(image, b.water);
    else if (productName === 'MSI')  result = wi_msi(image,  b.water);
    Map.addLayer(result, vis, label);
    var legendLabels = createDerivedLegend(productName, slotNum);
    result.reduceRegion({
      reducer: ee.Reducer.minMax(),
      scale: 10,
      maxPixels: 1e9,
      bestEffort: true
    }).evaluate(function(stats) {
      if (!stats) return;
      var mn = stats[productName + '_min'], mx = stats[productName + '_max'];
      if (mn !== null && mn !== undefined) legendLabels.min.setValue(mn.toFixed(meta.decimals) + meta.unit);
      if (mx !== null && mx !== undefined) legendLabels.max.setValue(mx.toFixed(meta.decimals) + meta.unit);
    });
  }

  // Check whether a same-year DEM tile exists for the currently selected HSI image.
  // Sets demAvailableForYear and shows/hides the terrain warning label (Option B).
  function checkDemAvailability(hsiImage) {
    demAvailableForYear = null;           // unknown while the async check runs
    terrainWarningLabel.style().set('shown', false);

    hsiImage.get('FLIGHT_YEAR').evaluate(function(flightYear) {
      var site = neonSiteSelect.getValue();
      // DEM collection is keyed to the primary site ID; resolve alias sites via pairedSiteMap
      var demSite = pairedSiteMap[site] || site;
      var demCount = ee.ImageCollection('projects/neon-prod-earthengine/assets/DEM/001')
        .filter(ee.Filter.eq('NEON_SITE', demSite))
        .filter(ee.Filter.eq('FLIGHT_YEAR', flightYear))
        .size();

      demCount.evaluate(function(count) {
        demAvailableForYear = (count > 0);

        if (!demAvailableForYear) {
          terrainWarningLabel.style().set('shown', true);
          // If a terrain product is currently active, fall back to NDVI
          var isTerrainActive = (currentDerivedProduct === 'Slope' ||
                                currentDerivedProduct === 'Aspect' ||
                                currentDerivedProduct === 'Hillshade');
          if (isTerrainActive) {
            currentDerivedProduct = 'NDVI';
            Object.keys(derivedCheckboxes).forEach(function(key) {
              derivedCheckboxes[key].setValue(key === 'NDVI', false);
            });
            updateMap(select1.getValue(), select2.getValue(), currentVisParams);
          }
        } else {
          terrainWarningLabel.style().set('shown', false);
        }
      });
    });
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

  // Normalize CNC band names â€” transparently handles both old (nitrogen_valid, etc.)
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
    // Clear all layers; MODIS EVI and NLCD are re-added in explicit order below
    // so that NLCD always renders above MODIS EVI but below all AOP layers.
    Map.layers().reset([]);

    if (!selectedImageName1) {
      // No image selected â€” restore NLCD only if its checkbox is checked
      if (nlcdCheckbox.getValue()) {
        nlcdLayer = Map.addLayer(nlcd2021.select('landcover'), null, 'NLCD Landcover', true);
      }
      naturalVisParamsBySlot[1] = null;
      naturalVisParamsBySlot[2] = null;
      effectiveVisParamsBySlot[1] = null;
      effectiveVisParamsBySlot[2] = null;
      updateUniversalAdjustPanel();
      return;
    }

    // Filter the collections for selected images
    var collection1 = imageCollections[selectCollection1.getValue()];
    selectedImage1 = collection1.filter(ee.Filter.eq('system:index', selectedImageName1)).first();

    // Layer order (bottom â†’ top): MODIS EVI â†’ NLCD â†’ AOP layers
    // Add MODIS EVI first (bottommost) if enabled
    if (modisEviVisible) {
      var neonDate = selectedImage1.date();
      // Cap search end at decommission date so a valid composite is always found post-2026
      var modisSearchEnd = ee.Date(ee.Algorithms.If(
        neonDate.millis().gt(MODIS_DECOMMISSION_DATE.millis()),
        MODIS_DECOMMISSION_DATE,
        neonDate
      ));
      var modisEviImage = ee.ImageCollection('MODIS/061/MOD13Q1')
        .filterDate(modisSearchEnd.advance(-30, 'day'), modisSearchEnd)
        .sort('system:time_start', false)
        .first();
      Map.addLayer(modisEviImage.select('EVI'), MODIS_EVI_VIS, 'MODIS EVI (closest to flight date)');
      // Update the date label in the ancillary panel asynchronously
      modisEviImage.date().format('MMM dd YYYY').evaluate(function(dateStr) {
        modisEviDateLabel.setValue('(' + dateStr + ')');
      });
    }

    // Re-add NLCD above MODIS EVI, but only when its checkbox is checked
    if (nlcdCheckbox.getValue()) {
      nlcdLayer = Map.addLayer(nlcd2021.select('landcover'), null, 'NLCD Landcover', true);
    }

    selectedImage2 = null;
    naturalVisParamsBySlot[2] = null;
    effectiveVisParamsBySlot[2] = null;
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
        (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || 
        selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
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

    if (selectCollection1.getValue() === "Digital Surface Model (DP3.30024.001)") {
      visParams1 = getDynamicDSMVisParams(selectedImage1);
    } else if (selectCollection1.getValue() === "Digital Terrain Model (DP3.30024.001)") {
      visParams1 = getDynamicDTMVisParams(selectedImage1);
    } else if (selectCollection1.getValue() === "Canopy Height Model (DP3.30015.001)") {
      visParams1 = getDynamicCHMVisParams(selectedImage1);
    } else if (selectCollection1.getValue() === "RGB Camera Photography (DP3.30010.001)") {
      visParams1 = visParamsRGB;
    } else if (selectCollection1.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
      visParams1 = getNitrogenVisParams(selectedImage1, 1);
    }

    // Record the natural (pre-override) stretch, then apply any active manual
    // override for the 1st Image slot (Universal Image Display Adjustments panel).
    naturalVisParamsBySlot[1] = {
      min: visParams1.min,
      max: visParams1.max,
      gamma: (visParams1.gamma !== undefined ? visParams1.gamma : 1.0)
    };
    visParams1 = applyManualOverride(1, visParams1);
    effectiveVisParamsBySlot[1] = {
      min: visParams1.min,
      max: visParams1.max,
      gamma: (visParams1.gamma !== undefined ? visParams1.gamma : 1.0)
    };

    if (selectedImage2) {
      // Check if PUUM site and adjust Natural Color bands for spectrometer collections (2nd image)
      if (selectedSite === 'PUUM' && 
          (selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || 
          selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
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
      
      if (selectCollection2.getValue() === "Digital Surface Model (DP3.30024.001)") {
        visParams2 = getDynamicDSMVisParams(selectedImage2);
      } else if (selectCollection2.getValue() === "Digital Terrain Model (DP3.30024.001)") {
        visParams2 = getDynamicDTMVisParams(selectedImage2);
      } else if (selectCollection2.getValue() === "Canopy Height Model (DP3.30015.001)") {
        visParams2 = getDynamicCHMVisParams(selectedImage2);
      } else if (selectCollection2.getValue() === "RGB Camera Photography (DP3.30010.001)") {
        visParams2 = visParamsRGB;
      } else if (selectCollection2.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
        visParams2 = getNitrogenVisParams(selectedImage2, 2);
      }

      // Record the natural (pre-override) stretch, then apply any active manual
      // override for the 2nd Image slot (Universal Image Display Adjustments panel).
      naturalVisParamsBySlot[2] = {
        min: visParams2.min,
        max: visParams2.max,
        gamma: (visParams2.gamma !== undefined ? visParams2.gamma : 1.0)
      };
      visParams2 = applyManualOverride(2, visParams2);
      effectiveVisParamsBySlot[2] = {
        min: visParams2.min,
        max: visParams2.max,
        gamma: (visParams2.gamma !== undefined ? visParams2.gamma : 1.0)
      };
    }

    // Apply cloud filter if needed and only for SDR or BRDF collections
    if (cloudFilterSelect.getValue() === '< 10% Cloud Cover') {
      if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
        selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').eq(1));
      }
      if (selectedImage2 && (selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
        selectedImage2 = selectedImage2.updateMask(selectedImage2.select('Weather_Quality_Indicator').eq(1));
      }
    } else if (cloudFilterSelect.getValue() === '< 50% Cloud Cover') {
      if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
        selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').gte(1).and(selectedImage1.select('Weather_Quality_Indicator').lte(2)));
      }
      if (selectedImage2 && (selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
        selectedImage2 = selectedImage2.updateMask(selectedImage2.select('Weather_Quality_Indicator').gte(1).and(selectedImage2.select('Weather_Quality_Indicator').lte(2)));
      }
    }
    
    // Add layers with the appropriate visualization parameters and NaN masking for DSM/DTM
    var displayImage1 = selectedImage1;
    if (selectCollection1.getValue() === "Digital Surface Model (DP3.30024.001)" || 
        selectCollection1.getValue() === "Digital Terrain Model (DP3.30024.001)") {
      displayImage1 = maskNaN(selectedImage1);
    } else if (selectCollection1.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
      displayImage1 = maskNitrogen(selectedImage1);
    }
    selectedImage1 = displayImage1;
    
    if (selectedImage2) {
      var displayImage2 = selectedImage2;
      if (selectCollection2.getValue() === "Digital Surface Model (DP3.30024.001)" || 
          selectCollection2.getValue() === "Digital Terrain Model (DP3.30024.001)") {
        displayImage2 = maskNaN(selectedImage2);
      } else if (selectCollection2.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
        displayImage2 = maskNitrogen(selectedImage2);
      }
      selectedImage2 = displayImage2;
    }
    
    // Helper: true when a collection routes through the derived-product compute pipeline
    var isDerivedColl = function(col) {
      return col === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)' ||
             col === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)' ||
             col === 'Derived Terrain Products (from DP3.30024.001)';
    };
    // Returns the correct active product for a given collection slot
    var getActiveProduct = function(col) {
      return (col === 'Derived Terrain Products (from DP3.30024.001)') ? currentTerrainProduct : currentDerivedProduct;
    };

    // Add layers with the appropriate visualization parameters
    if (isDerivedColl(selectCollection1.getValue())) {
      // Route to derived product compute pipeline instead of displaying raw reflectance
      addDerivedProductLayer(selectedImage1, getActiveProduct(selectCollection1.getValue()), '1st Image: ', selectCollection1.getValue());
    } else {
      Map.addLayer(selectedImage1, visParams1, '1st Image: ' + selectedImageName1);
    }
    
    if (selectedImage2) {
      if (isDerivedColl(selectCollection2.getValue())) {
        addDerivedProductLayer(selectedImage2, getActiveProduct(selectCollection2.getValue()), '2nd Image: ', selectCollection2.getValue());
      } else {
        Map.addLayer(selectedImage2, visParams2, '2nd Image: ' + selectedImageName2);
      }
    }

    // Sync the Universal Image Display Adjustments panel (visibility, enabled
    // slots, and displayed Min/Max/Gamma fields) with the images just rendered.
    updateUniversalAdjustPanel();
    
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
          var metaStyle = {fontSize: '11px', margin: '5px 4px'};
          if (status === 'RELEASED') {
            image.get('RELEASE_YEAR').evaluate(function(releaseYear) {
              var statusLabel = releaseYear ? 'RELEASE-' + releaseYear : 'RELEASED';
              image.get('DOI').evaluate(function(doi) {
                var doiWidget = doi
                  ? ui.Panel([
                      ui.Label({value: imageLabel + ' DOI:', style: {fontSize: '11px', margin: '0', padding: '0'}}),
                      ui.Label({value: doi, targetUrl: doi, style: {fontSize: '11px', color: '0000EE', margin: '0 0 0 4px', padding: '0'}})
                    ], ui.Panel.Layout.flow('horizontal'), {margin: '5px 4px', padding: '0'})
                  : ui.Label({value: imageLabel + ' DOI: N/A', style: metaStyle});
                var metadataContent = [
                  ui.Label({value: imageLabel + ' Acquisition Start Date: ' + startDate, style: metaStyle}),
                  ui.Label({value: imageLabel + ' Acquisition End Date: ' + endDate, style: metaStyle}),
                  ui.Label({value: imageLabel + ' Status: ' + statusLabel, style: metaStyle}),
                  doiWidget
                ];
                metadataPanels[imageLabel] = ui.Panel(metadataContent, ui.Panel.Layout.flow('vertical'));
                updateMetadataPanel();
              });
            });
          } else {
            image.get('DOI').evaluate(function(doi) {
              var doiWidget = doi
                ? ui.Panel([
                    ui.Label({value: imageLabel + ' DOI:', style: {fontSize: '11px', margin: '0', padding: '0'}}),
                    ui.Label({value: doi, targetUrl: doi, style: {fontSize: '11px', color: '0000EE', margin: '0 0 0 4px', padding: '0'}})
                  ], ui.Panel.Layout.flow('horizontal'), {margin: '5px 4px', padding: '0'})
                : ui.Label({value: imageLabel + ' DOI: N/A', style: metaStyle});
              var metadataContent = [
                ui.Label({value: imageLabel + ' Acquisition Start Date: ' + startDate, style: metaStyle}),
                ui.Label({value: imageLabel + ' Acquisition End Date: ' + endDate, style: metaStyle}),
                ui.Label({value: imageLabel + ' Status: PROVISIONAL', style: metaStyle}),
                doiWidget
              ];
              metadataPanels[imageLabel] = ui.Panel(metadataContent, ui.Panel.Layout.flow('vertical'));
              updateMetadataPanel();
            });
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
  // Returns true for collections that support pixel-value inspection on click.
  // Reflectance collections are handled by the spectral chart; RGB and Hillshade
  // have no informative scalar value worth displaying.
  function isPixelInfoEligible(collectionName) {
    if (!collectionName) return false;
    if (collectionName === 'Spectrometer Directional Reflectance (DP3.30006.001)' ||
        collectionName === 'Spectrometer Bidirectional Reflectance (DP3.30006.002)' ||
        collectionName === 'RGB Camera Photography (DP3.30010.001)') return false;
    if (collectionName === 'Derived Terrain Products (from DP3.30024.001)' && currentTerrainProduct === 'Hillshade') return false;
    if ((collectionName === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)' ||
         collectionName === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)') &&
        currentDerivedProduct === 'Hillshade') return false;
    return true;
  }

  // Samples a single pixel from the appropriate image/band for the given collection
  // and appends the formatted result as a label to targetPanel (async via evaluate).
  function samplePixelInfo(collectionName, rawImage, imageSlotNum, point, targetPanel) {
    var isDerived = (collectionName === 'Derived Indices (from DP3.30006.002 - BiDir. Refl.)' ||
                    collectionName === 'Derived Indices (from DP3.30006.001 - Dir. Refl.)' ||
                    collectionName === 'Derived Terrain Products (from DP3.30024.001)');
    var isTerrain = (collectionName === 'Derived Terrain Products (from DP3.30024.001)');
    var resultLabel = ui.Label({
      value: '\u2026',  // ellipsis placeholder while async result loads
      style: {fontSize: '12px', color: '#0000cc', fontWeight: 'bold', margin: '0 4px 1px 4px', fontFamily: 'monospace'}
    });
    targetPanel.add(resultLabel);

    if (collectionName === 'Canopy Height Model (DP3.30015.001)') {
      rawImage.select('CHM').reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var v = (r && r['CHM'] !== null && r['CHM'] !== undefined) ? r['CHM'].toFixed(2) + ' m' : 'masked';
        resultLabel.setValue('CHM: ' + v);
      });

    } else if (collectionName === 'Digital Surface Model (DP3.30024.001)') {
      rawImage.select('DSM').reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var v = (r && r['DSM'] !== null && r['DSM'] !== undefined) ? r['DSM'].toFixed(2) + ' m' : 'masked';
        resultLabel.setValue('DSM: ' + v);
      });

    } else if (collectionName === 'Digital Terrain Model (DP3.30024.001)') {
      rawImage.select('DTM').reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var v = (r && r['DTM'] !== null && r['DTM'] !== undefined) ? r['DTM'].toFixed(2) + ' m' : 'masked';
        resultLabel.setValue('DTM: ' + v);
      });

    } else if (collectionName === 'Canopy Nitrogen Content (DP3.30018.002)') {
      // When only image 2 is CNC, the UI reuses nitrogenBandSelect1 (labelled "2nd Image:"),
      // so user selections are stored in currentNitrogenBand1, not currentNitrogenBand2.
      var onlyImage2IsCNC = (imageSlotNum === 2 &&
        selectCollection1.getValue() !== 'Canopy Nitrogen Content (DP3.30018.002)');
      var nitroBandDisplay = onlyImage2IsCNC ? currentNitrogenBand1
                           : (imageSlotNum === 1) ? currentNitrogenBand1 : currentNitrogenBand2;
      var cncBandLookup = {
        'Percent Nitrogen (%)':                       {band: 'Nitrogen_Percent',               unit: ' %', dec: 3},
        'Canopy Nitrogen Model Uncertainty':          {band: 'Nitrogen_Uncertainty',            unit: ' %', dec: 3},
        'Needle Leaf/Non-Needle Leaf Classification': {band: 'Needle_Non-needle_Classification', unit: '',   dec: 0}
      };
      var cncMeta = cncBandLookup[nitroBandDisplay] || {band: 'Nitrogen_Percent', unit: ' %', dec: 3};
      normalizeCNCBandNames(rawImage).select(cncMeta.band).reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var raw = (r && r[cncMeta.band] !== null && r[cncMeta.band] !== undefined) ? r[cncMeta.band] : null;
        var v;
        if (raw === null) {
          v = 'masked';
        } else if (nitroBandDisplay === 'Needle Leaf/Non-Needle Leaf Classification') {
          v = (raw === 1) ? 'Non-Needle Leaf' : 'Needle Leaf';
        } else {
          v = raw.toFixed(cncMeta.dec) + cncMeta.unit;
        }
        resultLabel.setValue(nitroBandDisplay + ': ' + v);
      });

    } else if (isDerived && isTerrain) {
      var terrainBandKey = {Slope: 'slope', Aspect: 'aspect', Hillshade: 'hillshade'}[currentTerrainProduct];
      var terrainUnit = (currentTerrainProduct === 'Hillshade') ? '' : '\u00b0';
      // rawImage IS the DEM tile â€” compute terrain directly
      var terrainImage = ee.Terrain.products(rawImage.select('DTM'));
      terrainImage.select(terrainBandKey).reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var v = (r && r[terrainBandKey] !== null && r[terrainBandKey] !== undefined)
          ? r[terrainBandKey].toFixed(1) + terrainUnit : 'masked';
        resultLabel.setValue(currentTerrainProduct + ': ' + v);
      });

    } else if (isDerived) {
      // Surface Albedo  computed from whichever reflectance collection is selected
      if (currentDerivedProduct === 'Albedo') {
        var albedoClick = computeAlbedo(rawImage, vi_getWaterMask(rawImage));
        albedoClick.reduceRegion({
          reducer: ee.Reducer.first(), geometry: point, scale: 1
        }).evaluate(function(r) {
          var v = (r && r['Albedo'] !== null && r['Albedo'] !== undefined) ? r['Albedo'].toFixed(4) : 'masked';
          resultLabel.setValue('Albedo: ' + v);
        });
        return;
      }
      // Veg or water index: recompute from raw HSI image on the fly
      var b = vi_precompute(rawImage);
      var indexDispatch = {
        NDVI: function() { return vi_ndvi(b); },
        EVI:  function() { return vi_evi(b); },
        ARVI: function() { return vi_arvi(b); },
        PRI:  function() { return vi_pri(b); },
        SAVI: function() { return vi_savi(b); },
        LAI:  function() { return vi_lai(b); },
        fPAR: function() { return vi_fpar(b); },
        WBI:  function() { return wi_wbi(rawImage,  b.water); },
        NMDI: function() { return wi_nmdi(rawImage, b.water); },
        NDWI: function() { return wi_ndwi(rawImage, b.water); },
        NDII: function() { return wi_ndii(rawImage, b.water); },
        MSI:  function() { return wi_msi(rawImage,  b.water); }
      };
      var computeFn = indexDispatch[currentDerivedProduct];
      if (!computeFn) return;
      var viImage = computeFn();
      var viDec = (currentDerivedProduct === 'LAI') ? 2 : 4;
      viImage.reduceRegion({
        reducer: ee.Reducer.first(), geometry: point, scale: 1
      }).evaluate(function(r) {
        var key = currentDerivedProduct;
        var v = (r && r[key] !== null && r[key] !== undefined) ? r[key].toFixed(viDec) : 'masked';
        resultLabel.setValue(key + ': ' + v);
      });
    }
  }

  Map.onClick(function(coords) {
    // Only process spectral clicks when export panel is closed
    if (!spectralClickEnabled) {
      return; // Exit early if spectral clicking is disabled
    }
    // Define current images for use throughout the function
    var currentImage1 = selectedImage1;
    var currentImage2 = selectedImage2;

    // Determine if the collections are eligible for spectral curves
    var isEligibleCollection1 = selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" ||
                                selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)";
    var isEligibleCollection2 = selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" ||
                                selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)";

    // Clear panels if needed
    if (panel.style().get('shown')) {
      panel.style().set('shown', false);
      panel.clear();
    }

    if (panel2.style().get('shown')) {
      panel2.style().set('shown', false);
      panel2.clear();
    }

    // Always define point here so it's available for both spectral and pixel-info paths
    var point = ee.Geometry.Point(coords.lon, coords.lat);

    // Show spectral panels and build charts only for eligible reflectance collections
    if (isEligibleCollection1) {
      panel.style().set('shown', true);
    }

    if (isEligibleCollection2 && currentImage2) {
      panel2.style().set('shown', true);
    }

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

      var chart = ui.Chart.image.regions(selectedBands, point, null, 1, 'Î» (nm)', wavelengths.getInfo());
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

      var chart2 = ui.Chart.image.regions(selectedBands2, point, null, 1, 'Î» (nm)', wavelengths2.getInfo());
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

    // --- Pixel value info panel (non-reflectance, non-RGB images) ---
    pixelInfoPanel.clear();
    pixelInfoPanel.style().set('shown', false);
    var piC1 = selectCollection1.getValue();
    var piC2 = selectCollection2.getValue();
    var piEligible1 = isPixelInfoEligible(piC1) && currentImage1;
    var piEligible2 = isPixelInfoEligible(piC2) && currentImage2;
    if (piEligible1 || piEligible2) {
      pixelInfoPanel.add(ui.Label({
        value: 'Lon: ' + coords.lon.toFixed(4) + '  Lat: ' + coords.lat.toFixed(4),
        style: {fontSize: '10px', color: 'gray', fontWeight: 'bold', margin: '3px 4px 2px 4px'}
      }));
      if (piEligible1) {
        pixelInfoPanel.add(ui.Label({
          value: select1.getValue(),
          style: {fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a', margin: '2px 4px 0 4px'}
        }));
        samplePixelInfo(piC1, currentImage1, 1, point, pixelInfoPanel);
      }
      if (piEligible2) {
        pixelInfoPanel.add(ui.Label({
          value: select2.getValue(),
          style: {fontSize: '12px', fontWeight: 'bold', color: '#1a1a1a', margin: '4px 4px 0 4px'}
        }));
        samplePixelInfo(piC2, currentImage2, 2, point, pixelInfoPanel);
      }
      pixelInfoPanel.style().set('shown', true);
    }
  });
