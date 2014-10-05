var fs = require("fs"),
    path = require("path"),
    juicer = require("juicer"),
    merge = require("merge"),
    delog = require("debug.log"),
    iconv = require("iconv-lite"),
    isUtf8 = require("is-utf8"),
    Helper = require("./helper");

juicer.set("strip", false);

var REGX = {
    def     : /<!--\s{0,}#def([\s\S]*?)-->/gi,
    kv      : /"([^"]*?)"\s{0,}:\s{0,}\$\{([^\}]*?)\}\s{0,},?/gi,
    mod     : /<!--\s{0,}#include[^\->]*?file\s{0,}=\s{0,}["']\s{0,}([^"']*?)\s{0,}["'][^\->]*?-->/gi,
    data    : /data\s{0,}=\s{0,}["']\s{0,}(\{[\s\S]*?\})\s{0,}["']/
};

function Local(_url, opt) {
    this.RT      = path.join(process.cwd(), opt.root);
    this.requrl  = path.join(this.RT, _url);
    this.virtual = opt.virtual;
    this.remoteRegxStr = opt.remote ? opt.remote : [];

    this.TREE = null;
    this.vars = null;
}
Local.prototype = {
    constructor: Local,
    check : function (son, parent) {
        if (this.TREE[parent] && this.TREE[parent] == -1) {
            return true;
        }
        else if (son == parent) {
            return false;
        }
        else {
            return this.check(son, this.TREE[parent]);
        }
    },
    ls : function(realDir) {
        delog.process(realDir+" [Directory]", 1);

        var rt = {dir:[], file:[], virtual:[], rel:path.relative(this.RT, this.requrl)};

        var detail = fs.readdirSync(realDir);
        detail.forEach(function(i) {
            var state = fs.statSync(path.join(realDir, i));
            if (state.isDirectory()) {
                rt.dir.push(path.basename(i));
            }
            else if (i.match(/^[^.]/)) {
                rt.file.push(path.basename(i));
            }
        });

        var virtual = '';
        for (var v in this.virtual) {
            v = path.relative(this.requrl, path.join(this.RT, v));
            if (v && !v.match(/^\.\./)) {
                virtual = v.split(path.sep)[0];
                if (rt.dir.indexOf(virtual) == -1 && rt.file.indexOf(virtual) == -1 && rt.virtual.indexOf(virtual) == -1) {
                    rt.virtual.push(virtual);
                }
            }
        }

        return juicer(fs.readFileSync(path.join(path.dirname(__dirname), "_virtual/ls.html")).toString(), rt);
    },
    render: function (str, vars) {
        vars = merge.recursive(this.vars, (typeof vars == "object" ? vars : {}));
        return juicer(str, vars);
    },
    fetch: function(realPath, vars) {
        var state = false;
        if (fs.existsSync(realPath)) {
            state = fs.statSync(realPath);
        }

        if (state && state.isDirectory()) {
            return this.ls(realPath);
        }
        else {
            var isMain = (typeof vars == "undefined"),
                SSIList = [], self = this;

            if (isMain) {
                this.TREE = new Object();
                this.TREE[realPath] = -1;
            }

            var str = this.readFile(realPath, vars, isMain);
            for (var i in this.remoteRegxStr) {
                str = str.replace(new RegExp(this.remoteRegxStr[i], "ig"), function(i, m1) {
                    return self.remote(m1);
                });
            }

            str.replace(REGX.mod, function(i, m1) {
                var tempPath = path.join(self.RT, m1);
                if (self.check(tempPath, realPath)) {
                    var tempData = i.match(REGX.data);

                    SSIList.push({
                        type: "mod",
                        path: tempPath,
                        vars: tempData ? self.str2vars(tempData[1].replace(/\\/g, '')) : {}
                    });

                    self.TREE[tempPath] = realPath;
                }
                else {
                    SSIList.push({
                        type: "max",
                        path: tempPath
                    });
                }
            });

            return this.include(this.render(str), SSIList);
        }
    },
    include: function(str, SSIList) {
        var i = 0, self = this;

        return str.replace(REGX.mod, function (txt) {
            var item = SSIList[i++];
            switch (item.type) {
                case "mod" :
                    txt = self.fetch(item.path, item.vars);
                    break;
                case "max" :
                    txt = self.overflow(item.path);
                    break;
                default :
                    txt = self.error();
            }
            return txt;
        });
    },
    readFile: function (fullpath, vars, isMain) {
        if (fs.existsSync(fullpath)) {
            delog.process(fullpath+" [Read]", 1);
            var self = this;

            self.vars = vars ? vars : {};

            var buff = fs.readFileSync(fullpath);
            var str = isUtf8(buff) ? buff.toString() : iconv.decode(buff, "gbk");
            str = str.replace(REGX.def, function (defBlock, matched) {
                self.vars = isMain ? merge.recursive(self.vars, Helper.JSON_parse(matched)) : merge.recursive(Helper.JSON_parse(matched), self.vars);
                return '';
            });

            return str.replace(/{@each.+}([\s\S]*?){@\/each}/gi, function (eachBlock) {
                return juicer(eachBlock, self.vars);
            });
        }
        else {
            delog.error(fullpath+" [Absence]", 1);
            return "<!--#ERROR! File[" + fullpath + "] Not Found! -->";
        }
    },
    str2vars: function (str) {
        var self = this,
            tempVar = new Object();

        str = str.replace(/'/g, '"');
        str = str.replace(REGX.kv, function (i, m0, m1) {
            var arr = m1.split('.'), vars = self.vars;
            for (var i in arr) {
                if (typeof vars[arr[i]] != "undefined") {
                    vars = vars[arr[i]];
                }
                else {
                    vars = null;
                    break;
                }
            }
            tempVar[m0] = vars;
            return '';
        });

        return merge.recursive(tempVar, JSON.parse(str));
    },
    remote: function(fullpath) {
        return '<!--#remote url="'+fullpath+'"-->';
    },
    overflow: function (fullpath) {
        delog.error(fullpath+" [Infinite]", 1);
        return "<!--#ERROR! [" + fullpath + "] Maximum call stack size exceeded -->";
    },
    error: function () {
        delog.error("Unknown Error", 1);
        return "<!--#ERROR! Unknown -->";
    }
};

function EXP_Local(_url, param) {
    this.local = new Local(_url, param);

}
EXP_Local.prototype = {
    constructor: EXP_Local,
    fetch: function(realpath) {
        return this.local.fetch(realpath);
    }
}
module.exports = EXP_Local;
