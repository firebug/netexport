/* See license.txt for terms of usage */

FBL.ns(function() { with (FBL) {

const Cc = Components.classes;
const Ci = Components.interfaces;

const appInfo = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);

const harVersion = "1.1";
var prefDomain = "extensions.firebug.netexport";

// ************************************************************************************************
// HAR builder implementation

Firebug.NetExport.HARBuilder = function()
{
    this.pageMap = [];
}

Firebug.NetExport.HARBuilder.prototype =
{
    build: function(context)
    {
        this.context = context;

        var panel = context.getPanel("net");

        // Build basic structure for data.
        var log = this.buildLog();

        // Before enumerating requests, we need to call layout methods that renders
        // content of the panel. This ensures export even if the panel is not visible
        // (since e.g. Firebug UI is minimized).
        panel.layout();

        // If set to true, requests coming from BFCache will also be exported.
        var exportFromBFCache = Firebug.getPref(prefDomain, "exportFromBFCache");

        // Build entries.
        var self = this;
        panel.enumerateRequests(function(file)
        {
            // Don't export BFCache responses. These don't represent network activity.
            // Do export if the pref says so.
            if (file.fromBFCache && !exportFromBFCache)
                return;

            if (file.loaded)
                log.entries.push(self.buildEntry(log, file));
        })

        return {log:log};
    },

    buildLog: function()
    {
        var log = {};
        log.version = harVersion;
        log.creator = {name: "Firebug", version: Firebug.version};
        log.browser = {name: appInfo.name, version: appInfo.version};
        log.pages = [];
        log.entries = [];
        return log;
    },

    buildPage: function(file)
    {
        var page = {};

        // Page start time is set when the first request is processed (see buildEntry)
        page.startedDateTime = 0;

        // Page title and ID comes from a document object that is shared by
        // all requests executed by the same page (since Firebug 1.5b1).
        var pageId = file.document.id;
        var title = file.document.title;

        page.id = "page_" + (pageId ? pageId : "0");
        page.title = title ? title : this.context.getTitle();
        return page;
    },

    getPage: function(log, file)
    {
        var page = this.pageMap[file.document.id];
        if (page)
            return page;

        this.pageMap[file.document.id] = page = this.buildPage(file);
        log.pages.push(page); 

        return page;
    },

    buildEntry: function(log, file)
    {
        var page = this.getPage(log, file);

        var entry = {};
        entry.pageref = page.id;
        entry.startedDateTime = dateToJSON(new Date(file.startTime));
        entry.time = file.endTime - file.startTime;
        entry.request = this.buildRequest(file);
        entry.response = this.buildResponse(file);
        entry.cache = this.buildCache(file);
        entry.timings = this.buildTimings(file);

        // Compute page load start time according to the first request start time.
        if (!page.startedDateTime)
            page.startedDateTime = entry.startedDateTime;

        // Put page timings into the page object now when we have the first entry.
        if (!page.pageTimings)
            page.pageTimings = this.buildPageTimings(file);

        return entry;
    },

    buildPageTimings: function(file)
    {
        var timings = {onContentLoad: 0, onLoad: 0};

        if (file.phase.contentLoadTime)
            timings.onContentLoad = file.phase.contentLoadTime - file.startTime;

        if (file.phase.windowLoadTime)
            timings.onLoad = file.phase.windowLoadTime - file.startTime;

        return timings;
    },

    buildRequest: function(file)
    {
        var request = {};

        request.method = file.method;
        request.url = file.request.URI.spec;
        request.httpVersion = this.getHttpVersion(file.request, true);

        request.cookies = this.buildRequestCookies(file);
        request.headers = this.buildHeaders(file.requestHeaders);

        request.queryString = file.urlParams;
        request.postData = this.buildPostData(file);

        request.headersSize = file.requestHeadersText ? file.requestHeadersText.length : -1;
        request.bodySize = file.postText ? file.postText.length : -1;

        return request;
    },

    buildPostData: function(file)
    {
        if (!file.postText)
            return;

        var postData = {mimeType: ""};

        var text = file.postText;
        if (isURLEncodedFile(file, text))
        {
            var lines = text.split("\n");
            postData.mimeType = "application/x-www-form-urlencoded";
            postData.params = parseURLEncodedText(lines[lines.length-1]);
        }
        else
        {
            postData.text = text;
        }

        if (FBTrace.DBG_NETEXPORT)
            FBTrace.sysout("netexport.buildPostData; ", postData);

        return postData;
    },

    buildRequestCookies: function(file)
    {
        var header = findHeader(file.requestHeaders, "cookie");

        var result = [];
        var cookies = header ? header.split("; ") : [];
        for (var i=0; i<cookies.length; i++)
        {
            var option = cookies[i].split("=");
            var cookie = {};
            cookie.name = option[0];
            cookie.value = option[1];
            result.push(cookie);
        }

        return result;
    },

    buildResponseCookies: function(file)
    {
        var header = findHeader(file.responseHeaders, "set-cookie");

        var result = [];
        var cookies = header ? header.split("\n") : [];
        for (var i=0; i<cookies.length; i++)
        {
            var cookie = this.parseCookieFromResponse(cookies[i]);
            result.push(cookie);
        }

        return result;
    },

    parseCookieFromResponse: function(string)
    {
        var cookie = new Object();
        var pairs = string.split("; ");

        for (var i=0; i<pairs.length; i++)
        {
            var option = pairs[i].split("=");
            if (i == 0)
            {
                cookie.name = option[0];
                cookie.value = option[1];
            } 
            else
            {
                var name = option[0].toLowerCase();
                if (name == "httponly")
                {
                    cookie.httpOnly = true;
                }
                else if (name == "expires")
                {
                    var value = option[1];
                    value = value.replace(/-/g, " ");
                    cookie[name] = dateToJSON(new Date(value.replace(/-/g, " ")));
                }
                else
                {
                    cookie[name] = option[1];
                }
            }
        }
        
        return cookie;
    },

    buildHeaders: function(headers)
    {
        var result = [];
        for (var i=0; headers && i<headers.length; i++)
            result.push({name: headers[i].name, value: headers[i].value});
        return result;
    },

    buildResponse: function(file)
    {
        var response = {};

        response.status = file.responseStatus;
        response.statusText = file.responseStatusText;
        response.httpVersion = this.getHttpVersion(file.request, false);

        response.cookies = this.buildResponseCookies(file);
        response.headers = this.buildHeaders(file.responseHeaders);
        response.content = this.buildContent(file);

        response.redirectURL = findHeader(file.responseHeaders, "Location");

        response.headersSize = file.responseHeadersText ? file.responseHeadersText.length : -1;
        response.bodySize = file.size;

        return response;
    },

    buildContent: function(file)
    {
        var content = {};
        content.size = file.responseText ? file.responseText.length :
            (file.size >= 0 ? file.size : 0);

        try
        {
            content.mimeType = file.request.contentType;
        }
        catch (e)
        {
            if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                FBTrace.sysout("netexport.buildContent EXCEPTION", e);
        }

        if (file.responseText)
            content.text = file.responseText;

        return content;
    },

    buildCache: function(file)
    {
        var cache = {};

        if (!file.fromCache)
            return cache;

        //cache.beforeRequest = {}; //xxxHonza: There is no such info yet in the Net panel.

        if (file.cacheEntry)
            cache.afterRequest = this.buildCacheEntry(file.cacheEntry);
        else
            cache.afterRequest = null;

        return cache;
    },

    buildCacheEntry: function(cacheEntry)
    {
        var cache = {};
        cache.expires = findHeader(cacheEntry, "Expires");
        cache.lastAccess = findHeader(cacheEntry, "Last Fetched");
        cache.eTag = ""; //xxxHonza
        cache.hitCount = findHeader(cacheEntry, "Fetch Count");
        return cache;
    },

    buildTimings: function(file)
    {
        var sendStarted = (file.sendingTime > file.startTime);
        var blockingEnd = sendStarted ? file.sendingTime : file.waitingForTime;

        var timings = {};
        timings.dns = file.connectingTime - file.startTime;
        timings.connect = file.connectedTime - file.connectingTime;
        timings.blocked = blockingEnd - file.connectedTime;
        timings.send = sendStarted ? file.waitingForTime - file.sendingTime : 0;
        timings.wait = file.respondedTime - file.waitingForTime;
        timings.receive = file.endTime - file.respondedTime;

        return timings;
    },

    getHttpVersion: function(request, forRequest)
    {
        if (request instanceof Ci.nsIHttpChannelInternal)
        {
            try
            {
                var major = {}, minor = {};

                if (forRequest)
                    request.getRequestVersion(major, minor);
                else
                    request.getResponseVersion(major, minor);

                return "HTTP/" + major.value + "." + minor.value;
            }
            catch(err)
            {
                if (FBTrace.DBG_NETEXPORT || FBTrace.DBG_ERRORS)
                    FBTrace.sysout("netexport.getHttpVersion EXCEPTION", err);
            }
        }

        return "";
    },
}

// ************************************************************************************************
// Helpers

// xxxHonza: duplicated in net.js
function isURLEncodedFile(file, text)
{
    if (text && text.toLowerCase().indexOf("content-type: application/x-www-form-urlencoded") != -1)
        return true;

    // The header value doesn't have to be alway exactly "application/x-www-form-urlencoded",
    // there can be even charset specified. So, use indexOf rather than just "==".
    var headerValue = findHeader(file.requestHeaders, "content-type");
    if (headerValue && headerValue.indexOf("application/x-www-form-urlencoded") == 0)
        return true;

    return false;
}

function findHeader(headers, name)
{
    name = name.toLowerCase();
    for (var i = 0; headers && i < headers.length; ++i)
    {
        if (headers[i].name.toLowerCase() == name)
            return headers[i].value;
    }

    return "";
}

function safeGetName(request)
{
    try
    {
        return request.name;
    }
    catch (exc) { }

    return null;
}

function dateToJSON(date)
{
    function f(n, c) {
        if (!c) c = 2;
        var s = new String(n);
        while (s.length < c) s = "0" + s;
        return s;
    }

    var result = date.getUTCFullYear() + '-' +
        f(date.getMonth() + 1) + '-' +
        f(date.getDate()) + 'T' +
        f(date.getHours()) + ':' +
        f(date.getMinutes()) + ':' +
        f(date.getSeconds()) + '.' +
        f(date.getMilliseconds(), 3);

    var offset = date.getTimezoneOffset();
    var offsetHours = Math.floor(offset / 60);
    var offsetMinutes = Math.floor(offset % 60);
    var prettyOffset = (offset > 0 ? "-" : "+") +
        f(Math.abs(offsetHours)) + ":" + f(Math.abs(offsetMinutes));

    return result + prettyOffset;
}

// ************************************************************************************************
}});
