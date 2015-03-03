var pathLib = require("path");
var urlLib = require("url");
var fs = require("fs");
var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");
var Helper = require("./helper");
var ALProtocol = {
  "http:": require("http"),
  "https:": require("https")
};

function getCacheFilePath(url) {
  if (this.cacheDir) {
    return pathLib.join(this.cacheDir, Helper.MD5(url));
  }
  else {
    return false;
  }
}

function cacheFile(url, buff) {
  var absPath = getCacheFilePath.call(this, url);
  if (absPath && !/[<>\*\?]+/g.test(absPath)) {
    fs.writeFile(absPath, buff);
  }
}

function readFromCache(url) {
  var absPath = getCacheFilePath.call(this, url);
  if (absPath && fs.existsSync(absPath)) {
    return fs.readFileSync(absPath);
  }
  return null;
}

function buildRequestOption(url) {
  if (url.match(/^\/{2}/)) {
    url = "https:" + url;
  }
  var requestOption = urlLib.parse(url) || {};

  var host = requestOption.host;
  requestOption.headers = {
    "x-broker": "essi",
    host: host
  };

  if (this.hosts && this.hosts[host]) {
    requestOption.host = this.hosts[host];
    requestOption.hostname = this.hosts[host];
  }

  requestOption.rejectUnauthorized = false;

  return requestOption;
}

function Remote(str, param, cacheDir) {
  this.str = str;
  this.cacheDir = cacheDir;
  this.hosts = param.hosts || {};
  this.traceRule = param.traceRule || false;
}
Remote.prototype = {
  constructor: Remote,
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
          var cache = readFromCache.call(self, path);
          if (cache) {
            if (("Cache " + path).match(self.traceRule)) {
              Helper.Log.cache(path, getCacheFilePath.call(self, path));
            }
            var body = isUtf8(cache) ? cache.toString() : iconv.decode(cache, "gbk");
            self.str = self.str.replace(m[i], body);
            Q[i] = true;
          }
          else {
            var requestOption = buildRequestOption.call(self, path);
            if (requestOption) {
              ALProtocol[requestOption.protocol]
                .request(requestOption, function (nsres) {
                  var buffer = [];
                  nsres
                    .on("error", function () {
                      if (("Error " + path).match(self.traceRule)) {
                        Helper.Log.error(path + " [Res Error]");
                      }
                      self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] Res Error! -->");

                      Q[i] = true;
                      cb(self.str);
                    })
                    .on("data", function (chunk) {
                      buffer.push(chunk);
                    })
                    .on("end", function () {
                      var buf = Helper.joinBuffer(buffer);
                      var body = isUtf8(buf) ? buf.toString() : iconv.decode(buf, "gbk");
                      if (("Fetch " + path).match(self.traceRule)) {
                        Helper.Log.process("Fetch", path);
                      }
                      self.str = self.str.replace(m[i], body);
                      cacheFile.call(self, path, buf);

                      Q[i] = true;
                      cb(self.str);
                    });
                })
                .on("error", function (e) {
                  console.log(e)
                  if (("Error " + path).match(self.traceRule)) {
                    Helper.Log.error(path + " [Req Error]");
                  }
                  self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] Req Error! -->");

                  Q[i] = true;
                  cb(self.str);
                })
                .end();
            }
            else {
              if (("Error " + path).match(self.traceRule)) {
                Helper.Log.error(path + " [ReqOpt Error]");
              }
              self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] ReqOpt Error! -->");
              Q[i] = true;
            }
          }

          cb(self.str);
        })(m[i].match(new RegExp(remoteREGX))[2], i);
      }
    }
    else {
      callback(self.str);
    }
  }
};

module.exports = Remote;