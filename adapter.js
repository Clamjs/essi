var pathLib = require("path");
var urlLib = require("url");
var ESSI = require("./essi");
var AssetsTool = require("./lib/assetsTool");
var delog = require("debug.log");
var iconv = require("iconv-lite");
var readyconf = require("readyconf");
var merge = readyconf.merge;

module.exports = function (confdir, highParam) {
    var param = {
        root: "src",
        charset: "utf-8",
        replaces: {},
        virtual: {},
        remote: [
            "<!--\\s{0,}HTTP\\s{0,}(:)\\s{0,}(.+),.+[^->]*?-->",
            "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->"
        ],
        token: "fe-move",
        head: "head",
        tail: "tail",
        radical: false
    };

    param = readyconf.init(pathLib.join(process.cwd(), confdir, pathLib.basename(__dirname) + ".json"), param);
    if (highParam) {
        param = merge.recursive(param, highParam);
    }

    return function (next) {
        var _url = urlLib.parse(this.req.url).pathname;
        var isOuterAssets = !_url.match(/^\/_virtual/);

        isOuterAssets && delog.request(this.req.url);

        var realpath = ESSI.Helper.matchVirtual(_url, param.root, param.virtual);
        var todo = ESSI.Helper.preAction(realpath);
        if (todo.method) {
            isOuterAssets && delog[todo.log](todo.content+"\n");
            this[todo.method].apply(this, todo.args);
        }
        else {
            var local = new ESSI.Local(_url, param.root, param.virtual, param.remote);
            var content = local.fetch(realpath);

            // 替换用户定义标记，支持正则
            content = ESSI.Helper.customReplace(content, param.replaces);

            // 抓取远程页面
            var remote = new ESSI.Remote(content, param.hosts);
            var self = this;
            remote.fetch(function (content) {
                var assetsTool = new AssetsTool(param.token, param.head, param.tail);
                content = iconv.encode(assetsTool.action(content, param.radical), param.charset);

                // TODO assetsTool
                self.html(content, param.charset);

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