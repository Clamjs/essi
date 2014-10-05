var pathLib = require("path"),
    fs = require("fs"),
    mkdirp = require("mkdirp"),
    crypto = require('crypto'),
    isUtf8 = require("is-utf8"),
    iconv = require("iconv-lite"),
    fetchUrl = require("fetch").fetchUrl,
    delog = require("debug.log");

var userHome = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH; // 兼容windows
var cacheDir = pathLib.join(userHome, '.' + pathLib.basename(pathLib.dirname(__dirname)), 'cache');
if (!fs.existsSync(cacheDir)) {
    mkdirp.sync(cacheDir, {mode: 0777});
}

var remoteREGX = '<!--\\s{0,}#remote[^->]*?url=["\'](https?://[^"\']*?)["\'][^->]*?-->';

function getCacheFilePath(url) {
    return pathLib.join(cacheDir, crypto.createHash('md5').update(url).digest('hex'));
}

function cacheFile(url, content) {
    var absPath = getCacheFilePath(url);
    if (/[<>\*\?]+/g.test(absPath)) {
        return;
    }

    fs.writeFile(absPath, content);
}

function readFromCache(url) {
    var absPath = getCacheFilePath(url);
    if (fs.existsSync(absPath)) {
        return fs.readFileSync(absPath);
    }
    return null;
}

function getUnique(Q) {
    var u = {}, a = [];
    for (var i = 0, l = Q.length; i < l; ++i) {
        if (u.hasOwnProperty(Q[i])) {
            continue;
        }
        a.push(Q[i]);
        u[Q[i]] = 1;
    }
    return a;
}

function Remote(str) {
    this.str = str;
}
Remote.prototype = {
    constructor: Remote,
    fetch: function (callback) {
        var self = this;
        var m = this.str.match(new RegExp(remoteREGX, "ig"))
        if (m) {
            var Q = new Array(m.length);

            for (var i in m) {
                (function (path, i) {

                    var cache = readFromCache(path);
                    if (cache) {
                        delog.process(path + " [Cache "+pathLib.basename(getCacheFilePath(path))+"]", 1);
                        var body = isUtf8(cache) ? cache.toString() : iconv.decode(cache, "gbk");
                        self.str = self.str.replace(m[i], body);
                        Q[i] = true;

                        var q = getUnique(Q);
                        if (q.length == 1 && q[0]) {
                            callback(self.str);
                        }
                    }
                    else {
                        fetchUrl(path, {outputEncoding: "utf-8"}, function (error, response, body) {
                            if (error) {
                                delog.error(path + " [Absence]", 1);
                                self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] Not Found! -->");
                            }
                            else {
                                delog.process(path + " [Fetch]", 1);
                                self.str = self.str.replace(m[i], body);
                                cacheFile(path, body);
                            }
                            Q[i] = true;

                            var q = getUnique(Q);
                            if (q.length == 1 && q[0]) {
                                callback(self.str);
                            }
                        });
                    }

                })(m[i].match(new RegExp(remoteREGX))[1], i);
            }
        }
        else {
            callback(self.str);
        }
    }
};

module.exports = Remote;