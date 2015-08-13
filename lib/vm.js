var fs = require("fs");
var path = require("path");
var VmEngine = require("velocity").Engine;
var VmData = require("velocity").Data;
var beautifyJS = require("js-beautify").js_beautify;
var mkdirp = require("mkdirp");
var merge = require("merge");
var Helper = require("./helper");

/**
 * 将json转成字符串输出
 */
var print = function (a) {
  var result = '';

  if (typeof a == "object") {
    if (a instanceof(Array)) {
      result += '[';
      var index = 0;
      for (var i = 0; i < a.length; i++) {
        if (index > 0) {
          result += ',';
        }
        result += print(a[i]);
        index++;
      }
      result += ']';
    }
    else if (a.type == "fun") {
      //对于function的输出
      var args = '';

      for (var i = 0; i < a.arguments.length; i++) {
        var arg = a.arguments[i];
        if (i != 0) {
          args += ',';
        }
        args += arg.type + '' + i;
      }

      result += "function(" + args + ") {return " + print(a.rtn) + '}';

    }
    else {
      var arr = [];
      for (var i in a) {
        if (i == "__name__") {
          continue;
        }
        arr.push('"' + i + '":' + print(a[i]));
      }

      if (arr.length) {
        result += '{' + arr.join(',') + '}';
      }
      else {
        result += '""';
      }
    }
  }
  else {
    result += '"' + (a ? a.toString() : '') + '"';
  }

  return result;
};

var clear = function (data) {
  if (typeof data.control != "undefined") {
    delete data.control;
  }
  if (typeof data.dateUtil != "undefined") {
    delete data.dateUtil;
  }
  if (typeof data.moneyUtil != "undefined") {
    delete data.moneyUtil;
  }
  if (typeof data.securityUtil != "undefined") {
    delete data.securityUtil;
  }
  if (typeof data.gsonUtils != "undefined") {
    delete data.gsonUtils;
  }
  return data;
};

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
  render: function (content, realPath, contextData) {
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
    }

    if (this.vmScreen && new RegExp("^" + this.vmScreen).test(realPath)) {
      var layoutContent = this.getLayoutVm(realPath);
      if (layoutContent) {
        content = layoutContent.replace('$screen_placeholder', content);
      }
    }

    content = content.replace(/#noescape\(\)/gm, "#@noescape()");
    var sets = content.match(/#set\(([^\)]*?)\)/g);
    if (sets) {
      content = sets.join("\n") + content;
    }

    var dataFilePath = realPath + ".mock";
    if (fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      var vmdata = new VmData({
        data: true,
        template: content,
        root: rootList,
        macro: __dirname + "/macro.vm"
      });

      var dataContent = "module.exports = " + print(clear(vmdata.extract().raw)) + ';';
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

    this.context = clear(merge.recursive(true,
      this.context, ENV, contextData || {}
    ));

    this.setUtils();

    var engine = new VmEngine({
      template: content,
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

    this.context.control = {
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

    this.context.dateUtil = {
      ymdhmsFormat: function (timestamp) {
        return new Date(timestamp).format("yyyy-MM-dd hh:mm:ss");
      }
    };

    this.context.moneyUtil = {
      convertToYuan: function (s) {
        return parseFloat(s / 100).toFixed(2);
      }
    };

    this.context.securityUtil = {
      ignoretext: function (s) {
        return decodeURIComponent(s);
      },
      escapeJson: function (s) {
        return decodeURIComponent(s);
      }
    };

    this.context.gsonUtils = {
      toPrettyString: function (obj) {
        return JSON.stringify(obj);
      },
      toString: function (obj) {
        return JSON.stringify(obj);
      }
    };
  }
};

module.exports = VM;
