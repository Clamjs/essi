var ESSI     = require("./essi");
var Feloader = require("./lib/assets");
var pathLib  = require("path");
var RC = require("readyconf");

module.exports = function(dir) {
    var param = {
        target:"src",
        replaces:{},
        virtual:{},
        remote: [
            "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->",
            "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}[\"']\\s{0,}([^#\"']*?)\\s{0,}[\"'][^->]*?-->"
        ],
        token:"fe-move",
        head:"head",
        tail:"tail",
        radical:false
    };

    param = RC.init(pathLib.join(process.cwd(), dir, pathLib.basename(__dirname)+".json"), param);

    return function (next) {
        var realpath = ESSI.Helper.matchVirtual(this.req.url, param);
        var todo = ESSI.preAction(this.req.url, realpath);
        if (todo.method) {
            this[todo.method].apply(this, todo.args);
        }
        else {
            var local = new ESSI.Local(this.req.url, param);
            var content = local.fetch(realpath);

            content = ESSI.Helper.customReplace(content, param.replaces);

            var remote = new ESSI.Remote(content);
            var self = this;
            remote.fetch(function(content) {
                var feloader = new Feloader(param.token, param.head, param.tail);
                //delog.response(this.req.url+"\n")
                self.html(feloader.action(content, param.radical));
                try {
                    next();
                }
                catch (e) {}
            });
        }
    }

}