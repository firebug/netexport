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

// Displaye confirmation before uploading collecetd data to the server yes/no.
pref("extensions.firebug.netexport.sendToConfirmation", true);

// Number of milliseconds to wait after the last page request to declare the page loaded.
pref("extensions.firebug.netexport.pageLoadedTimeout", 1500);

// Auto export feature is enabled by default.
pref("extensions.firebug.netexport.alwaysEnableAutoExport", false);

// Auto export feature stores results into a local file
pref("extensions.firebug.netexport.autoExportToFile", true);

// Auto export feature sends results to the server.
pref("extensions.firebug.netexport.autoExportToServer", false);

// If set to true, requests coming from FBCache will be also exported.
pref("extensions.firebug.netexport.exportFromFBCache", false);
