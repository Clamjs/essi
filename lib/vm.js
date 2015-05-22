var VmEngine = require("velocity").Engine;
var VmParser = require("velocity").parser;
var beautifyJS = require("js-beautify").js_beautify;
var fs = require("fs");
var path = require("path");
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

      result += "function(" + args + "){return " + print(a.rtn) + '}';

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
  return data;
};

/**
 * 将vm模板经过parse后的结果生成json数据结构
 */
var transferToken = function (token, data, currData) {
  var type = token.type;
  var transferFun = transfer[type];
  transferFun = (transferFun || transfer["__default"]);
  return transferFun(token, data, currData);
};

/**
 * 针对不同的token类型做不同的处理
 */
var transfer = {
  Statements: function (token, data, currData) {
    for (var i = 0; i < token.body.length; i++) {
      var tempToken = token.body[i];
      transferToken(tempToken, data, currData);
    }
  },
  Text: function () {
  },
  Reference: function (token, data, currData) {
    var object = token.object;
    return transferToken(object, data, data);
  },
  Identifier: function (token, data, currData) {
    var obj = (data[token.name] || {__name__: token.name});
    data[token.name] = obj;
    return obj;
  },
  Index: function (token, data, currData) {
    var object = token.object;
    var newObj = transferToken(object, data, currData);

    var property = token.property;
    transferToken(property, data, newObj);
    return newObj;
  },
  Method: function (token, data, currData) {
    var callee = token.callee;
    var newFun = {fun: "newFun"};
    var newObj = transferToken(callee, data, currData);
    //newObj = newFun;
    newObj.type = "fun";
    newObj.rtn = (newObj.return || {});

    var arguments = token.arguments;
    for (var i = 0; i < arguments.length; i++) {
      transferToken(arguments[i], data, newObj);
    }
    newObj.arguments = arguments;
    return newObj.rtn;
  },
  If: function (token, data, currData) {
    var test = token.test;
    var newObj = transferToken(test, data, currData);

    var consequent = token.consequent;
    transferToken(consequent, data, currData);
  },
  BinaryExpr: function (token, data, currData) {
    var left = token.left;
    var newObj = transferToken(left, data, currData);

    var right = token.right;
    transferToken(right, data, currData);
  },
  AssignExpr: function (token, data, currData) {
    //var left = token.left;
    //var newObj = transferToken(left, data, currData);
    //transferToken(token.right, data, currData);
  },
  Foreach: function (token, data, currData) {
    var left = token.left;
    var leftObj = transferToken(left, data, currData);

    var right = token.right;
    var rightObj = transferToken(right, data, currData);

    var body = token.body;
    transferToken(body, data, currData);

    if (leftObj && leftObj.__name__) {
      delete data[leftObj.__name__];
    }

    if (rightObj && rightObj.__name__) {
      var rightName = rightObj.__name__;
      data[rightName] = [];
      data[rightName].push(leftObj);
      data[rightName].__name__ = rightName;
    }
  },
  DString: function (token, data, currData) {
    //currData[token.value] = "";
    //return currData;
  },
  Integer: function (token, data, currData) {
    //currData[token.value] = 0;
    //return currData;
  },
  Prop: function (token, data, currData) {
    var obj = {};
    currData[token.name] = obj;
    return obj;
  },
  Property: function (token, data, currData) {
    var object = token.object;
    var newObj = transferToken(object, data, currData);

    var property = token.property;
    var propertyObj = transferToken(property, data, newObj);
    return propertyObj;
  },
  __default: function (token, data, currData) {
    var object = token.object;
    if (object) {
      return transferToken(object, data, currData);
    }
  }
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
    var URIS = {};
    var uris = realPath.replace(/[\/\\]templates[\/\\].+/, "/templates/uris.json");
    if (fs.existsSync(uris)) {
      try {
        URIS = require(uris);
        delete require.cache[uris];
      }
      catch (e) {
        URIS = {};
      }
    }
    else {
      fs.writeFile(uris, "{\n  \n}", function() {
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

    var dataFilePath = realPath + ".mock";
    if (fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      var data = {};
      var ast = VmParser.parse(content);
      transferToken(ast, data, data);
      data = clear(data);

      var dataContent = "module.exports = " + print(data) + ';';
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
      URIS, this.context, contextData || {}
    ));

    for (var uri in URIS) {
      if (!this.context[uri]) {
        this.context[uri] = URIS[uri];
      }
    }

    this.setUtils();

    var engine = new VmEngine({
      template: content,
      root: rootList
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
    for (var i = dirArray.length; i > 0; i--) {
      tempPath = path.join(this.vmLayout, dirArray.slice(0, i).join(path.sep), fileName);
      if (fs.existsSync(tempPath)) {
        layoutFile = tempPath;
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
      }
    };
  }
};

module.exports = VM;
