var fs = require("fs");
var path = require("path");
var juicer = require("juicer");
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

function Local(realpath, param) {
  this.requrl = realpath;

  this.RT = path.join(process.cwd(), param.rootdir || "src");
  this.remoteRegxStr = Helper.merge(true, {
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->": "$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->": "$2"
  }, param.remote || {});
  this.traceRule = param.traceRule || false;

  this.ignoreTokens = param.ignoreTokens || [];

  this.TREE = {};
  this.vars = {};
}
Local.prototype = {
  constructor: Local,
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
  ls: function (realDir) {
    if (("Directory " + realDir).match(this.traceRule)) {
      Helper.Log.process("Directory", realDir);
    }

    var rt = {dir: [], file: [], rel: path.relative(this.RT, this.requrl)};

    var detail = fs.readdirSync(realDir);
    detail.forEach(function (i) {
      var state = fs.statSync(path.join(realDir, i));
      if (state.isDirectory()) {
        rt.dir.push(path.basename(i));
      }
      else if (i.match(/^[^.]/)) {
        rt.file.push(path.basename(i));
      }
    });

    return juicer(fs.readFileSync(path.join(path.dirname(__dirname), "_virtual/ls.html")).toString(), rt);
  },
  render: function (str, vars) {
    vars = Helper.merge(true, this.vars, (typeof vars == "object" ? vars : {}));
    var result;
    try {
      var map = {};
      var flag = 0;
      for (var i= 0, len=this.ignoreTokens.length; i<len; i++) {
        str = str.replace(new RegExp(this.ignoreTokens[i], 'g'), function(all) {
          var token = "_ESSI_TOKEN_"+(flag++)+'_';
          map[token] = all;
          return token;
        });
      }

      result = juicer(str, vars);

      for (var token in map) {
        result = result.replace(new RegExp(token, 'g'), map[token]);
      }
    }
    catch(e) {
      result = str;
    }
    return result;
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
  clearMock: function (str, isMain) {
    var self = this;
    return str.replace(REGX.def, function (defBlock, matched) {
      self.vars = isMain ? Helper.merge(true, self.vars, Helper.JSON_parse(matched)) : Helper.merge(true, Helper.JSON_parse(matched), self.vars);
      return '';
    });
  },
  parse: function (str, realPath, isJuicer) {
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
  setRoot: function (realPath) {
    this.TREE = {};
    this.TREE[realPath] = -1;
  },
  fetch: function (realPath, vars, isJuicer) {
    var state = false;
    if (fs.existsSync(realPath)) {
      state = fs.statSync(realPath);
    }

    if (state && state.isDirectory()) {
      if (realPath.match(/\/$/)) {
        return this.ls(realPath);
      }
      else {
        return false;
      }
    }
    else {
      var isMain = (typeof vars == "undefined");
      if (isMain) {
        this.setRoot(realPath);
      }

      return this.parse(this.readFile(realPath, vars, isMain), realPath, isJuicer);
    }
  },
  include: function (str, SSIList) {
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

    return Helper.merge(true, tempVar, JSON.parse(str));
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

function EXP_Local(realpath, param) {
  this.realpath = realpath;
  this.local = new Local(realpath, param);
}
EXP_Local.prototype = {
  constructor: EXP_Local,
  fetch: function (isJuicer) {
    return this.local.fetch(this.realpath, undefined, isJuicer);
  },
  parse: function (content, isJuicer) {
    this.local.setRoot(this.realpath);
    content = this.local.clearMock(content, true);
    content = this.local.parse(content, this.realpath, isJuicer);
    return content;
  }
};

module.exports = EXP_Local;
