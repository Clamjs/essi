var fs         = require("fs");
var path       = require("path");
var url        = require("url");
var velocity   = require("velocity");
var VmEngine   = velocity.Engine;
var VmData     = velocity.Data;
var VmParser  = require("velocity").parser;
var beautifyJS = require("js-beautify").js_beautify;
var mkdirp     = require("mkdirp");
var merge      = require("merge");
var Helper     = require("./helper");


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
      result += "function( args){return args }";
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

var changeObj = function(obj){

  if(typeof obj == "object"){


    if (obj instanceof(Array)) {

      var len = obj.length;
      for(var i= 0; i<len; i++){

        obj[i] = changeObj(obj[i]);

      }
      return obj;

    }else if (obj.type == "fun"){

      var fun = function(){
        return obj.__value__;
      };

      fun.__value__ = obj.__value__;
      fun.rtn = obj.rtn;

      return fun;

    }else{

      var __value__ = obj.__value__;
      var isHasOtherKey = false;

      for(var i in obj){

        if(i == '__name__' || i == '__value__'){
          delete  obj[i]
        }else{
          isHasOtherKey = true;

          obj[i] = changeObj(obj[i])

        }

      }

      if(!isHasOtherKey){

        return changeObj(__value__);

      }

      return obj;

    }


  }else{
    return obj;
  }

};

var specialChartReplace = function(str){

  return str.replace(/([\^\$\.\*\+\-\?\=\!\:\|\\\/\(\)\[\]\{\}])/g,"\\$1") //特殊字符处理
      .replace(/\s+/g, '\\s*').replace(/\n/g, '');  //避免格式化后不匹配

};

var simplifyRegStr = function(str){

  var tempStr = str;
  tempStr = tempStr.replace(/\?|\:|(\\s)|(\n)|\(|\)|\*|\./g,"");
  if(tempStr.length<=0){
    return '.*?';
  }else{
    return str;
  }

}

var fixedReg = function(str){

  return str.replace(/(\(\(\?\:\.\*\?\(\?\:\.\*\n\)\*\?\)\))((?:\(\(\?\:\.\*\?\(\?\:\.\*\n\)\*\?\)\))+)/, function($0,$1,$2){

    return $1 + $2.replace(/(\(\(\?\:\.\*\?\(\?\:\.\*\)\*\?\)\))/g, "")

  }).replace(/\.\*\?\(\?\:\.\*\n\)\*\?/g, function(){
      return ".*?"
  });

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

var createReg = function(ast,level){
  var type = ast.type;
  var fun = createRegFun[type];

  level = (level||0);
  fun = (fun || createRegFun["__default"]);
  return fun(ast, level);
};

var createRegFun = {
  Statements: function (ast, level) {
    var regStr = "";
    for (var i = 0; i < ast.body.length; i++) {
      var tempAct = ast.body[i];
      //regStr += "("+(createReg(tempAct, level+1)||".*(?:.*\n)*")+")";

      var tempReg = (createReg(tempAct, level+1)||".*?")
      if(level<1){
        regStr += "("+tempReg+")";
      }else{
        regStr += ""+tempReg+"";
      }

      tempAct.reg = tempReg;
    }
    if(level<1){
      regStr = ""+regStr+"";
    }else{
      regStr = "(?:"+simplifyRegStr(regStr)+")";
    }
    return regStr;
  },
  Foreach: function(ast, level){

    var regStr = "";

    var body = ast.body;

    var preFixed = (level<1?"":"?:");

    regStr = simplifyRegStr(createReg(body, level+1)||".*?");

    if(level<1){
      regStr = ""+regStr+"";

    }else{
      regStr = "(?:"+simplifyRegStr(regStr)+")";

    }

    var bodyRegStr='';

    if(body){
      bodyRegStr = "("+preFixed+  regStr +")*";
    }


    if(level<1){
      //regStr = "("+bodyRegStr+")";
    }else{
      //regStr = "(?:"+bodyRegStr+")";
      bodyRegStr = "(?:.*?)";
    }

    ast.reg = regStr;

    return bodyRegStr;

  },

  If: function(ast, level){

    var regStr = "";

    var consequentAst = ast.consequent;
    var alternateAst =ast.alternate;
    var testAst = ast.test;


    var consequentRegStr = "";
    var alternateRegStr = "" ;
    var testRegStr;

    var preFixed = (level<1?"":"?:")

    /*
    if(testAst){
      testRegStr = "("+preFixed+(createReg(testAst, level+1)||".*(?:.*\n)*")+")";
    }
    */

    if(consequentAst){
      consequentRegStr = "("+preFixed+(createReg(consequentAst, level+1)||".*?")+")";

    }

    if(alternateAst){
      alternateRegStr = "("+preFixed+(createReg(alternateAst, level+1)||".*?")+")";

    }


    if(alternateRegStr.length>0){
      regStr = consequentRegStr+"|"+alternateRegStr;

    }else{
      regStr = consequentRegStr;

    }

    if(level<1){
      regStr = ""+regStr+"";
    }else{
      //regStr = "(?:"+simplifyRegStr(regStr)+")";

      regStr = "(?:.*?)";
    }

    ast.reg = regStr;

    return regStr;

  },
  Text: function (ast, level) {
    var regStr = specialChartReplace(ast.value||"");
    if(level<1){
      regStr = "("+regStr+")";
    }else{
      regStr = "(?:"+simplifyRegStr(regStr)+")";

    }

    ast.reg = regStr;

    return regStr;
  },
  __default: function (ast, level) {
    var object = ast.object;
    var regStr = ".*?";
    //var regStr = ".*";



    if(level<1){
      if (object) {
        regStr =  createReg(object, level+1);
      }

      regStr = "("+regStr+")";
    }else{
      regStr = "(?:"+simplifyRegStr(regStr)+")";
    }

    ast.reg = regStr;

    return regStr;
  }

}

/**
 * 将vm模板经过parse后的结果生成json数据结构
 */
var transferToken = function (token, data, currData, text) {

  if(!text){
    return;
  }
  var type = token.type;
  var transferFun = transfer[type];
  transferFun = (transferFun || transfer["__default"]);

  var regString = createReg(token);
  regString = fixedReg(regString);

  /*
  var testReg = new RegExp(regString);
  var regResult = text.match(testReg);
  */

  return transferFun(token, data, currData, text);
};

/**
 * 针对不同的token类型做不同的处理
 */

var getTextRange = function(array, index, textLength){

  var start, end;

  for(var i = index-1; i>=0; i--){

    if(array[i].end){
      start = array[i].end;
      break;
    }
  }

  if(index == 0){
    start = 0;
  }

  for(var i= index+1; i<array.length; i++){

    if(array[i].start){
      end = array[i].start;
      break;
    }

  }


  if(index == array.length-1){
    end = textLength;
  }



  return {
    start:start,
    end : end
  }
}

var transfer = {
  Statements: function (token, data, currData, originext) {
    var text = originext;
    var startIndex = 0;
    //var regString = createReg(token);
    for (var i = 0; i < token.body.length; i++) {
      var tempToken = token.body[i];
      var tempRegString = tempToken.reg;
      if(/[^\?\:\\s\*\(\)\.n]/.test(tempRegString)){
        var testReg = new RegExp(tempRegString);
        var regResult = text.match(testReg);
        var matchString = (regResult && regResult[0])||"";
        tempToken.matchString = matchString;
        var start = text.indexOf(matchString);
        if(start>=0 && (matchString.length>0||tempToken.type == "Text")){
          var end = start+matchString.length;
          tempToken.start = startIndex + start;
          tempToken.end = startIndex+end;
          text = text.substr(end);
          startIndex += end;
        }
      }else if(tempToken.type=='Text'){

        token.body.splice(i,1);
        i--;
      }
    }
    for (var i = 0; i < token.body.length; i++) {
      var tempToken = token.body[i];

      var tempText = tempToken.matchString;

      if(!tempText){

        var range = getTextRange(token.body, i, originext.length);

        tempText = originext.substr(range.start || 0, range.end-range.start || 0);

      }

      console.info(tempText);
      transferToken(tempToken, data, currData, tempText);
    }
  },
  Text: function () {
  },
  Reference: function (token, data, currData, text) {
    var object = token.object;
    return transferToken(object, data, data, text);
  },
  Identifier: function (token, data, currData, text) {
    var obj = (data[token.name] || {__name__: token.name, __value__: text});
    data[token.name] = obj;
    return obj;
  },
  Index: function (token, data, currData, text) {
    var object = token.object;
    var newObj = transferToken(object, data, currData, text);

    var property = token.property;
    transferToken(property, data, newObj, text);
    return newObj;
  },
  Method: function (token, data, currData, text) {
    var callee = token.callee;
    var newFun = {fun: "newFun"};
    var newObj = transferToken(callee, data, currData, text);
    //newObj = newFun;
    newObj.type = "fun";
    newObj.rtn = (newObj.return || {});

    var arguments = token.arguments;
    for (var i = 0; i < arguments.length; i++) {
      transferToken(arguments[i], data, newObj, text);
    }
    newObj.arguments = arguments;
    return newObj.rtn;
  },
  If: function (token, data, currData, text) {
    var test = token.test;
    var newObj = transferToken(test, data, currData, "");

    var consequent = token.consequent;
    consequent && transferToken(consequent, data, currData, text);

    var alternate = token.alternate;
    alternate && transferToken(alternate, data, currData, text);
  },
  BinaryExpr: function (token, data, currData, text) {
    var left = token.left;
    var newObj = transferToken(left, data, currData, text);

    var right = token.right;
    transferToken(right, data, currData, text);
  },
  AssignExpr: function (token, data, currData, text) {
    //var left = token.left;
    //var newObj = transferToken(left, data, currData);
    //transferToken(token.right, data, currData);
  },
  Foreach: function (token, data, currData, text) {

    var regString = createReg(token);
    var testReg = new RegExp(regString);
    var regResult = text.match(testReg);

    var right = token.right;
    var rightObj = transferToken(right, data, currData, " ");

    while(regResult[1]) {

      //需要不断创建新的leftobj以便绑定数据。
      var left = token.left;
      var leftObj = transferToken(left, data, currData, " ");



      var body = token.body;
      transferToken(body, data, currData, regResult[1]);

      if (leftObj && leftObj.__name__) {
        delete data[leftObj.__name__];
      }

      if (rightObj && rightObj.__name__) {
        var rightName = rightObj.__name__;

        rightObj['__value__'] = (rightObj['__value__'] instanceof(Array)?rightObj['__value__']:[]);

        //data[rightName] = (data[rightName] instanceof(Array)?data[rightName]:[]);
        rightObj['__value__'].push(leftObj);
        //data[rightName].__name__ = rightName;
      }else{
        rightObj.__result__ = rightObj.__result__||[];
        rightObj.__result__.push(leftObj);
      }

      var tpl = regResult[0];
      var tempTpl = regResult[1];
      tpl = tpl.replace(tempTpl,"");

      regResult = tpl.match(testReg);
    }
  },
  DString: function (token, data, currData, text) {
    //currData[token.value] = "";
    //return currData;
  },
  Integer: function (token, data, currData, text) {
    //currData[token.value] = 0;
    //return currData;
  },
  Prop: function (token, data, currData, text) {
    var obj = {__value__: text, __name__: token.name};
    currData[token.name] = obj;
    return obj;
  },
  Property: function (token, data, currData, text) {
    var object = token.object;
    var newObj = transferToken(object, data, currData, text);

    var property = token.property;
    var propertyObj = transferToken(property, data, newObj, text);
    return propertyObj;
  },
  __default: function (token, data, currData, text) {
    var object = token.object;
    if (object) {
      return transferToken(object, data, currData, text);
    }
  }
};


function VM(param, trace) {
  if (String.prototype.getURI != "function") {
    String.prototype.getURI = function (p) {
      return url.resolve(this.stripColors || this.toString(), p);
    };
  }

  this.RT                = param.rootdir;
  this.layout            = param.layout;
  this.screenPlaceholder = param.screenPlaceholder;
  this.trace             = trace;

  this.context = {};

  this.vmControl = null;
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
      splits.pop();
      var root       = splits.join(path.sep + "screen" + path.sep);
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

      var layoutContent = this.getLayoutVm(realPath);
      if (layoutContent) {
        content = this.beginTag + content + this.endTag + layoutContent;
      }
    }

    content = this.macroAdapter(content);

    var dataFilePath = realPath + ".mock";
    if (true || fs.existsSync(realPath) && !fs.existsSync(dataFilePath)) {
      var vmdata = new VmData({
        data: true,
        template: content.replace(new RegExp("#parse|#include|#stop|#evaluate|#define|#macro|\\$\!?\{?" + this.screenPlaceholder + "|\\$\!?\{?control|\\$\!?\{?dateUtil|\\$\!?\{?moneyUtil|\\$\!?\{?securityUtil|\\$\!?\{?gsonUtils", 'g'), ''),
        macro: this.macroContent
      });

      //通过html取得数据
      try{
        //console.info(tempAst);
        var htmlPath =  realPath + ".html";
        var htmlContent, dataObj;
        if (fs.existsSync(htmlPath)) {
          var htmlContent = fs.readFileSync(htmlPath,{encoding: "utf-8"});

          if(htmlContent){
            var tempAst = VmParser.parse(originContent);
            var regString = createReg(tempAst);

            regString = fixedReg(regString);

            var testReg = new RegExp(regString);

            htmlContent = htmlContent.replace(/\n/g,' ');
            //var regResult = htmlContent.match(testReg);
            //console.info(regResult);

            var newData = {};
            transferToken(tempAst, newData, newData, htmlContent);
            newData = clear(newData);

            var dataObj = changeObj(newData);
            //console.info(print(newData));
          }
        }
        //console.info(htmlContent);

      }catch(e){
        console.log(e);
      }
      var dataContent;
      if(!dataObj){
        dataContent = "module.exports = " + vmdata.extract().str + ';';
        dataContent     = beautifyJS(dataContent, {indent_size: 2});
      }else{
        var tempData = merge.recursive(true,vmdata.extract().raw, dataObj);
        var dataContent = "module.exports = " + print(tempData) + ';';
        dataContent     = beautifyJS(dataContent, {indent_size: 2});
        //dataContent     = beautifyJS(dataContent, {indent_size: 2});

      }

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
  getLayoutVm: function (realPath) {
    var layoutFile = path.join(this.vmLayout, this.layout || "default.vm");
    var fileName   = path.basename(realPath);
    var dirArray   = path.dirname(realPath.replace(this.vmScreen, '')).split(path.sep);

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
      var ctx = merge.recursive(true, this.setUtils(true), ENV);
      if (typeof ENV._ == "function") {
        ctx = merge.recursive(true, ctx, ENV._(ctx) || {});
      }
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
