// Author: J Musinsky, March 2026
// National Ecological Observatory Network, Battelle
// AOP Earth Engine Data Viewer app - mobile version

// Initialize the map with a default center and zoom level
Map.setCenter(-95.7129, 37.0902, 4); // Centered over the USA

// // Import the tree canopy cover collection
// var dataset = ee.ImageCollection('USGS/NLCD_RELEASES/2021_REL/TCC/v2021-4');
// var tcc = dataset.filter(ee.Filter.calendarRange(2021, 2021,'year'))
//               .filter('study_area == "CONUS"')
//               .first();

// // TCC palette
// var tcc_palette = [
//     'CDA066', 'D7C29E', 'C2D096', 'B7D692', 'ADDD8E', '78C679', 
//     '5CB86B', '41AB5D', '39A156', '329750', '238443', '11763D', '006837', '004529'
// ];

// // Add TCC layer to the map but set it to be hidden initially
// var tccLayer = Map.addLayer(tcc.select('Science_Percent_Tree_Canopy_Cover'), {min:0, max:60, palette: tcc_palette}, 'Tree Canopy Cover', false);

// Import the NLCD collection.
var dataset = ee.ImageCollection('USGS/NLCD_RELEASES/2021_REL/NLCD');
// Filter the collection to the 2021 product.
var nlcd2021 = dataset.filter(ee.Filter.eq('system:index', '2021')).first();
// // Select the land cover band.
// var landcover = nlcd2021.select('landcover');

// Add NLCD layer to the map but set it to be hidden initially
var nlcdLayer = Map.addLayer(nlcd2021.select('landcover'), null, 'NLCD Landcover', false);

// MODIS EVI background layer — matched to 1st image acquisition date
var modisEviVisible = false;
var MODIS_EVI_VIS = {
  min: 0, max: 7000,
  palette: ['FFFFFF', 'CE7E45', 'FCD163', '66A000', '207401', '011301']
};
var MODIS_DECOMMISSION_DATE = ee.Date('2026-12-31');

// Set the default map layer to Satellite
//Map.setOptions('SATELLITE');

// ----------------------------
// Define Image Collections
// ----------------------------

// Define available image collections
var imageCollections = {
  "Spectrometer Directional Reflectance (DP3.30006.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/001"),
  "Spectrometer Bidirectional Reflectance (DP3.30006.002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/HSI_REFL/002"),
  "Canopy Height Model (DP3.30015.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CHM/001"),
  "Digital Surface Model (DP3.30024.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
  "Digital Terrain Model (DP3.30024.001)": ee.ImageCollection("projects/neon-prod-earthengine/assets/DEM/001"),
  "RGB Camera Photography (DP3.30010.001)": ee.ImageCollection('projects/neon-prod-earthengine/assets/RGB/001'),
  "Canopy Nitrogen Content (DP3.30018.002)": ee.ImageCollection("projects/neon-prod-earthengine/assets/CNC/002")
};

// Define the TOS boundaries and TOS plot polygons feature collections
var terrestrialSamplingBoundaries = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/terrestrialSamplingBoundaries");
var TOSplots = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/All_NEON_TOS_Plot_Polygons_V11")
var airsheds = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/90percent_footprint");
var towers = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/NEON_Field_Sites_v17");
// Add NEON Flightbox Boundaries FeatureCollection
var neonFlightboxBoundaries = ee.FeatureCollection("projects/neon-prod-earthengine/assets/Feature_Collections/NEON_Flightbox_Boundaries_Merged");

// ----------------------------
// Set Up User Interface (UI)
// ----------------------------

// State variable to track main panel visibility
var isMainPanelVisible = true;

// Create the toggle button for showing/hiding the panel
var mainPanelToggleButton = ui.Button({
  label: 'Hide Left Panel', // Initial label
  style: {
    position: 'top-left', // Position at the top-left of the map
    padding: '5px', // Optional: Add some padding
    backgroundColor: 'white' // Optional: Distinct background color
  },
  onClick: function() {
    if (isMainPanelVisible) {
      // Hide the main panel
      Map.remove(scrollablePanel);
      mainPanelToggleButton.setLabel('Show Panel'); // Update button label
    } else {
      // Show the main panel
      Map.add(scrollablePanel);
      mainPanelToggleButton.setLabel('Hide Left Panel'); // Update button label
    }
    isMainPanelVisible = !isMainPanelVisible; // Toggle visibility state
  }
});

// Get the drawing tools widget
var drawingTools = Map.drawingTools();

// Remove the drawing tools from the map
Map.remove(drawingTools);

// Create the main panel
var mainPanel = ui.Panel({
  widgets: [], // Add widgets here
  style: {
    width: '315px', // Fixed width
    padding: '10px',
    backgroundColor: 'white', // Optional: Background color for clarity
  }
});

// Create a scrollable parent panel
var scrollablePanel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'), // Enable scrolling with a vertical layout
  style: {
    width: '325px', // Fixed width
    maxHeight: '80%', // Limit the height of the panel to enable scrolling
    position: 'top-left', // Position on the map
    backgroundColor: 'white', // Optional: Background color
  }
});

// Add widgets to the main panel
//mainPanel.add(ui.Label('Main Panel Content')); // Example widget

// Add the toggle button directly to the map
Map.add(mainPanelToggleButton);

// Add the main panel to the scrollable parent panel
scrollablePanel.add(mainPanel);

// Add the scrollable parent panel to the map
Map.add(scrollablePanel);


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

// Fetch distinct NEON_SITE and NEON_SITE_NAME pairs
var siteNamePairs = mergedCollections
  .distinct(['NEON_SITE', 'NEON_SITE_NAME']) // Get unique combinations of NEON_SITE and NEON_SITE_NAME
  .reduceColumns({
    reducer: ee.Reducer.toList(2), // Collect pairs of NEON_SITE and NEON_SITE_NAME
    selectors: ['NEON_SITE', 'NEON_SITE_NAME']
  })
  .get('list'); // Get the list of pairs

// Convert siteNamePairs into a JavaScript list
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

// Update function to populate the first image dropdown based on the selected NEON_SITE and first collection
function updateImageDropdown1(selectedSite) {
  var collection1 = imageCollections[selectCollection1.getValue()];

  if (collection1 && selectedSite) {
    // Resolve the GEE site ID: alias sites (e.g. DCFS) map to a primary site (e.g. WOOD)
    var geeSite1 = pairedSiteMap[selectedSite] || selectedSite;
    // Filter the first collection by the GEE site ID
    collection1 = collection1.filter(ee.Filter.eq('NEON_SITE', geeSite1));

    // Retrieve the image indices for the filtered collection
    var imageList = collection1.aggregate_array('system:index').getInfo();

    // For paired alias sites, show labels with the alias ID but keep the real index as value
    var dropdownItems1 = pairedSiteMap[selectedSite]
      ? imageList.map(function(idx) {
          return {label: idx.replace(geeSite1, selectedSite), value: idx};
        })
      : imageList;

    // Reset dropdown options for the first image selection
    select1.items().reset(dropdownItems1);
    select1.setPlaceholder(imageList.length ? 'Select the 1st image' : 'No images for this site from this collection');

    // Clear the selection to wait for user input
    select1.setValue(null);

    // Clear the map for the first image layer
    updateMap(null, select2.getValue(), currentVisParams);
  }
}

// Update function to populate the second image dropdown based on the selected NEON_SITE and second collection
function updateImageDropdown2(selectedSite) {
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

// Create a horizontal panel with flow layout to center the Title
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

// Create a horizontal panel with flow layout to center the URL link text
var URLhorizontalPanel = ui.Panel({
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

var URLspacerRight = ui.Label({
  value: ' ',
  style: {stretch: 'horizontal'}
});

URLhorizontalPanel.add(URLspacerLeft);
URLhorizontalPanel.add(linkLabel);
URLhorizontalPanel.add(URLspacerRight);

var versionLabel = ui.Label({
  value: 'v10.2  |  March 2026',
  style: {fontSize: '10px', fontStyle: 'italic', color: '#666666', margin: '4px 0 0 0', textAlign: 'center', stretch: 'horizontal'}
});


// State variable to track right-side panel visibility
var isRightPanelVisible = false;

// Create the right-side panel toggle button
var rightPanelToggleButton = ui.Button({
  label: 'Show Right Panel', // Initial label
  style: {
    position: 'top-right', // Position at the top-right of the map
    padding: '5px', // Optional: Add some padding
    backgroundColor: 'white' // Optional: Distinct background color
  },
  onClick: function() {
    if (isRightPanelVisible) {
      // Hide the right-side panel
      Map.remove(rightPanel);
      rightPanelToggleButton.setLabel('Show Right Panel'); // Update button label
    } else {
      // Show the right-side panel
      Map.add(rightPanel);
      rightPanelToggleButton.setLabel('Hide Panel'); // Update button label
    }
    isRightPanelVisible = !isRightPanelVisible; // Toggle visibility state
  }
});

// Add the toggle button for the right panel to the map
Map.add(rightPanelToggleButton);

// Create a new panel for ancillary layers that will be positioned at the top right of the map
var rightPanel = ui.Panel({
  style: {
    width: '250px', //'25%',
    padding: '10px',
    position: 'top-right'
  }
});

// Create a title for top right panel
var rightPanelTitle = ui.Label({
  value: 'Display Ancillary Layers', 
  style: {color: '4A997E', fontSize: '16px', fontWeight: 'bold', },
});

rightPanel.add(rightPanelTitle)

//Map.add(rightPanel);

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

// Add checkboxes to the right panel using Object.keys andmanually iterate over the keys of the object to access the values
Object.keys(checkboxList).forEach(function(key) {
  rightPanel.add(checkboxList[key]);
});
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
  color: 'yellow', // Outline color
  fillColor: "#00000000" // Transparent fill
};
var towerStyle = {
  color: 'yellow', // Outline color
  fillColor: 'red',
  pointSize: 5
};
var airshedStyle = {
  color: 'white', // Outline color
  //fillColor: 'gray',
  fillColor: '#80808080'  // gray with 50% opacity (80 = 128/255) 
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
    position: 'bottom-right',
    shown: false // Start hidden
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

// MODIS EVI checkbox — appears below NLCD in the ancillary panel
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

// Hide the custom bands panel by default
customBandsPanel.style().set('shown', false);

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

// Create reflectance filters panel (initially hidden) — shown only when a spectrometer collection is selected
var reflectanceFiltersPanel = ui.Panel({
  widgets: [
    ui.Panel([
      ui.Label({
        value: '_________________________________________',
        style: {fontWeight: 'bold', color: '4A997E'}
      })
    ]),
    ui.Panel({
      widgets: [
        ui.Panel([
          ui.Label({value: ' ', style: {stretch: 'horizontal'}}),
          ui.Panel([
            ui.Label({
              value: 'Reflectance Image Filters',
              style: {fontSize: '12px', fontWeight: 'bold', color: '4A997E'}
            })
          ]),
          ui.Label({value: ' ', style: {stretch: 'horizontal'}})
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

// Function to show/hide reflectance filters based on selected collections
function updateFilterPanelVisibility() {
  var collection1 = selectCollection1.getValue();
  var collection2 = selectCollection2.getValue();

  var isSpecRefl = function(col) {
    return col === 'Spectrometer Directional Reflectance (DP3.30006.001)' ||
           col === 'Spectrometer Bidirectional Reflectance (DP3.30006.002)';
  };

  var showReflectance = (collection1 && isSpecRefl(collection1)) ||
                        (collection2 && isSpecRefl(collection2));
  reflectanceFiltersPanel.style().set('shown', showReflectance);
}

//This creates another panel to house a line separator and instructions for the user
var metaTitle = ui.Panel([
  ui.Label({
    //value: '--------------Image Metadata--------------',
    value: '_________________________________________',
    style: {fontWeight: 'bold',  color: '4A997E'},
  }),
  // ui.Label({
  //   //value:'Image Metadata',
  //   value:'',
  //   style: {fontSize: '12px', fontWeight: 'bold'}
  //})]);
  ]);

mainPanel.add(metaTitle);

// Add the horizontal panel with NEON Data Portal URL link to the main panel
mainPanel.add(URLhorizontalPanel);

// Add the version label
mainPanel.add(versionLabel);

var metadataPanel = ui.Panel({
  style: {width: '100%', padding: '8px', border: '1px solid #ccc', margin: '10px 0'}
});
mainPanel.add(metadataPanel);

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

// Variable to store the last selected site
var lastSelectedSite = null;

// ----------------------------
// CNC / Nitrogen Helper Functions
// ----------------------------

// Normalize CNC band names to handle both old and new naming conventions
function normalizeCNCBandNames(image) {
  var bandNames = image.bandNames();
  return ee.Image(ee.Algorithms.If(
    bandNames.contains('nitrogen_valid'),
    image.rename(bandNames.map(function(b) {
      b = ee.String(b);
      return ee.String(ee.Dictionary({
        'nitrogen':                'Nitrogen_Percent',
        'nitrogen_uncertainty':    'Nitrogen_Uncertainty',
        'nitrogen_classification': 'Needle_Non-needle_Classification',
        'nitrogen_valid':          'Valid_Pixel_Classification'
      }).get(b, b));
    })),
    image
  ));
}

// Mask nitrogen image using the Valid_Pixel_Classification band
function maskNitrogen(image) {
  image = normalizeCNCBandNames(image);
  var nit_valid = image.select('Valid_Pixel_Classification');
  return image.updateMask(nit_valid);
}

// Get dynamic visualization parameters for Percent Nitrogen (2.5–97.5 percentile stretch)
function getNitrogenVisParams(nitrogenImage) {
  var maskedNitrogen = maskNitrogen(nitrogenImage).select('Nitrogen_Percent');
  var nitrogenPercentClip = maskedNitrogen.reduceRegion({
    reducer: ee.Reducer.percentile([2.5, 97.5]),
    scale: 10,
    maxPixels: 3e7
  });
  var keys = nitrogenPercentClip.keys();
  var minVal = ee.Number(nitrogenPercentClip.get(keys.get(0))).getInfo();
  var maxVal = ee.Number(nitrogenPercentClip.get(keys.get(1))).getInfo();
  if (minVal === maxVal) { minVal = 0; maxVal = 4; }
  return {
    bands: ['Nitrogen_Percent'],
    min: minVal,
    max: maxVal,
    palette: ['#440154', '#3b528b', '#21908c', '#5dc963', '#fde725']
  };
}

// Function to mask NaN values while preserving zeros
function maskNaN(image) {
  var mask = image.expression(
    'img == img', {
      'img': image
  });
  return image.updateMask(mask);
}

function updateMap(selectedImageName1, selectedImageName2, visParams) {
  // Clear all layers; layer order (bottom → top): MODIS EVI → NLCD → AOP layers
  Map.layers().reset([]);

  if (!selectedImageName1) {
    // No image selected — restore NLCD only if its checkbox is checked
    if (nlcdCheckbox.getValue()) {
      nlcdLayer = Map.addLayer(nlcd2021.select('landcover'), null, 'NLCD Landcover', true);
    }
    return;
  }

  // Filter the collections for selected images
  var collection1 = imageCollections[selectCollection1.getValue()];
  var selectedImage1 = collection1.filter(ee.Filter.eq('system:index', selectedImageName1)).first();

  // Add MODIS EVI first (bottommost layer) if enabled
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

  var selectedImage2 = null;
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
    visParams1 = getNitrogenVisParams(selectedImage1);
  }

  if (selectedImage2) {
    // Check if PUUM site and adjust Natural Color bands for spectrometer collections (2nd image)
    if (selectedSite === 'PUUM' &&
        (selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" ||
        selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
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
      visParams2 = getNitrogenVisParams(selectedImage2);
    }
  }

  // Apply cloud filter if needed and only for SDR or BRDF collections
  if (cloudFilterSelect.getValue() === '< 10% Cloud Cover') {
    if (selectCollection1.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection1.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)") {
      selectedImage1 = selectedImage1.updateMask(selectedImage1.select('Weather_Quality_Indicator').eq(1));
    }
    if (selectedImage2 && (selectCollection2.getValue() === "Spectrometer Directional Reflectance (DP3.30006.001)" || selectCollection2.getValue() === "Spectrometer Bidirectional Reflectance (DP3.30006.002)")) {
      selectedImage2 = selectedImage2.updateMask(selectedImage2.select('Weather_Quality_Indicator').eq(1));
    }
  }
  
  // Apply appropriate masking per collection type
  var displayImage1 = selectedImage1;
  if (selectCollection1.getValue() === "Digital Surface Model (DP3.30024.001)" || 
      selectCollection1.getValue() === "Digital Terrain Model (DP3.30024.001)") {
    displayImage1 = maskNaN(selectedImage1);
  } else if (selectCollection1.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
    displayImage1 = maskNitrogen(selectedImage1);
  }
  var selectedImage1 = displayImage1;
  
  if (selectedImage2) {
    var displayImage2 = selectedImage2;
    if (selectCollection2.getValue() === "Digital Surface Model (DP3.30024.001)" || 
        selectCollection2.getValue() === "Digital Terrain Model (DP3.30024.001)") {
      displayImage2 = maskNaN(selectedImage2);
    } else if (selectCollection2.getValue() === "Canopy Nitrogen Content (DP3.30018.002)") {
      displayImage2 = maskNitrogen(selectedImage2);
    }
    var selectedImage2 = displayImage2;
  }
  
  // Add layers with the appropriate visualization parameters
  Map.addLayer(selectedImage1, visParams1, '1st Image: ' + selectedImageName1);
  
  if (selectedImage2) {
    Map.addLayer(selectedImage2, visParams2, '2nd Image: ' + selectedImageName2);
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

}

// ----------------------------
// Live GPS link panel
// ---------------------------- 

// State variables
var isGPSPanelVisible = false;
var watchId = null;  // Store the watchPosition ID
var isTracking = false;  // Track if GPS is currently active
var currentMarker = null;

// Create the GPS panel toggle button
var GPSPanelToggleButton = ui.Button({
  label: 'Show GPS Panel',
  style: {
    position: 'bottom-left',
    padding: '5px',
    backgroundColor: 'white'
  },
  onClick: function() {
    if (isGPSPanelVisible) {
      Map.remove(GPSPanel);
      GPSPanelToggleButton.setLabel('Show GPS Panel');
    } else {
      Map.add(GPSPanel);
      GPSPanelToggleButton.setLabel('Hide Panel');
    }
    isGPSPanelVisible = !isGPSPanelVisible;
  }
});

// Create auto-center checkbox
var autoCenterCheckbox = ui.Checkbox({
  label: 'Auto-center map on GPS',
  value: false,
  style: {
    fontSize: '11px'
  }
});

// Create UI elements for GPS controls
var GPSPanel = ui.Panel({
  style: {
    position: 'bottom-left'
  }
});

var startButton = ui.Button({
  label: 'Start GPS Tracking',
  onClick: function() {
    if (!isTracking) {
      startTracking();
    } else {
      stopTracking();
    }
  }
});

var locationLabel = ui.Label({
  value: 'GPS Status: Not tracking',
  style: {
    fontSize: '11px'
  }
});

// Add elements to panel
GPSPanel.add(startButton);
GPSPanel.add(autoCenterCheckbox);
GPSPanel.add(locationLabel);

// Add toggle button to map
Map.add(GPSPanelToggleButton);

function updatePosition(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  
  // Update status label
  locationLabel.setValue('GPS Location: ' + 
    lat.toFixed(6) + ', ' + lon.toFixed(6));
  
  // Remove previous marker if it exists
  if (currentMarker) {
    Map.layers().remove(currentMarker);
  }
  
  // Create new marker at current location
  var point = ee.Geometry.Point([lon, lat]);
  var marker = ee.Feature(point);
  var markerStyle = {
    color: 'cyan',
    pointSize: 20,
    pointShape: 'circle',
    width: 8
  };
  
  // Add marker to map
  currentMarker = Map.addLayer(marker, markerStyle, 'Current Location');
  
  // Center map if auto-center is enabled
  if (autoCenterCheckbox.getValue()) {
    Map.setCenter(lon, lat, 16);
  }
}

function startTracking() {
  if ("geolocation" in navigator) {
    locationLabel.setValue('GPS Status: Starting...');
    isTracking = true;
    
    // Start watching position
    watchId = navigator.geolocation.watchPosition(
      updatePosition,  // Success callback
      function(error) {
        // Handle errors
        switch(error.code) {
          case error.PERMISSION_DENIED:
            locationLabel.setValue('GPS Status: Permission denied');
            break;
          case error.POSITION_UNAVAILABLE:
            locationLabel.setValue('GPS Status: Position unavailable');
            break;
          case error.TIMEOUT:
            locationLabel.setValue('GPS Status: Timeout');
            break;
          default:
            locationLabel.setValue('GPS Status: Unknown error');
            break;
        }
        stopTracking();  // Stop tracking on error
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,     // Allow positions up to 1 second old
        timeout: 10000        // Wait longer for position updates
      }
    );
    
    startButton.setLabel('Stop GPS Tracking');
  } else {
    locationLabel.setValue('GPS Status: Not supported in this browser');
  }
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  
  // Remove current marker
  if (currentMarker) {
    Map.layers().remove(currentMarker);
    currentMarker = null;
  }
  
  isTracking = false;
  locationLabel.setValue('GPS Status: Not tracking');
  startButton.setLabel('Start GPS Tracking');
}