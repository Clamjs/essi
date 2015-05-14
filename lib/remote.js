var pathLib = require("path");
var fsLib = require("fs");
var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");
var fetch = require("fetch-agent");
var Helper = require("./helper");

function Remote(str, param, trace, cacheDir) {
  this.trace = trace;
  this.str = str;
  this.cacheDir = cacheDir;
  this.hosts = param.hosts || {};
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
      fsLib.writeFile(absPath, buff, function (e) {
        if (!e) {
          fsLib.chmod(absPath, 0777);
        }
      });
    }
  },
  readFromCache: function (url) {
    var absPath = this.getCacheFilePath(url);
    if (absPath && fsLib.existsSync(absPath)) {
      return fsLib.readFileSync(absPath);
    }
    return null;
  },
  fetch: function (callback) {
    var self = this;
    var remoteREGX = '<!--\\s{0,}#remote[^->]*?url=(["\'])([^"\']*?)\\1[^->]*?-->';
    var m = this.str.match(new RegExp(remoteREGX, "ig"));
    if (m) {
      var Q = m.map(function () {
        return false;
      });

      function ready2go(i) {
        Q[i] = true;
        var a = Helper.unique(Q);
        if (a.length == 1 && a[0]) {
          callback(self.str);
        }
      }

      for (var i in m) {
        (function (path, i) {
          var cache = self.readFromCache(path);
          if (cache) {
            self.trace.cache(path, self.getCacheFilePath(path));

            var body = isUtf8(cache) ? cache.toString() : iconv.decode(cache, "gbk");
            self.str = self.str.replace(m[i], body);
            ready2go(i);
          }
          else {
            fetch.request(path, self.hosts, function (e, buf, nsres) {
              var tips;
              if (e || nsres.statusCode == 404) {
                if (e) {
                  tips = path + ' ' + e.code + '!';
                }
                else {
                  tips = path + ' ' + nsres.statusMessage + '!';
                }

                self.str = self.str.replace(m[i], "<!--#ERROR! " + tips + " -->");
                self.trace.error(tips, nsres.statusCode);
              }
              else {
                self.cacheFile(path, buf);

                var body = isUtf8(buf) ? buf.toString() : iconv.decode(buf, "gbk");
                self.str = self.str.replace(m[i], body);
                self.trace.remote(path, self.hosts);
              }
              ready2go(i);
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
