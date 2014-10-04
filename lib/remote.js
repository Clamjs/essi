var _ = require("underscore"),
    fetchUrl = require("fetch").fetchUrl,
    delog = require("debug.log");

var REGX = {
    remote: /<!--#remote([^\-\>]*?)url="([^"]*?)"-->/gi
};

function Remote(str) {
    this.str = str;
}
Remote.prototype = {
    constructor: Remote,
    fetch: function (callback) {
        var self = this;
        var m = this.str.match(REGX.remote),
            Q = [];
        if (m) {
            for (var i in m) {
                Q.push(false);

                (function (path, i) {
                    fetchUrl(path, {outputEncoding: "utf-8"}, function (error, response, body) {
                        if (error) {
                            delog.error(path + " [Absence]", 1);
                            self.str = self.str.replace(m[i], "<!--#ERROR! URL[" + path + "] Not Found! -->");
                        }
                        else {
                            delog.process(path + " [Fetch]", 1);
                            self.str = self.str.replace(m[i], body);
                        }
                        Q[i] = true;

                        var q = _.uniq(Q);
                        if (q.length == 1 && q[0]) {
                            callback(self.str);
                        }
                    });
                })(m[i].match(/url="([^"]*?)"/)[1], i);
            }
        }
        else {
            callback(self.str);
        }
    }
};

module.exports = Remote;