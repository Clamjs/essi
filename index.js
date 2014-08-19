var fs      = require("fs"),
    path    = require("path"),
    url     = require("url"),
    fetchUrl= require("fetch").fetchUrl,
    juicer  = require("juicer"),
    merge   = require("merge"),
    _       = require("underscore"),
    delog   = require("debug.log"),
    Helper  = require("./lib/helper");

var REGX = {
    def     : /<!--\s{0,}#def([\s\S]*?)-->/gi,
    kv      : /"([^"]*?)"\s{0,}:\s{0,}\$\{([^\}]*?)\}\s{0,},?/gi,
    remote  : /<!--#remote([^\-\>]*?)url="([^"]*?)"-->/gi,
    mod     : /<!--\s{0,}#include[^\-\>]*?file\s{0,}=\s{0,}["']\s{0,}([^"']*?)\s{0,}["'][^\-\>]*?-->/gi,
    data    : /data\s{0,}=\s{0,}["']\s{0,}(\{[\s\S]*?\})\s{0,}["']/
};

juicer.set("strip", false);

function Local(_url, opt) {
    this.RT      = path.join(opt.rootdir, opt.target);
    this.requrl  = path.join(this.RT, url.parse(_url).pathname);
    this.virtual = opt.virtual;
    this.remoteRegx = opt.remoteRegx ? opt.remoteRegx : [
        /<!--\s{0,}#include[^\-\>]*?tms\s{0,}=\s{0,}["']\s{0,}([^#"']*?)\s{0,}["'][^\-\>]*?-->/gi,
        /<!--\s{0,}HTTP\s{0,}:\s{0,}(.+)\,.+[^\-\>]*?-->/gi
    ];

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

        var detail = fs.readdirSync(realDir);
        var rt = {dir:[], file:[], virtual:[], rel:path.relative(this.RT, this.requrl)};
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

        return juicer(fs.readFileSync(path.join(__dirname, "_virtual/ls.html")).toString(), rt);
    },
    render: function (str, vars) {
        vars = merge(this.vars, (typeof vars == "object" ? vars : {}));
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
            for (var i in this.remoteRegx) {
                str = str.replace(this.remoteRegx[i], function(i, m1) {
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
                        vars: tempData ? self.str2vars(tempData[1]) : {}
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

            var str = fs.readFileSync(fullpath).toString();
            str = str.replace(REGX.def, function (defBlock, matched) {
                self.vars = isMain ? merge(self.vars, Helper.JSON_parse(matched)) : merge(Helper.JSON_parse(matched), self.vars);
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

        return merge(tempVar, JSON.parse(str));
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

                (function(path, i) {
                    fetchUrl(path, {outputEncoding:"utf-8"}, function(error, response, body) {
                        if (error) {
                            delog.error(path+" [Absence]", 1);
                            self.str = self.str.replace(m[i], "<!--#ERROR! URL["+path+"] Not Found! -->");
                        }
                        else {
                            delog.process(path+" [Fetch]", 1);
                            self.str = self.str.replace(m[i], body);
                        }
                        Q[i] = true;

                        var q = _.uniq(Q);
                        if (q.length==1 && q[0]) {
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

exports.Local  = Local;
exports.Remote = Remote;
exports.Helper = Helper;

exports.preAction = function(_url, file) {
    delog.request(_url);
    if (!Helper.isExists(file)) {
        delog.error("<= "+file+"\n");
        return {method:"error", args:["Not Found: "+file, 404]};
    }
    else if (Helper.isAssets(file)) {
        delog.response(file+"\n");
        return {method:"pipe", args:[file]};
    }
    else {
        return {method:false};
    }
};