var fs = require("fs");
var path = require("path");
var juicer = require("juicer");
var merge = require("merge");
var Helper = require("./helper");

juicer.set({
  strip: false,
  errorhandling: false
});
juicer.register("random", Helper.random);

var REGX = {
  def: /<!--\s{0,}#def([\s\S]*?)-->/gi,
  kv: /"([^"]*?)"\s{0,}:\s{0,}\$\{([^\}]*?)\}\s{0,},?/gi,
  mod: /<!--\s{0,}#include[^\->]*?f?i?l?e?\s{0,}=?\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1[^>]*?-->/gi,
  each: /<!--\s{0,}#eachInclude[^\->]*?f?i?l?e?\s{0,}=?\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1\s{1,}(.+)\s{1,}as\s{1,}(.+)[^>]*?-->/gi,
  data: /data\s{0,}=\s{0,}(["'])\s{0,}([\s\S]*?)\s{0,}\1/,
  jeach: /{@each.+}([\s\S]*?){@\/each}/gi
};

function Juicer(param, trace) {
  this.RT = param.rootdir;
  this.remoteRegxStr = merge({
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->": "$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->": "$2"
  }, param.remote || {});
  this.ignoreTokens = param.ignoreTokens || [];
  this.replaces = param.replaces;

  this.trace = trace;

  this.TREE = {};   // 引用关系树
  this.vars = {};   // 页面级变量
  this.priv = {};   // 模块级变量
}
Juicer.prototype = {
  constructor: Juicer,
  fetch: function (realPath, isJuicer, vars) {
    if (fs.existsSync(realPath)) {
      var isMain = (typeof vars == "undefined");
      var result = this.parse(
        this.readFile(realPath, vars, isMain),
        realPath,
        isJuicer,
        isMain
      );
      return result;
    }
    else {
      return false;
    }
  },
  getVars: function (isMain) {
    return (typeof isMain == "undefined" || isMain) ? this.vars : this.priv;
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
      str = this.render(str, isMain) || str;
    }

    return this.include(str, SSIList);
  },
  str2vars: function (str) {
    if (!str) {
      return {};
    }

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

    var keys = Object.keys(this.priv);
    keys.forEach(function (key) {
      str = str.replace(new RegExp("\\$\\{" + key + "\\}", 'g'), JSON.stringify(this.priv[key]));
    }.bind(this));

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
    str = str.replace(REGX.def, function (defBlock, matched) {
      if (isMain) {
        this.vars = merge.recursive(true, this.vars, Helper.JSON_parse(matched));
      }
      else {
        this.priv = merge.recursive(true, Helper.JSON_parse(matched), this.priv);
      }
      return '';
    }.bind(this));

    return Helper.customReplace(str, this.replaces);
  },
  readFile: function (fullpath, vars, isMain) {
    if (fs.existsSync(fullpath)) {
      var hasVars = (typeof vars == "object" && vars);
      if (isMain) {
        this.vars = hasVars ? vars : {};
      }
      else {
        this.priv = hasVars ? vars : {};
      }

      return this.clearMock(Helper.readFileInUTF8(fullpath), isMain);
    }
    else {
      this.trace.error(fullpath, "Absence");
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
  render: function (str, isMain) {
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
      result = juicer(str, this.getVars(isMain));
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
    this.trace.error(fullpath, "Infinite");
    return "<!--#ERROR! [" + fullpath + "] Maximum call stack size exceeded -->";
  },
  error: function () {
    this.trace.error('', "Unknown");
    return "<!--#ERROR! Unknown -->";
  }
};

module.exports = Juicer;
