var fs = require("fs"),
  path = require("path"),
  juicer = require("juicer"),
  mace = require("mace"),
  delog = require("debug.log"),
  iconv = require("iconv-lite"),
  isUtf8 = require("is-utf8"),
  Helper = require("./helper");

juicer.set("strip", false);

var REGX = {
  def: /<!--\s{0,}#def([\s\S]*?)-->/gi,
  kv: /"([^"]*?)"\s{0,}:\s{0,}\$\{([^\}]*?)\}\s{0,},?/gi,
  mod: /<!--\s{0,}#include[^\->]*?file\s{0,}=\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1[^->]*?-->/gi,
  each: /<!--\s{0,}#eachInclude[^\->]*?file\s{0,}=\s{0,}(["'])\s{0,}([^"']*?)\s{0,}\1\s{1,}(.+)\s{1,}as\s{1,}(.+)[^->]*?-->/gi,
  json: /\{[\s\S]*?\}/,
  data: /data\s{0,}=\s{0,}(["'])\s{0,}([\s\S]*?)\s{0,}\1/,
  jeach: /{@each.+}([\s\S]*?){@\/each}/gi
};

function Local(_url, root, virtual, remote) {
  this.RT = path.join(process.cwd(), root || "src");
  this.requrl = path.join(this.RT, _url);
  this.virtual = virtual || {};
  this.remoteRegxStr = remote || [];

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
    delog.process(realDir + " [Directory]", 1);

    var rt = {dir: [], file: [], virtual: [], rel: path.relative(this.RT, this.requrl)};

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
    vars = mace.merge(true, this.vars, (typeof vars == "object" ? vars : {}));
    return juicer(str, vars);
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
  fetch: function (realPath, vars) {
    var state = false;
    if (fs.existsSync(realPath)) {
      state = fs.statSync(realPath);
    }

    if (state && state.isDirectory()) {
      return this.ls(realPath);
    }
    else {
      var isMain = (typeof vars == "undefined"),
        SSIList = [],
        self = this;

      if (isMain) {
        this.TREE = {};
        this.TREE[realPath] = -1;
      }

      var str = this.readFile(realPath, vars, isMain);

      for (var i in this.remoteRegxStr) {
        str = str.replace(new RegExp(this.remoteRegxStr[i], "ig"), function (i, m1, m2) {
          return self.remote(m2);
        });
      }

      str = this.eachInclude(str, realPath);

      str.replace(REGX.mod, function (i, m0, m1) {
        var tempPath = path.join(self.RT, m1);
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

      return this.include(this.render(str), SSIList);
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
      delog.process(fullpath + " [Read]", 1);
      var self = this;

      if (vars) {
        self.vars = vars;
      }

      var buff = fs.readFileSync(fullpath);
      var str = isUtf8(buff) ? buff.toString() : iconv.decode(buff, "gbk");
      str = str.replace(REGX.def, function (defBlock, matched) {
        self.vars = isMain ? mace.merge(true, self.vars, Helper.JSON_parse(matched)) : mace.merge(true, Helper.JSON_parse(matched), self.vars);
        return '';
      });

      return str;
    }
    else {
      delog.error(fullpath + " [Absence]", 1);
      return "<!--#ERROR! File[" + fullpath + "] Not Found! -->";
    }
  },
  str2vars: function (str) {
    var self = this,
      tempVar = new Object();

    str = str.replace(/\\/g, '').replace(/'/g, '"');

    // 兼容旧版Clam语法
    if (!str.match(REGX.json)) {
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

    str = str.replace(/^\{\,/, '{').replace(/\,\}$/, '}');

    return mace.merge(true, tempVar, JSON.parse(str));
  },
  remote: function (fullpath) {
    return '<!--#remote url="' + fullpath + '"-->';
  },
  overflow: function (fullpath) {
    delog.error(fullpath + " [Infinite]", 1);
    return "<!--#ERROR! [" + fullpath + "] Maximum call stack size exceeded -->";
  },
  error: function () {
    delog.error("Unknown Error", 1);
    return "<!--#ERROR! Unknown -->";
  }
};

function EXP_Local(_url, root, virtual, remote) {
  this.local = new Local(_url, root, virtual, remote);

}
EXP_Local.prototype = {
  constructor: EXP_Local,
  fetch: function (realpath) {
    return this.local.fetch(realpath);
  },
  readTpl: function (path) {
    var str = this.local.readFile(path);
    str = str.replace(REGX.def, '');
    return this.local.eachInclude(str);
  }
};

module.exports = EXP_Local;
