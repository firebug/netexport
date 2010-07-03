/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;

const extensionManager = CCSV("@mozilla.org/extensions/manager;1", "nsIExtensionManager");
const clipboard = CCSV("@mozilla.org/widget/clipboard;1", "nsIClipboard");
const clipboardHelper = CCSV("@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");

var prefDomain = "extensions.firebug.netexport";

// ************************************************************************************************
// Module implementation

/**
 * This module implements an Export feature that allows to save all Net panel
 * data into a file using HTTP Archive format.
 * http://groups.google.com/group/firebug-working-group/web/http-tracing---export-format
 */
Firebug.NetExport = extend(Firebug.Module,
{
    initialize: function(owner)
    {
        Firebug.Module.initialize.apply(this, arguments);

        if (Firebug.TraceModule)
            Firebug.TraceModule.addListener(this.TraceListener);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        if (Firebug.TraceModule)
            Firebug.TraceModule.removeListener(this.TraceListener);
    },

    internationalizeUI: function(doc)
    {
        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.internationalizeUI");

        var elements = ["netExport", "netExportSaveFiles", "netExportCompress",
            "netExportAuto",
            "netExportOptions", "netExportLogDir", "netExportHelp",
            "netExportAbout", "netExportShowPreview", "netRunPageSuite",
            "netExportSaveAs", "netExportScreenCopy"];

        for (var i=0; i<elements.length; i++)
        {
            var element = $(elements[i], doc);
            if (!element)
                continue;

            FBL.internationalize(element, "label");
            FBL.internationalize(element, "tooltiptext");
            FBL.internationalize(element, "buttontooltiptext");
        }
    },

    initContext: function(context)
    {
        context.netExport = {};
    },

    updateSendTo: function()
    {
        try
        {
            // If a server is specified in the preferences, show a new menu item
            // that allows to send HAR beacon to the server and localize it.
            var serverURL = Firebug.getPref(prefDomain, "beaconServerURL");
            var uri = makeURI(serverURL);
            var host = uri.host;

            var menuItem = $("netExportSendTo");

            if (serverURL)
                menuItem.removeAttribute("collapsed");
            else
                menuItem.setAttribute("collapsed");

            // Update label & tooltip so it displayes the URL.
            menuItem.setAttribute("label", $STR("netexport.menu.label.Send To") + " " + host);
            menuItem.setAttribute("tooltiptext", $STR("netexport.menu.tooltip.Send To") +
                " " + serverURL);
        }
        catch (e)
        {
            if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                FBTrace.sysout("netexport.updateSendTo; EXCEPTION", e);
        }
    },

    // Handle Export toolbar button.
    exportData: function(context)
    {
        this.Exporter.exportData(context);
    },

    // Handle Import toolbar button.
    importData: function(context)
    {
        alert("TBD");
    },

    onMenuShowing: function(popup)
    {
        this.updateSendTo();
        return true;
    },

    sendTo: function(context)
    {
        // Send HAR beacon to the server (context, display confirmation, asynchronously).
        Firebug.NetExport.HARUploader.upload(context, true, true);
    },

    screenCopy: function(context)
    {
        Firebug.NetExport.NetPanelScreenCopier.copyToClipboard(context);
    },

    // Options
    onToggleOption: function(event, menuitem)
    {
        FirebugChrome.onToggleOption(menuitem);

        // Don't bubble up so, the main command (executed when the menu-button
        // itself is pressed) is not fired.
        cancelEvent(event);
    },

    onOptionsShowing: function(popup)
    {
        for (var child = popup.firstChild; child; child = child.nextSibling)
        {
            if (child.localName == "menuitem")
            {
                var option = child.getAttribute("option");
                if (option)
                {
                    var checked = Firebug.getPref(Firebug.prefDomain, option);
                    child.setAttribute("checked", checked);
                }
            }
        }

        return true;
    },

    // Auto export
    toggleAutoExport: function(context)
    {
        if (this.Automation.isActive())
            this.Automation.deactivate();
        else
            this.Automation.activate();
    },

    onHelp: function(event)
    {
        // xxxHonza: use Firebug wiki as soon as there is a page for NetExport.
        openNewTab("http://www.softwareishard.com/blog/netexport/");
        cancelEvent(event);
    },

    onAbout: function(event, context)
    {
        var parent = context.chrome.window;
        parent.openDialog("chrome://mozapps/content/extensions/about.xul", "",
            "chrome,centerscreen,modal", "urn:mozilla:item:netexport@getfirebug.com",
            extensionManager.datasource);

        cancelEvent(event);
    },

    onRunPageSuite: function(event, context)
    {
        var PageLoader = Firebug.NetExport.PageLoader;

        // Load default suite of pages to be loaded and run.
        var pageSuite = PageLoader.loadSuite();
        PageLoader.runSuite(pageSuite);

        cancelEvent(event);
    }
});

// ************************************************************************************************

Firebug.NetExport.NetPanelScreenCopier =
{
    copyToClipboard: function(context)
    {
        try
        {
            var win = $("fbPanelBar1").browser.contentWindow;

            //var netPanel = context.getPanel("net");
            //var height = netPanel.panelNode.scrollHeight;
            //var width = netPanel.panelNode.scrollWidth;

            var height = win.innerHeight;
            var width = win.innerWidth;

            var canvas = this.getCanvasFromWindow(win, width, height);
            var image = window.content.document.createElement("img");
            image.setAttribute("style", "display: none");
            image.setAttribute("id", "screengrab_buffer");
            image.setAttribute("src", canvas.toDataURL("image/png", ""));

            var body = window.content.document.getElementsByTagName("html")[0];
            body.appendChild(image);
            setTimeout(this.copyImage(image, body, document), 200);
        }
        catch (err)
        {
            if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                FBTrace.sysout("netexport.copyToClipboard; EXCEPTION",err);
        }
    },

    copyImage : function(image, body, documenty)
    {
        return function ()
        {
            documenty.popupNode = image;
            try {
                goDoCommand("cmd_copyImageContents");
            } catch (ex) {
                alert(ex);
            }
            body.removeChild(image);
        };
    },

    getCanvasFromWindow: function(win, width, height)
    {
        var canvas = this.createCanvas(win, width, height);
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(1, 1);
        ctx.drawWindow(win, 0, 0, width, height, "rgb(255,255,255)");
        ctx.restore();
        return canvas;
    },

    createCanvas: function(win, width, height)
    {
        var canvas = win.document.createElement("canvas");
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
};

// ************************************************************************************************

Firebug.NetExport.TraceListener =
{
    onLoadConsole: function(win, rootNode)
    {
        var doc = rootNode.ownerDocument;
        var styleSheet = createStyleSheet(doc,
            "chrome://netexport/skin/netExport.css");
        styleSheet.setAttribute("id", "netExportLogs");
        addStyleSheet(doc, styleSheet);
    },

    onDump: function(message)
    {
        var index = message.text.indexOf("netexport.");
        if (index == 0)
            message.type = "DBG_NETEXPORT";
    }
};

// ************************************************************************************************
// Shared functions for NetExport extension.

Firebug.NetExport.safeGetWindowLocation = function(win)
{
    try
    {
        if (!win)
            return null;

        if (win.closed)
            return null;

        if ("location" in win)
        {
            if (typeof(win.location) == "object" && "toString" in win.location)
                return win.location;
            else if (typeof (win.location) == "string")
                return win.location;
        }
    }
    catch(exc)
    {
        if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
            FBTrace.sysout("netexport.getWindowLocation; EXCEPTION window:", win);
    }

    return null;
}

// ************************************************************************************************
// Registration

Firebug.registerStringBundle("chrome://netexport/locale/netExport.properties");
Firebug.registerModule(Firebug.NetExport);

// ************************************************************************************************
}});
