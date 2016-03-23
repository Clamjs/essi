var fs         = require("fs");
var path       = require("path");
var url        = require("url");
var velocity   = require("velocity");
var VmEngine   = velocity.Engine;
var VmData     = velocity.Data;

var VmParser   = velocity.parser;
var beautifyJS = require("js-beautify").js_beautify;
var mkdirp     = require("mkdirp");
var merge      = require("merge");
var Helper     = require("./helper");
var vmDataParse = require("./vmDataParser")


/**
 * 将json转成字符串输出
 */
var print = function (a) {
  var result = '';

  if (typeof a == "object" || typeof a == "function") {
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
    else if (a.type == "fun" || typeof a == "function") {
      //对于function的输出
      var args = '';
      /*
      a.arguments = (a.arguments|| []);
      for (var i = 0; i < a.arguments.length; i++) {
        var arg = a.arguments[i];
        if (i != 0) {
          args += ',';
        }
        args += arg.type + '' + i;
      }
      */


      //result += "function(" + args + "){return " + print(a.__value__) + '}';
      //result += "function( args){return args }";

      if(a.rtn && a.rtn.__result__){
        //result += "function(){return " + print(changeObj(a.rtn.__result__)) + '}';

      }else{
        //result += "function( args){return args }";

      }
      result += a.toString();
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



function VM(param, trace) {
  if (String.prototype.getURI != "function") {
    String.prototype.getURI = function (p) {
      return url.resolve(this.stripColors || this.toString(), p);
    };
  }

  this.RT                = param.rootdir;
  this.screenPlaceholder = param.screenPlaceholder;
  this.trace             = trace;

  if (typeof param.layout == "object") {
    this.layout = param.layout;
  }
  else {
    this.layout = {".+": param.layout || "default.vm"};
  }

  this.context = {};

  this.vmControl = path.join(this.RT, "templates/control", path.sep);
  this.vmLayout  = null;
  this.vmScreen  = null;

  this.rootList     = [];
  this.macroContent = '';

  this.beginTag = "<!-- ESSI Screen Begin at " + new Date().valueOf() + "\n";
  this.endTag   = "\nESSI Screen End -->";
}
VM.prototype = {
  constructor: VM,
  macroAdapter: function (content) {
    return content.replace(/#noescape\(\)/gm, "#@noescape()");
  },
  getENV: function (realPath) {
    var ENV  = {};
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

    return ENV;
  },
  render: function (content, realPath, vars) {
    if (!content) {
      return content;
    }

    vars = vars || {};

    var ENV = this.getENV(realPath);

    this.macroContent = Helper.readFileInUTF8(__dirname + "/macro.vm");

    var macroPath = realPath.replace(/[\/\\]templates[\/\\].+/, "/templates/env.mcr");
    if (fs.existsSync(macroPath)) {
      this.macroContent += "\n" + Helper.readFileInUTF8(macroPath);
    }
    else {
      fs.writeFile(macroPath, '', function () {
        fs.chmod(macroPath, 0777);
      });
    }


    content = this.macroAdapter(content);

    var originContent = content;

    var rootList = [path.dirname(realPath), this.RT];
    var splits   = realPath.split(/[\/\\]screen[\/\\]/);
    if (splits.length > 1) {
      var root       = splits[0];
      this.vmControl = path.join(root, "control", path.sep);
      this.vmLayout  = path.join(root, "layout", path.sep);
      this.vmScreen  = path.join(root, "screen", path.sep);
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

      this.rootList = rootList;

      var ast = VmParser.parse(content);

      var sets = (ast.body || []).filter(function (item) {
        return item.type == "AssignExpr";
      });
      var screenSet = {};
      sets.map(function (node) {
        if (node.right.value) {
          screenSet[node.left.object.name] = node.right.value;
        }
      });

      var defines = (ast.body || []).filter(function (item) {
        return item.type == "Define";
      });

      var layoutContent = this.getLayoutVm(realPath, screenSet, defines.map(function (node) {
        return node.name.object.name;
      }));

      if (layoutContent) {
        content = this.beginTag + content + this.endTag + layoutContent;
      }
    }

    content = this.macroAdapter(content);

    var dataFilePath = realPath + ".mock";

    //通过html取得数据
    try{
      var htmlPath =  realPath + ".html";
      var noCreateSign = '<!-- not create html Data-->';
      var htmlContent, htmlDataObj;
      if (fs.existsSync(htmlPath) ) {
        var htmlContent = fs.readFileSync(htmlPath,{encoding: "utf-8"});

        if(htmlContent && (htmlContent.indexOf(noCreateSign)<0||!fs.existsSync(dataFilePath))){
          var tempAst = VmParser.parse(originContent);

          var newHtmlContent = htmlContent.replace(/\n/g,' ');

          htmlDataObj = vmDataParse(tempAst, newHtmlContent);

          fs.writeFileSync(htmlPath, noCreateSign+'\n'+htmlContent)
        }
      }else{
        //生成空的html文件
        fs.writeFileSync(htmlPath, "", {encoding: "utf-8"});
        fs.chmod(htmlPath, 0777);
      }

    }catch(e){
      console.log("parse html err",e);
    }

    //通过模板生成数据结构
    var vmdata = null;
    if (fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      vmdata = new VmData({
        data: true,
        template: content.replace(new RegExp("#parse|#include|#stop|#evaluate|#macro|\\$\!?\{?" + this.screenPlaceholder + "|\\$\!?\{?control|\\$\!?\{?dateUtil|\\$\!?\{?moneyUtil|\\$\!?\{?securityUtil|\\$\!?\{?gsonUtils", 'g'), ''),
        macro: this.macroContent
      });
    }

    var dataContent;

    //合并数据文件   html数据 和 vm数据
    if(htmlDataObj && vmdata){

      var tempData = merge.recursive(true,vmdata.extract().raw, htmlDataObj);
      var dataContent = "module.exports = " + print(tempData) + ';';
      dataContent     = beautifyJS(dataContent, {indent_size: 2});
    }else if(!htmlDataObj && vmdata){
      dataContent = "module.exports = " + vmdata.extract().str + ';';
      dataContent     = beautifyJS(dataContent, {indent_size: 2});
    }else if(htmlDataObj && !vmdata){
      try {
        var context = require(dataFilePath) || {};
        delete require.cache[dataFilePath];
      }
      catch (e) {
        var context = {};
      }

      var tempData = merge.recursive(true, context, htmlDataObj);
      var dataContent = "module.exports = " + print(tempData) + ';';
      dataContent     = beautifyJS(dataContent, {indent_size: 2});
    }

    //输出数据mock文件
    if(dataContent){
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
      root: this.rootList,
      macro: this.macroContent,
      encoding: Helper.getCharset(realPath)
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
        result = result.replace('$' + this.screenPlaceholder, screen_placeholder);
      }

      return result;
    }
    catch (e) {
      this.trace.error(e, "Velocity");
    }
    return result;
  },
  getLayoutVm: function (realPath, sets, defines) {
    var fileName   = path.basename(realPath);
    var dirArray   = path.dirname(realPath.replace(this.vmScreen, '')).split(path.sep);

    var layout = "default.vm";
    for (var i in this.layout) {
      var reg = new RegExp(i);
      if (reg.test(realPath)) {
        layout = this.layout[i];
        break;
      }
    }
    var layoutFile = path.join(this.vmLayout, layout);

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
      var engine = new VmEngine({
        template: this.macroAdapter(Helper.readFileInUTF8(layoutFile)),
        root: this.rootList,
        macro: this.macroContent,
        encoding: Helper.getCharset(layoutFile)
      });

      var ENV = this.getENV(layoutFile);
      var ctx = merge.recursive(true, this.setUtils(true), ENV, sets);
      if (typeof ENV._ == "function") {
        ctx = merge.recursive(true, ctx, ENV._(ctx) || {});
      }
      ctx[this.screenPlaceholder] = '$' + this.screenPlaceholder;
      (defines || []).forEach(function (def) {
        ctx[def] = '$' + def;
      });
      return engine.render(ctx);
    }
    else {
      return '';
    }
  },
  setUtils: function (isLayout) {
    var _this    = this;
    var realPath = '';
    var vars     = {};
    var context  = {};

    context.control = {
      setTemplate: function (vmPath) {
        vars     = {};
        realPath = _this.vmControl + vmPath.replace(/\?.+/, '');
        return this;
      },
      setParameter: function (key, value) {
        vars[key] = value;
        return this;
      },
      toString: function () {
        if (realPath && fs.existsSync(realPath) && fs.lstatSync(realPath).isFile()) {
          if (isLayout) {
            var assignExpr = '';
            for (var name in vars) {
              assignExpr += "#set($" + name + "=\"" + vars[name] + "\")";
            }
            return assignExpr + Helper.readFileInUTF8(realPath);
          }
          else {
            return _this.render(Helper.readFileInUTF8(realPath), realPath, vars);
          }
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
        return JSON.stringify(obj, null, 2);
      },
      toString: function (obj) {
        return JSON.stringify(obj);
      }
    };

    return context;
  }
};

module.exports = VM;
