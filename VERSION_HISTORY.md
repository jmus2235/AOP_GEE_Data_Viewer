# AOP GEE Data Viewer: version history

## V10.6 (09/24/2026)
- Added multiple spectral curve selection capability to spectral curve panels; markers and spectra of different colors appear in map and plots when selecting multiple pixels
- Added "clear plot (max 6 curves)" button to both panels
- Fixed error message that appeared when clicking outside of image extent

## V10.5 (07/22/2026)
- Added a new sub-panel to main panel that enable stretch, palette and gamma adjustments to image display. These provide flexibility and can compensate for an excessively dark or washed-out appearance when the default parameters are applied to certain images; display adjustments carry through to all sample scripts, except those generated for the derived indices
- Added new subpanel to display image statistics for selected rectangle or polygon ROI
- Added Hide/Show panel buttons for main panel and ancillary panel to enable better UI management on small screens
- Altered the size of the center-bottom message box so that it doesn't overlap with left- and right-bottom panels on small screens
- Fixed square white boxes that would appear next to title box when clicking on images
- Last 10 reflectance bands removed from the spectral charts (noisy data)
- Miscellaneous interface tweaks, including reordeing of buttons

## V10.4 (04/14/2025)
- Fixed incorrect labeling of Needle-Leaf/Non-needle Leaf Classification values in the Inspector (was incorrectly showing values of 0 or 1 instead of labels)
- Fixed the display of Canopy Nitrogen Content band values in the Inspector when a CNC band was displayed as the 2nd image (was always showing Canopy Nitrogen Model Uncertainty, even when Percent Nitrogen or Needle-leaf/Non-needle Leaf Classification bands were displayed in the map)
- MOBILE - Added "<50% cloud cover" option to Cloud Conditions drop-down button
- MOBILE - Added Percent Nitrogen legend for Canopy Nitrogen Content image

## V10.3 (04/03/2025)
- Added "<50% cloud cover" option to Cloud Conditions drop-down button
- Modified sample script generation so that reflectance images are now displayed using the color composite specified in the data viewer for Image 1

## V10.2 (03/20/2025)
- Added derived Surface Albedo
- Added derived indices and terrain products based on directional reflectance imagery
- Updated mobile version to reflect changes in desktop version

## V10.1
- Added canopy water indices
- Updated data product dropdown list with data product IDs
- Replaced derived indices hyperlink URLs with .002 data product page URLs
- Added citation references to all sample scripts
- Added version label to main panel

## V10.0
- Added mouse-click query and display of pixel values from CHM, CNC, DTM, DSM and most derived products
- Added derived indices and terrain products and associated map legends based on the BRDF-corrected reflectance imagery
- Included DCFS, KONA and TREE as sites the user can select
- Added sample scripts to match new products (including CNC)
- Added dynamically selected MODIS EVI as an Ancillary background layer (date aligned with 1st image start date)
- Consolidated RELEASE/PROVISIONAL and Release date into a single metadata tag in the metadata panel
- Added hyperlinked DOI URLs in metadata panel (N/A for PROVISIONAL data)
- Added “AOP Data in GEE Tutorial Series” hyperlinked URL in bottom of main panel
- Changed “NEON Tower” label to “NEON Tower or Aquatic site” in the Ancillary panel
- Partial update to mobile version of viewer (adding CNC image collection, ancillary dataset updates)
