/**
 * fluidinfo.js - a small and simple client for Fluidinfo written in Javascript.
 *
 * @author <a href="http://twitter.com/onigiri">onigiri</a>, <a href="http://twitter.com/ntoll">ntoll</a> & <a href="http://twitter.com/barshirtcliff">barshirtcliff</a>
 * @version 0.1
 * @constructor
 * @param options {Object} Contains various parameters for the new session with
 * Fluidinfo.
 * <dl>
 *   <dt>username</dt>
 *   <dd>The username to use when authenticating with Fluidinfo.</dd>
 *   <dt>password</dt>
 *   <dd>The password to use when authenticating with Fluidinfo</dd>
 *   <dt>instance</dt>
 *   <dd>The instance to connect to. Either "main", "sandbox" or a bespoke
 *  instance. Defaults to "main".</dd>
 * </dl>
 * returns {Object} An object through which one interacts with Fluidinfo.
 */
fluidinfo = function(options) {
    /**
     * Encodes strings into base64. Adapted from:
     * http://www.webtoolkit.info/javascript-base64.html
    */
    var Base64 = {
        // private property
        _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
        // public method for encoding
        encode : function (input) {
            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;
            input = Base64._utf8_encode(input);
            while (i < input.length) {
                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);
                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;
                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }
                output = output +
                this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
            }
            return output;
        },
        // private method for UTF-8 encoding
        _utf8_encode : function (string) {
            string = string.replace(/\r\n/g,"\n");
            var utftext = "";
            for (var n = 0; n < string.length; n++) {
                var c = string.charCodeAt(n);
                if (c < 128) {
                    utftext += String.fromCharCode(c);
                }
                else if((c > 127) && (c < 2048)) {
                    utftext += String.fromCharCode((c >> 6) | 192);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utftext += String.fromCharCode((c >> 12) | 224);
                    utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                    utftext += String.fromCharCode((c & 63) | 128);
                }
            }
            return utftext;
        }
    }

    /**
     * Represents a session with Fluidinfo.
     */
    var session = new Object();
    var authorizationToken = "";

    if(options) {
      if(options.instance) {
        switch(options.instance.toLowerCase()) {
          case "main":
            session.baseURL = "https://fluiddb.fluidinfo.com/";
            break;
          case "sandbox":
            session.baseURL = "https://sandbox.fluidinfo.com/";
            break;
          default:
              // validate the bespoke instance
              var urlRegex = /^(http|https):\/\/[\w\-_\.]+\/$/;
              if(urlRegex.exec(options.instance)) {
                session.baseURL = options.instance;
              } else {
                throw {
                  name: "ValueError",
                  message: "The URL must start with http[s]:// and have a trailing slash ('/') to be valid. E.g. https://localhost/"
                };
              }
        }
      }
      if((options.username != undefined) && (options.password != undefined)) {
        authorizationToken = Base64.encode(options.username + ":" + options.password);
      }
    }

    // Catch-all to make sure the library defaults to the main instance
    if(session.baseURL === undefined){
      session.baseURL = "https://fluiddb.fluidinfo.com/";
    }

    /**
     * Magic voodoo used to identify an array (potentially a Fluidinfo set).
     * Taken from page 61 of Doug Crockford's "Javascript: The Good Parts".
     *
     * @param value A value that might be an array.
     * @return {boolean} An indication if the value is an array.
     */
    function isArray(value) {
      return Object.prototype.toString.apply(value) === "[object Array]";
    };

    /**
     * Given a path that is expressed as an array of path elements, will
     * return the correctly encoded URL. e.g. ["a", "b", "c"] -> "/a/b/c"
     *
     * @param value {Array} A list of values to be appropriately encoded between
     * '/' values.
     * @return {string} The appropriately encoded URL.
     */
    function encodeURL(path) {
      var result = "";
      for(i=0; i<path.length; i++) {
        result += "/" + encodeURIComponent(path[i]);
      }
      return result.slice(1); // chops the leading slash
    };

    /**
     * Checks the passed value to discover if it's a Fluidinfo "primitive"
     * type. See <a href="http://doc.fluidinfo.com/fluidDB/api/tag-values.html">
     * the Fluidinfo docs</a> for <a href="http://bit.ly/hmrMzT">more
     * information</a> on Fluidinfo's types.
     *
     * @param value A value whose "type" needs identifying
     * @return A boolean indication if the value is a Fluidinfo primitive type.
     */
    function isPrimitive(value) {
      // check the easy type matches first
      var valueType = typeof(value);
      var primitiveTypes = ["number", "string", "boolean"];
      for(i=0; i<primitiveTypes.length; i++) {
        if(valueType === primitiveTypes[i]) {
          return true;
        }
      }
      // A null value is also a primitive
      if(value===null) {
        return true;
      }
      // check for an array (potential set) and validate it only contains
      // strings (currently multi-type arrays are not allowed)
      if(isArray(value)) {
        for(i=0; i<value.length; i++) {
          memberType = typeof(value[i]);
          if(memberType !== "string") {
            return false;
          }
        }
        return true;
      }
      // value hasn't matched any of the primitive checks
      return false;
    }

    /**
     * Given the options describing a request, will return the most appropriate
     * MIME to set as the value for the Content-Type header
     *
     * @param options {Object} Contains various parameters describing the
     * request.
     * @return the most appropriate MIME to use of null if not appropriate /
     * required.
     */
    function detectContentType(options) {
      // a "PUT" to objects/ or about/ endpoints means dealing with the MIME
      // of a tag-value. If no MIME type is passed in the options objects
      // then check if the value is a Fluidinfo primitive type. Otherwise
      // complain.
      var result = null;
      if(options.type==="PUT" && (options.url.match("^objects\/") || options.url.match("^about\/"))) {
        if(options.contentType){
          result = options.contentType;
        } else if (isPrimitive(options.data)) {
          result = "application/vnd.fluiddb.value+json";
        } else {
          throw { name: "ValueError", message: "Must supply Content-Type"};
        }
      } else if (options.data) {
        // all other requests to the API that have payloads will be passing JSON
        result = "application/json";
      }
      return result;
    }

    /**
     * Given a value from a Content-Type header, will return a boolean
     * indication if the associated content is JSON.
     *
     * @param contentType {string} The MIME value associated with the content
     * @result {boolean} An indication if the associated content is JSON
     */
    function isJSONData(contentType) {
      return contentType && (contentType === "application/json" || contentType === "application/vnd.fluiddb.value+json");
    }

    /**
     * Given an object representing the arguments to append to a URL will return
     * an appropriately encoded string representation.
     */
    function createArgs(args) {
      var result = "";
      if(args) {
        var arg;
        for(arg in args) {
          if(typeof args[arg] !== "function") {
              if(isArray(args[arg])) {
                for(j=0; j<args[arg].length; j++) {
                  result += "&" + encodeURIComponent(arg)+"="+encodeURIComponent(args[arg][j]);
                }
              } else {
                result += "&"+encodeURIComponent(arg)+"="+encodeURIComponent(args[arg]);
              }
            }
        }
        result = "?" + result.slice(1);
      }
      return result;
    }

    /**
     * Returns an appropriate XMLHttpRequest Object depending on the browser.
     * Based upon code from here:
     * http://www.quirksmode.org/js/xmlhttp.html
     */
    function createXMLHTTPObject() {
      var XMLHttpFactories = [
        function () {return new XMLHttpRequest()},
        function () {return new ActiveXObject("Msxml2.XMLHTTP")},
        function () {return new ActiveXObject("Msxml3.XMLHTTP")},
        function () {return new ActiveXObject("Microsoft.XMLHTTP")}
      ];
      var xhr = false;
      for(var i=0; i<XMLHttpFactories.length; i++) {
        try {
          xhr = XMLHttpFactories[i]();
        } catch(e) {
          continue;
        }
        break;
      }
      return xhr;
    }

    /**
     * Sends an appropriate XMLHTTPRequest based request to Fluidinfo.
     * @param options {Object} An object containing the following named options:
     * <dl>
     *  <dt>type</dt>
     *  <dd>The request's HTTP method. [GET, POST, PUT, DELETE or HEAD]</dd>
     *  <dt>url</dt>
     *  <dd>The full URL of the resource to which the request is made.</dd>
     *  <dt>data</dt>
     *  <dd>The body of data that may be the payload of the request (in the
     *  case of POST and PUT requests).</dd>
     *  <dt>async</dt>
     *  <dd>Indicates if the request is to be asyncronous (default is true)</dd>
     *  <dt>onSuccess</dt>
     *  <dd>A function that takes the XHR request as an argument. Called upon
     *  successful completion of the request.</dd>
     *  <dt>onError</dt>
     *  <dd>A function that takes the XHR request as an argument. Called when
     *  the request resulted in an error.</dd>
     * </dl>
     *
     */
    function sendRequest(options) {
      if(isArray(options.path)) {
        options.path = encodeURL(options.path);
      }
      var method = options.type.toUpperCase() || "GET";
      var args = createArgs(options.args);
      var url = session.baseURL+options.path+args;
      var async = options.async || true;
      var xhr = createXMLHTTPObject();
      if(!xhr) return;
      xhr.open(method, url, async);
      if(authorizationToken != ""){
        xhr.setRequestHeader("Authorization", "Basic " + authorizationToken);
      };
      var contentType = detectContentType(options);
      if(contentType) {
        xhr.setRequestHeader("Content-Type", contentType);
        if(isJSONData(contentType)) {
          options.data = JSON.stringify(options.data);
        }
      }
      xhr.onreadystatechange = function() {
        if(xhr.readyState != 4) return;
        // build a simple result object
        var result = new Object();
        result.status = xhr.status;
        result.statusText = xhr.statusText;
        result.headers = xhr.responseHeaders;
        result.raw_data = xhr.responseText;
        if(isJSONData(result.headers['Content-Type'])) {
          result.data = JSON.parse(xhr.responseText);
        } else {
          result.data = xhr.responseText;
        }
        result.request = xhr;
        // call the event handlers
        if(xhr.status < 300 || xhr.status == 304) {
          if(options.onSuccess){
            options.onSuccess(result);
          }
        } else if (options.onError){
          // there appears to be a problem
          options.onError(result);
        }
      }
      xhr.send(options.data)
    }

    /**
     * Contains functions to facilitate the calling of the Fluidinfo REST API.
     */
    var api = new Object();

    /**
     * Makes an HTTP GET call to the Fluidinfo API
     *
     */
    api.get = function(options){
      options.type = "GET";
      options.data = null;
      sendRequest(options);
    }

    /**
     * Makes an HTTP POST call to the Fluidinfo API
     *
     */
    api.post = function(options){
      options.type = "POST";
      sendRequest(options);
    }

    /**
     * Makes an HTTP PUT call to the Fluidinfo API
     *
     */
    api.put = function(options){
      options.type = "PUT";
      sendRequest(options);
    }

    /**
     * Makes an HTTP DELETE call to the Fluidinfo API
     *
     */
    api.delete = function(options){
      options.type = "DELETE";
      options.data = null;
      sendRequest(options);
    }

    /**
     * Makes an HTTP HEAD call to the Fluidinfo API
     *
     */
    api.head = function(options){
      options.type = "HEAD";
      options.data = null;
      sendRequest(options);
    }

    session.api = api;

    /**
     * Easily gets results from Fluidinfo.
     */
    session.query = function(options) {
      // process the options
      if(options.select === undefined) {
        throw {
          name: "ValueError",
          message: "Missing select option."
        }
      }
      if(options.where === undefined) {
        throw {
          name: "ValueError",
          message: "Missing where option."
        }
      }
      /**
       * Takes the raw result from Fluidinfo and turns it into an easy-to-use
       * array of useful objects representing the matching results then calls
       * the onSuccess function with the newly created array.
       *
       * @param {Object} The raw result from Fluidinfo that is to be processed
       */
      var processResult = function(raw) {
        result = [];
        var data = raw.data.results;
        var objectID;
        for(objectID in data.id){
          if(typeof data.id[objectID] !== "function") {
            var obj = new Object();
            obj["id"] = objectID;
            for(tag in data.id[objectID]) {
              if(typeof data.id[objectID][tag] !== "function") {
                if(data.id[objectID][tag].value !== undefined) {
                  obj[tag] = data.id[objectID][tag].value;
                } else {
                  obj[tag] = data.id[objectID][tag];
                }
              }
            }
            result[result.length] = obj;
          }
        }
        raw.data = result;
        options.onSuccess(raw);
      }
      // Make the appropriate call to Fluidinfo
      this.api.get({path: "values",
        args: {tag: options.select, query: options.where},
        onSuccess: processResult, onError: options.onError});
    }

    return session;
}
