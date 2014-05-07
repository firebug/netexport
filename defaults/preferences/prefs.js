// Firebug tracing support
pref("extensions.firebug.DBG_NETEXPORT", false);

// URL of the default HAR viewer.
pref("extensions.firebug.netexport.viewerURL", "http://www.softwareishard.com/har/viewer-1.1");

// If true, files are saved.
pref("extensions.firebug.netexport.saveFiles", false);

// If true, HAR files are compressed.
pref("extensions.firebug.netexport.compress", false);

// Default log directory for auto-exported HAR files.
pref("extensions.firebug.netexport.defaultLogDir", "");

// Show preview of exported data by default.
pref("extensions.firebug.netexport.showPreview", true);

// URL of the server where the collected data should be send to.
pref("extensions.firebug.netexport.beaconServerURL", "http://www.showslow.com/beacon/har/");

// Display confirmation before uploading collected data to the server yes/no.
pref("extensions.firebug.netexport.sendToConfirmation", true);

// Number of milliseconds to wait after the last page request to declare the page loaded.
pref("extensions.firebug.netexport.pageLoadedTimeout", 1500);

// Number of milliseconds to wait after the page is exported even if not loaded yet.
// Set to zero to switch off this feature.
pref("extensions.firebug.netexport.timeout", 60000);

// Auto export feature is enabled by default.
pref("extensions.firebug.netexport.alwaysEnableAutoExport", false);

// Secret token for exposing export API to the content (user page).
// If empty, no API are exposed.
pref("extensions.firebug.netexport.secretToken", "");

// Auto export feature stores results into a local file
pref("extensions.firebug.netexport.autoExportToFile", true);

// Auto export feature sends results to the server.
pref("extensions.firebug.netexport.autoExportToServer", false);

// If set to true, requests coming from BFCache will also be exported.
pref("extensions.firebug.netexport.exportFromBFCache", false);

// Specifies JSONP callback name for HAR files wrapped in a function call (JSONP, HARP)
pref("extensions.firebug.netexport.jsonpCallback", "onInputData");
