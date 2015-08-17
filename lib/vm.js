var fs = require("fs");
var os = require("os");
var path = require("path");
var velocity = require("velocity");
var VmEngine = velocity.Engine;
var VmData = velocity.Data;
var VmParser = velocity.parser;
var beautifyJS = require("js-beautify").js_beautify;
var mkdirp = require("mkdirp");
var merge = require("merge");
var Helper = require("./helper");

function VM(param, trace) {
  this.RT = param.rootdir;
  this.trace = trace;

  this.context = {};

  this.vmControl = null;
  this.vmLayout = null;
  this.vmScreen = null;
}
VM.prototype = {
  constructor: VM,
  macroAdapter: function (content) {
    return content.replace(/#noescape\(\)/gm, "#@noescape()");
  },
  render: function (content, realPath, vars) {
    var ENV = {};
    var uris = realPath.replace(/[\/\\]templates[\/\\].+/, "/templates/env.js");
    if (fs.existsSync(uris)) {
      try {
        ENV = require(uris);
        delete require.cache[uris];
      }
      catch (e) {
        ENV = {};
      }
    }
    else {
      fs.writeFile(uris, "module.exports = {\n  \n};", function () {
        fs.chmod(uris, 0777);
      });
    }

    content = this.macroAdapter(content);

    var rootSet = [];
    var rootList = [path.dirname(realPath), this.RT];
    var splits = realPath.split(/[\/\\]screen[\/\\]/);
    if (splits.length > 1) {
      var ast = VmParser.parse(content);
      if (ast.body && ast.body.length) {
        var pos = ast.body
          .filter(function (node) {
            return node.type == "AssignExpr";
          })
          .map(function (node) {
            return node.pos;
          });

        var max = JSON.parse(JSON.stringify(pos)).sort(function (a, b) {
          return a.last_line < b.last_line;
        });
        var lines = content.split(os.EOL, max[0].last_line);

        rootSet = pos.map(function (p) {
          var arr = lines.slice(p.first_line - 1, p.last_line);
          var lst = arr.length - 1;
          arr[0] = arr[0].slice(p.first_column - 5);
          arr[lst] = arr[lst].slice(0, p.last_column + 1);
          return arr.join(os.EOL);
        });
      }

      splits.pop();
      var root = splits.join(path.sep + "screen" + path.sep);
      this.vmControl = path.join(root, "control", path.sep);
      this.vmLayout = path.join(root, "layout", path.sep);
      this.vmScreen = path.join(root, "screen", path.sep);
      [this.vmControl, this.vmLayout, this.vmScreen].forEach(function (dir) {
        if (dir) {
          rootList.push(dir);
          var dn = path.dirname(dir);
          if (rootList.indexOf(dn) == -1) {
            rootList.push(dn);
          }
          if (!fs.existsSync(dir)) {
            mkdirp.sync(dir);
            fs.chmod(dir, 0777);
          }
        }
      });
    }

    if (this.vmScreen && new RegExp("^" + this.vmScreen).test(realPath)) {
      var layoutContent = this.getLayoutVm(realPath);
      if (layoutContent) {
        content = layoutContent.replace('$screen_placeholder', content);
      }
    }

    content = this.macroAdapter(content);

    var dataFilePath = realPath + ".mock";
    if (fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      var vmdata = new VmData({
        data: true,
        template: content.replace(new RegExp("#parse|#include|#stop|#evaluate|#define|#macro|\\$control|\\$dateUtil|\\$moneyUtil|\\$securityUtil|\\$gsonUtils", 'g'), ''),
        macro: __dirname + "/macro.vm"
      });

      var dataContent = "module.exports = " + vmdata.extract().str + ';';
      dataContent = beautifyJS(dataContent, {indent_size: 2});
      fs.writeFileSync(dataFilePath, dataContent, {encoding: "utf-8"});
      fs.chmod(dataFilePath, 0777);
    }

    try {
      this.context = require(dataFilePath) || {};
      delete require.cache[dataFilePath];
    }
    catch (e) {
      this.context = {};
    }

    this.context = merge.recursive(true, this.context, vars || {}, this.setUtils(), ENV);

    var engine = new VmEngine({
      template: rootSet.join(os.EOL) + content,
      root: rootList,
      macro: __dirname + "/macro.vm"
    });

    var result = '';
    try {
      result = engine.render(this.context);
    }
    catch (e) {
      this.trace.error(e, "Velocity");
    }
    return result;
  },
  getLayoutVm: function (realPath) {
    var layoutFile = path.join(this.vmLayout, "default.vm");
    var fileName = path.basename(realPath);
    var dirArray = path.dirname(realPath.replace(this.vmScreen, '')).split(path.sep);

    // 逐层向上寻找layout
    var tempPath;
    for (var i = dirArray.length; i >= 0; i--) {
      tempPath = path.join(this.vmLayout, dirArray.slice(0, i).join(path.sep), fileName);
      if (fs.existsSync(tempPath)) {
        layoutFile = tempPath;
        break;
      }
    }

    if (layoutFile && fs.existsSync(layoutFile)) {
      return Helper.readFileInUTF8(layoutFile);
    }
    else {
      return '';
    }
  },
  setUtils: function () {
    var _this = this;
    var vars = {}, realPath = '';
    var context = {};

    context.control = {
      setTemplate: function (vmPath) {
        vars = {};
        realPath = _this.vmControl + vmPath;
        return this;
      },
      setParameter: function (key, value) {
        vars[key] = value;
        return this;
      },
      toString: function () {
        if (realPath && fs.existsSync(realPath)) {
          return _this.render(Helper.readFileInUTF8(realPath), realPath, vars);
        }
        else {
          var tip = "Exception in $control.setTemplate(\"" + realPath.replace(_this.vmControl, '') + "\")!";
          _this.trace.error(tip, "Velocity");
          return tip;
        }
      }
    };

    context.dateUtil = {
      ymdhmsFormat: function (timestamp) {
        return new Date(timestamp).format("yyyy-MM-dd hh:mm:ss");
      }
    };

    context.moneyUtil = {
      convertToYuan: function (s) {
        return parseFloat(s / 100).toFixed(2);
      }
    };

    context.securityUtil = {
      ignoretext: function (s) {
        return decodeURIComponent(s);
      },
      escapeJson: function (s) {
        return decodeURIComponent(s);
      }
    };

    context.gsonUtils = {
      toPrettyString: function (obj) {
        return JSON.stringify(obj);
      },
      toString: function (obj) {
        return JSON.stringify(obj);
      }
    };

    return context;
  }
};

module.exports = VM;
