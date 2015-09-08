var fs = require("fs");
var path = require("path");
var velocity = require("velocity");
var VmEngine = velocity.Engine;
var VmData = velocity.Data;
var beautifyJS = require("js-beautify").js_beautify;
var mkdirp = require("mkdirp");
var merge = require("merge");
var Helper = require("./helper");

function VM(param, trace) {
  this.RT = param.rootdir;
  this.layout = param.layout;
  this.trace = trace;

  this.context = {};

  this.vmControl = null;
  this.vmLayout = null;
  this.vmScreen = null;

  this.beginTag = "<!-- ESSI Screen Begin at " + new Date().valueOf() + "\n";
  this.endTag = "\nESSI Screen End -->";
}
VM.prototype = {
  constructor: VM,
  macroAdapter: function (content) {
    return content.replace(/#noescape\(\)/gm, "#@noescape()");
  },
  render: function (content, realPath, vars) {
    if (!content) {
      return content;
    }

    vars = vars || {};

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

    var macroContent = Helper.readFileInUTF8(__dirname + "/macro.vm");
    var macroPath = realPath.replace(/[\/\\]templates[\/\\].+/, "/templates/env.mcr");
    if (fs.existsSync(macroPath)) {
      macroContent += "\n" + Helper.readFileInUTF8(macroPath);
    }

    content = this.macroAdapter(content);

    var rootList = [path.dirname(realPath), this.RT];
    var splits = realPath.split(/[\/\\]screen[\/\\]/);
    if (splits.length > 1) {
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

      var layoutContent = this.getLayoutVm(realPath);
      if (layoutContent) {
        content = this.beginTag + content + this.endTag + layoutContent;
      }
    }

    content = this.macroAdapter(content);

    var dataFilePath = realPath + ".mock";
    if (fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      var vmdata = new VmData({
        data: true,
        template: content.replace(new RegExp("#parse|#include|#stop|#evaluate|#define|#macro|\\$\!?\{?screen_placeholder|\\$\!?\{?control|\\$\!?\{?dateUtil|\\$\!?\{?moneyUtil|\\$\!?\{?securityUtil|\\$\!?\{?gsonUtils", 'g'), ''),
        macro: macroContent
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

    if (typeof this.context._ == "function") {
      this.context = merge.recursive(true, this.context, this.context._(vars, this.context) || {});
    }

    this.context = merge.recursive(true, this.context, vars, this.setUtils(), ENV);
    if (typeof ENV._ == "function") {
      this.context = merge.recursive(true, this.context, ENV._(this.context) || {});
    }

    var engine = new VmEngine({
      template: content,
      root: rootList,
      macro: macroContent
    });

    var result = '';
    try {
      result = engine.render(this.context);

      if (this.vmScreen && new RegExp("^" + this.vmScreen).test(realPath)) {
        var screen_placeholder = '';
        result = result.replace(
          new RegExp("^" + Helper.str2regx(this.beginTag) + "([\\s\\S]*?)" + Helper.str2regx(this.endTag) + "\\s{0,}", 'g'),
          function (total, $1) {
            screen_placeholder = $1;
            return '';
          }
        );
        result = result.replace("$screen_placeholder", screen_placeholder);
      }

      return result;
    }
    catch (e) {
      this.trace.error(e, "Velocity");
    }
    return result;
  },
  getLayoutVm: function (realPath) {
    var layoutFile = path.join(this.vmLayout, this.layout || "default.vm");
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

    if (layoutFile && fs.existsSync(layoutFile) && fs.lstatSync(layoutFile).isFile()) {
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
        realPath = _this.vmControl + vmPath.replace(/\?.+/, '');
        return this;
      },
      setParameter: function (key, value) {
        vars[key] = value;
        return this;
      },
      toString: function () {
        if (realPath && fs.existsSync(realPath) && fs.lstatSync(realPath).isFile()) {
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
      },
      ymdFormat: function (timestamp) {
        return new Date(timestamp).format("yyyy-MM-dd");
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
      },
      richtext: function (s) {
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
