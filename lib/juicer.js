var fs = require("fs");
var path = require("path");
var juicer = require("juicer");
var merge = require("merge");
var Helper = require("./helper");

juicer.set({
  strip: false,
  errorhandling: false
});

var REGX = {
  def: /<!--\s{0,}#def([\s\S]*?)-->/gi,
  kv: /"([^"]*?)"\s{0,}:\s{0,}\$\{([^\}]*?)\}\s{0,},?/gi,
  mod: /<!--\s{0,}#include[^\->]*?file\s{0,}=\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1[^>]*?-->/gi,
  each: /<!--\s{0,}#eachInclude[^\->]*?file\s{0,}=\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1\s{1,}(.+)\s{1,}as\s{1,}(.+)[^>]*?-->/gi,
  data: /data\s{0,}=\s{0,}(["'])\s{0,}([\s\S]*?)\s{0,}\1/,
  jeach: /{@each.+}([\s\S]*?){@\/each}/gi
};

function Juicer(param) {
  this.RT = path.join(process.cwd(), param.rootdir || "src");
  this.remoteRegxStr = merge({
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->": "$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->": "$2"
  }, param.remote || {});
  this.traceRule = param.traceRule || false;

  this.ignoreTokens = param.ignoreTokens || [];

  this.TREE = {};
  this.vars = {};
}
Juicer.prototype = {
  constructor: Juicer,
  fetch: function (realPath, isJuicer, vars) {
    if (fs.existsSync(realPath)) {
      var isMain = (typeof vars == "undefined");
      return this.parse(
        this.readFile(realPath, vars, isMain),
        realPath,
        isJuicer,
        isMain
      );
    }
    else {
      return false;
    }
  },
  parse: function (str, realPath, isJuicer, isMain) {
    if (isMain) {
      this.TREE = {};
      this.TREE[realPath] = -1;
    }

    str = this.clearMock(str, isMain);

    var self = this;
    var SSIList = [];

    for (var reg in this.remoteRegxStr) {
      str = str.replace(new RegExp(reg, "ig"), this.remote(this.remoteRegxStr[reg]));
    }

    str = this.eachInclude(str, realPath);

    str.replace(REGX.mod, function (i, m0, m1) {
      var tempPath;
      if (m1.match(/^\//)) {
        tempPath = path.join(self.RT, m1);
      }
      else {
        tempPath = path.resolve(path.dirname(realPath), m1);
      }

      if (self.check(tempPath, realPath)) {
        var tempData = i.match(REGX.data);

        SSIList.push({
          type: "mod",
          path: tempPath,
          vars: tempData ? self.str2vars(tempData[2]) : {}
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

    if (typeof isJuicer == "undefined" || isJuicer) {
      str = this.render(str) || str;
    }

    return this.include(str, SSIList);
  },
  str2vars: function (str) {
    var self = this;
    var tempVar = {};

    str = str.replace(/\\/g, '').replace(/'/g, '"');

    // 兼容旧版Clam语法
    if (!str.match(/\{[\s\S]*?\}/)) {
      if (!str.match(/\:/) && str.match(/^\$/)) {
        var key = str.replace('$', '');
        str = '{"' + key + '":${' + key + '}}';
      }
      else {
        var arr = str.split(','),
          json = [];
        for (var i in arr) {
          if (arr[i].match(/\:\$/)) {
            json.push('"' + arr[i].replace(':$', '":${') + '}');
          }
          else if (arr[i].match(/\:(true|false)/)) {
            json.push('"' + arr[i].replace(':', '":'));
          }
          else {
            json.push('"' + arr[i].replace(':', '":"') + '"');
          }
        }
        str = '{' + json.join(',') + '}';
      }
    }

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

    str = str.replace(/^\{\s*\,\s*/, '{').replace(/\s*\,\s*\}$/, '}');

    return merge.recursive(true, tempVar, JSON.parse(str));
  },
  clearMock: function (str, isMain) {
    var self = this;
    return str.replace(REGX.def, function (defBlock, matched) {
      self.vars = isMain ? merge.recursive(true, self.vars, Helper.JSON_parse(matched)) : merge.recursive(true, Helper.JSON_parse(matched), self.vars);
      return '';
    });
  },
  readFile: function (fullpath, vars, isMain) {
    if (fs.existsSync(fullpath)) {
      if (vars) {
        this.vars = vars;
      }

      return this.clearMock(Helper.readFileInUTF8(fullpath), isMain);
    }
    else {
      if (("Error Absence " + fullpath).match(this.traceRule)) {
        Helper.Log.error(fullpath + " [Absence]", 1);
      }
      return "<h1>404 Not Found!</h1><h2>" + fullpath + "</h2>";
    }
  },
  include: function (str, SSIList) {
    var i = 0, self = this;

    return str.replace(REGX.mod, function (txt) {
      var item = SSIList[i++];
      switch (item.type) {
        case "mod" :
          txt = self.fetch(item.path, true, item.vars);
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
  eachInclude: function (str, realPath) {
    var self = this;
    return str.replace(REGX.each, function (i, m1, m2, m3, m4) {
      var tempPath = path.join(self.RT, m2);
      if (typeof realPath == "undefined" || self.check(tempPath, realPath)) {
        return "{@each " + m3 + " as " + m4 + "}" + self.readFile(tempPath) + "{@/each}";
      }
      else {
        return '';
      }
    });
  },
  render: function (str, vars) {
    vars = merge.recursive(true, this.vars, (typeof vars == "object" ? vars : {}));

    var map = {};
    var flag = 0;
    for (var i = 0, len = this.ignoreTokens.length; i < len; i++) {
      str = str.replace(new RegExp(this.ignoreTokens[i], 'g'), function (matched) {
        var token = "_ESSI_TOKEN_" + (flag++) + '_';
        map[token] = matched;
        return token;
      });
    }

    var result;
    try {
      result = juicer(str, vars);
    }
    catch (e) {
      result = str;
    }

    for (var token in map) {
      result = result.replace(new RegExp(token, 'g'), map[token]);
    }

    return result;
  },
  check: function (son, parent) {
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
  remote: function (fullpath) {
    return '<!--#remote url="' + fullpath + '"-->';
  },
  overflow: function (fullpath) {
    if (("Error Infinite " + fullpath).match(this.traceRule)) {
      Helper.Log.error(fullpath + " [Infinite]", 1);
    }
    return "<!--#ERROR! [" + fullpath + "] Maximum call stack size exceeded -->";
  },
  error: function () {
    Helper.Log.error("Unknown Error", 1);
    return "<!--#ERROR! Unknown -->";
  }
};

module.exports = Juicer;