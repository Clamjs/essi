var pathLib = require("path");
var fs = require("fs");
var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");
var fetch = require("fetch-agent");
var Helper = require("./helper");

function Remote(str, param, cacheDir) {
  this.str = str;
  this.cacheDir = cacheDir;
  this.hosts = param.hosts || {};
  this.traceRule = param.traceRule || false;
}
Remote.prototype = {
  constructor: Remote,
  getCacheFilePath: function (url) {
    if (this.cacheDir) {
      return pathLib.join(this.cacheDir, Helper.MD5(url));
    }
    else {
      return false;
    }
  },
  cacheFile: function (url, buff) {
    var absPath = this.getCacheFilePath(url);
    if (absPath && !/[<>\*\?]+/g.test(absPath)) {
      fs.writeFile(absPath, buff);
    }
  },
  readFromCache: function (url) {
    var absPath = this.getCacheFilePath(url);
    if (absPath && fs.existsSync(absPath)) {
      return fs.readFileSync(absPath);
    }
    return null;
  },
  buildRequestOption: function (url) {
    var requestOption = fetch.request.buildOption(url);

    var host = requestOption.host;
    if (this.hosts && this.hosts[host]) {
      requestOption.host = this.hosts[host];
      requestOption.hostname = this.hosts[host];
    }

    return requestOption;
  },
  fetch: function (callback) {
    var self = this;
    var remoteREGX = '<!--\\s{0,}#remote[^->]*?url=(["\'])([^"\']*?)\\1[^->]*?-->';
    var m = this.str.match(new RegExp(remoteREGX, "ig"));
    if (m) {
      var Q = new Array(m.length);

      function cb(str) {
        var a = Helper.unique(Q);
        if (a.length == 1 && a[0]) {
          callback(str);
        }
      }

      for (var i in m) {
        (function (path, i) {
          var cache = self.readFromCache(path);
          if (cache) {
            if (("Cache " + path).match(self.traceRule)) {
              Helper.Log.cache(path, self.getCacheFilePath(path));
            }
            var body = isUtf8(cache) ? cache.toString() : iconv.decode(cache, "gbk");

            self.str = self.str.replace(m[i], body);
            Q[i] = true;
            cb(self.str);
          }
          else {
            var requestOption = self.buildRequestOption(path);
            fetch.request(requestOption, function (e, buf) {
              if (e) {
                if (("Error " + path).match(self.traceRule)) {
                  Helper.Log.error(path + " " + e.code);
                }

                self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] " + e.code + "! -->");
                Q[i] = true;
              }
              else {
                self.cacheFile(path, buf);

                var body = isUtf8(buf) ? buf.toString() : iconv.decode(buf, "gbk");
                if (("Fetch " + path).match(self.traceRule)) {
                  Helper.Log.process("Fetch", path);
                }

                self.str = self.str.replace(m[i], body);
                Q[i] = true;
              }

              cb(self.str);
            });
          }
        })(m[i].match(new RegExp(remoteREGX))[2], i);
      }
    }
    else {
      callback(self.str);
    }
  }
};

module.exports = Remote;