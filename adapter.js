var ESSI = require("./essi");
var AssetsTool = require("./lib/assetsTool");
var pathLib = require("path");
var readyconf = require("readyconf");
var delog = require("debug.log");

module.exports = function (dir) {
    var param = {
        target: "src",
        replaces: {},
        virtual: {},
        remote: [
            "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->",
            "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}[\"']\\s{0,}([^#\"']*?)\\s{0,}[\"'][^->]*?-->"
        ],
        token: "fe-move",
        head: "head",
        tail: "tail",
        radical: false
    };

    param = readyconf.init(pathLib.join(process.cwd(), dir, pathLib.basename(__dirname) + ".json"), param);

    return function (next) {
        delog.request(this.req.url);

        var realpath = ESSI.Helper.matchVirtual(this.req.url, param);
        var todo = ESSI.Helper.preAction(this.req.url, realpath);
        if (todo.method) {
            this[todo.method].apply(this, todo.args);
        }
        else {
            var local = new ESSI.Local(this.req.url, param);
            var content = local.fetch(realpath);

            content = ESSI.Helper.customReplace(content, param.replaces);

            var remote = new ESSI.Remote(content);
            var self = this;
            remote.fetch(function (content) {
                var assetsTool = new AssetsTool(param.token, param.head, param.tail);
                self.html(assetsTool.action(content, param.radical));

                delog.response(self.req.url+"\n");
                try {
                    next();
                }
                catch (e) {
                }
            });
        }
    }

}