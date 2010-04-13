/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;

const dirService = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties);

var autoExportButton = $("netExportAuto");
var prefDomain = "extensions.firebug.netexport";

// ************************************************************************************************
// Controller for automatic export.

Firebug.NetExport.Automation = extend(Firebug.Module,
{
    active: false,
    logFolder: null,

    initialize: function(owner)
    {
        HttpObserver.addListener(this);
    },

    shutdown: function()
    {
        HttpObserver.removeListener(this);
    },

    // Make sure the Auto Export button is properly updated withing the Net panel.
    showPanel: function(browser, panel)
    {
        if (panel && panel.name == "net")
            this.updateUI();
    },

    // Activation
    isActive: function()
    {
        return this.active;
    },

    activate: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation: Auto export activated.");

        this.active = true;
        this.updateUI();

        HttpObserver.register();
    },

    deactivate: function()
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation: Auto export deactivated.");

        this.active = false;
        this.updateUI();

        HttpObserver.unregister();
    },

    updateUI: function()
    {
        autoExportButton.setAttribute("state", this.active ? "active" : "inactive");
        autoExportButton.setAttribute("tooltiptext", this.active ?
            $STR("netexport.menu.tooltip.Deactivate Auto Export") :
            $STR("netexport.menu.tooltip.Activate Auto Export"));
    },

    // Callback, the page has been loaded.
    onPageLoaded: function(win)
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; PAGE LOADED : " + safeGetWindowLocation(win));

        HttpObserver.removePageObserver(win);

        // Export current context.
        var context = TabWatcher.getContextByWindow(win);
        if (!context)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; ERROR: NO CONTEXT to export: " +
                    safeGetWindowLocation(win));
            return;
        }

        var file = Logger.getDefaultFolder();
        var now = new Date();

        function f(n, c) {
            if (!c) c = 2;
            var s = new String(n);
            while (s.length < c) s = "0" + s;
            return s;
        }

        var loc = Firebug.NetExport.safeGetWindowLocation(win);
        var fileName = (loc ? loc.host : "unknown") + "+" + now.getFullYear() + "-" +
            f(now.getMonth()+1) + "-" + f(now.getDate()) + "+" + f(now.getHours()) + "-" +
            f(now.getMinutes()) + "-" + f(now.getSeconds());

        // Default file extension is zip if compressing is on, otherwise just har.
        var fileExt = ".har";
        if (Firebug.getPref(prefDomain, "compress"))
            fileExt += ".zip";

        file.append(fileName + fileExt);
        file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0666);

        // Just for tracing purposes (can be changed within the saveToFile).
        var filePath = file.path;

        // Export data from the current context.
        var jsonString = Firebug.NetExport.Exporter.buildData(context, true);
        Firebug.NetExport.Exporter.saveToFile(file, jsonString, context);

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; PAGE EXPORTED: " + filePath);
    }
});

// ************************************************************************************************

Firebug.NetExport.PageLoadObserver = function(win)
{
    this.window = win;
    this.requests = [];
}

Firebug.NetExport.PageLoadObserver.prototype =
{
    addRequest: function(request)
    {
        this.requests.push(request);

        clearTimeout(this.timeout);
        delete this.timeout;
    },

    removeRequest: function(request)
    {
        remove(this.requests, request);
        if (this.requests.length > 0)
            return;

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.PageObserver; Looks like this could be the last response: " +
                safeGetRequestName(request));

        // Wait yet a little bit to catch even delayed XHR.
        this.timeout = setTimeout(bindFixed(this.onPageLoaded, this), 1500);
    },

    onPageLoaded: function()
    {
        // If no reqeusts appeared, the page is loaded.
        if (this.requests.length == 0)
            HttpObserver.onPageLoaded(this.window);
    },

    destroy: function()
    {
        clearTimeout(this.timeout);
        delete this.timeout;
    }
};

// ************************************************************************************************
// HTTP Observer

Firebug.NetExport.HttpObserver = extend(new Firebug.Listener(),
{
    registered: false,
    pageObservers: {},

    register: function()
    {
        if (this.registered)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.HttpObserver; HTTP observer already registered!");
            return;
        }

        httpObserver.addObserver(this, "firebug-http-event", false);
        this.registered = true;
    },

    unregister: function()
    {
        if (!this.registered)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.HttpObserver; HTTP observer already unregistered!");
            return;
        }

        httpObserver.removeObserver(this, "firebug-http-event");
        this.registered = false;
    },

    /* nsIObserve */
    observe: function(subject, topic, data)
    {
        try
        {
            if (!(subject instanceof Ci.nsIHttpChannel))
                return;

            // xxxHonza: this is duplication, fix me.
            var win = getWindowForRequest(subject);
            if (!win)
                return;

            var tabId = win ? Firebug.getTabIdForWindow(win) : null;
            if (!tabId)
                return;

            if (topic == "http-on-modify-request")
                this.onModifyRequest(subject, win);
            else if (topic == "http-on-examine-response" )
                this.onExamineResponse(subject, win);
            else if (topic == "http-on-examine-cached-response")
                this.onExamineResponse(subject, win);
        }
        catch (err)
        {
            if (FBTrace.DBG_ERRORS || FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.observe EXCEPTION", err);
        }
    },

    onModifyRequest: function(request, win)
    {
        var name = request.URI.asciiSpec;
        var origName = request.originalURI.asciiSpec;
        var isRedirect = (name != origName);

        // We need to catch new document load.
        if ((request.loadFlags & Ci.nsIChannel.LOAD_DOCUMENT_URI) &&
            request.loadGroup && request.loadGroup.groupObserver &&
            win == win.parent && !isRedirect)
        {
            this.addPageObserver(win);
        }

        this.onRequestBegin(request, win);
    },

    onExamineResponse: function(request, win)
    {
        this.onRequestEnd(request, win);
    },

    /* nsISupports */
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserver)) {
             return this;
         }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    // Page load observers
    addPageObserver: function(win)
    {
        var observer = this.pageObservers[win];
        if (observer)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; Page load observer detected for: " +
                    safeGetWindowLocation(win));

            // In cases where an existing page is reloaded before the previous load
            // finished, let's export what we have.
            Automation.onPageLoaded(win);
        }

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; Page load observer created for: " +
                safeGetWindowLocation(win));

        this.pageObservers[win] = new PageLoadObserver(win);
    },

    removePageObserver: function(win)
    {
        var pageObserver = this.pageObservers[win];
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation; ERROR Can't remove page observer for: " +
                    safeGetWindowLocation(win));
            return;
        }

        pageObserver.destroy();
        delete this.pageObservers[win];

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.Automation; Page load observer removed for: " +
                safeGetWindowLocation(win));
    },

    onRequestBegin: function(request, win)
    {
        win = getRootWindow(win);
        var pageObserver = this.pageObservers[win];
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation.onRequestBegin; ERROR No page-observer for " +
                    safeGetRequestName(request), this.pageObservers);
            return;
        }

        pageObserver.addRequest(request);
    },

    onRequestEnd: function(request, win)
    {
        win = getRootWindow(win);
        var pageObserver = this.pageObservers[win];
        if (!pageObserver)
        {
            if (FBTrace.DBG_NETEXPORT)
                FBTrace.sysout("netexport.Automation.onRequestEnd; ERROR No page-observer for " +
                    safeGetRequestName(request), this.pageObservers);
            return;
        }

        pageObserver.removeRequest(request);
    },

    getPageObserver: function(win)
    {
        return this.pageObservers[win];
    },

    onPageLoaded: function(win)
    {
        dispatch("onPageLoaded", [win]);
    }
});

// ************************************************************************************************

Firebug.NetExport.Logger =
{
    getDefaultFolder: function()
    {
        var dir;
        var path = Firebug.getPref(prefDomain, "defaultLogDir");
        if (!path)
        {
            // Create default folder for automated net logs.
            var dir = dirService.get("ProfD", Ci.nsILocalFile);
            dir.append("firebug");
            dir.append("netexport");
            dir.append("logs");
        }
        else
        {
            dir = CCIN("@mozilla.org/file/local;1", "nsILocalFile");
            dir.initWithPath(path);
        }

        return dir;
    },

    // Handle user command.
    onDefaultLogDirectory: function(event)
    {
        // Open File dialog and let the user to pick target directory for automated logs.
        var nsIFilePicker = Ci.nsIFilePicker;
        var fp = Cc["@mozilla.org/filepicker;1"].getService(nsIFilePicker);
        fp.displayDirectory = this.getDefaultFolder();
        fp.init(window, "Select target folder for automated logs:", //xxxHonza: localization
            nsIFilePicker.modeGetFolder);

        var rv = fp.show();
        if (rv == nsIFilePicker.returnOK || rv == nsIFilePicker.returnReplace)
            Firebug.setPref(prefDomain, "defaultLogDir", fp.file.path);

        cancelEvent(event);
    },
}

// ************************************************************************************************
// Shortcuts for this namespace

var Automation = Firebug.NetExport.Automation;
var HttpObserver = Firebug.NetExport.HttpObserver;
var PageLoadObserver = Firebug.NetExport.PageLoadObserver;
var Logger = Firebug.NetExport.Logger;

// ************************************************************************************************

Firebug.registerModule(Firebug.NetExport.Automation);

// ************************************************************************************************
}});
