var fs   = require("fs"),
    path = require("path"),
    url  = require("url"),
    mime = require("mime"),
    delog= require("debug.log");

exports.matchVirtual = function(_url, opt) {
    var virtual = opt.virtual,
        RT      = path.join(process.cwd(), opt.target);

    _url = url.parse(_url).pathname;

    if (_url == '/') {
        return path.join(RT, _url);
    }
    else if (_url.match(/^\/_virtual/)) {
        return path.join(path.dirname(__dirname), _url);
    }

    var matched = '', len = 0, varr = [];
    for (var v in virtual) {
        varr.push(v);
        if (_url.match(v) && v.length>len) {
            matched = v;
            len = v.length;
        }
    }
    varr.sort(function(a, b) {
        return b.length- a.length;
    });

    if (matched) {
        return path.join(RT, _url.replace(matched, virtual[matched]));
    }
    else {
        for (var i=0; i<varr.length; i++) {
            if (varr[i].match(_url) && len==0) {
                return path.join(path.dirname(__dirname), "_virtual/_empty");
            }
            else if (path.dirname(varr[i]) == path.dirname(_url)) {
                return path.join(RT, path.dirname(virtual[varr[i]]), path.basename(_url));
            }
        }
        return path.join(RT, _url);
    }
};
exports.isExists = function(file) {
    if (fs.existsSync(file)) {
        return true;
    }
    else {
        return false;
    }
};
exports.isAssets = function(file) {
    if (!exports.isExists(file) || fs.statSync(file).isDirectory()) {
        return false;
    }
    else {
        if (mime.lookup(file) === "text/html") {
            return false;
        }
        else {
            return true;
        }
    }
};
exports.JSON_parse = function (vars) {
    vars = vars.replace(/(^\s*)|(\s*$)/g, '');
    return new Function("return " + vars + ';')();
};
exports.customReplace = function(content, replaces) {
    for (var regx in replaces) {
        content = content.split(regx).join(replaces[regx]);
    }
    return content;
};

exports.preAction = function(_url, file) {
    if (!exports.isExists(file)) {
        delog.error("<= "+file+"\n");
        return {method:"error", args:["Not Found: "+file, 404]};
    }
    else if (exports.isAssets(file)) {
        delog.response(file+"\n");
        return {method:"pipe", args:[file]};
    }
    else {
        return {method:false};
    }
};