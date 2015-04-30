/**
 * Created by suyoubi on 15/4/29.
 */
var VmEngine = require('velocity').Engine;
var VmData = require('velocity').Data;
var VmParser = require('velocity').parser;
var beautifyJS = require('js-beautify').js_beautify;
var fsLib = require("fs");
var merge = require("merge");
var Helper = require("./helper");
var path = require("path");




/*
* 将json转成字符串输出
* */
var print = function (a) {
  var result = "";
  if (typeof a == "object") {

    if (a instanceof(Array)) {
      result += "[";
      var index = 0;
      for (var i = 0; i < a.length; i++) {

        if (index > 0) {
          result += ","
        }
        result += print(a[i]);
        index++;
      }
      result += "]";
    } else if(a.type == "fun"){
      //对于function的输出
      var args = "";

      for(var i =0; i< a.arguments.length; i++){
        var arg = a.arguments[i];
        if(i!=0){
          args += ','
        }
        args += arg.type+''+i;
      }

      result += 'function('+args+'){ return ' +print(a.rtn)+ '}'

    }else {
      result += "{";
      var index = 0;
      for (var i in a) {
        if( i == '__name__'){
          continue;
        }
        if (index > 0) {
          result += ","
        }
        result += '"' + i + '":' + print(a[i]);
        index++;
      }
      result += "}";
    }
  } else {
    result += '"' + (a&&a.toString()) + '"';
  }

  return result
}

/*
将vm模板经过parse后的结果生成json数据结构
 */
var transferToken = function (token, data, currData) {
  var type = token.type;
  var transferFun = transfer[type];
  transferFun = (transferFun || transfer["__default"]);
  return transferFun(token, data, currData);

};

/*
针对不同的token类型做不同的处理
 */
var transfer = {
  Statements: function (token, data, currData) {
    for (var i = 0; i < token.body.length; i++) {
      var tempToken = token.body[i];
      transferToken(tempToken, data, currData);
    }
  }
  , Text: function () {
  }
  , Reference: function (token, data, currData) {
    var object = token.object;
    return transferToken(object, data, data);
  }
  , Identifier: function (token, data, currData) {
    var obj = (data[token.name] || {__name__: token.name});
    data[token.name] = obj;
    return obj;
  }
  , Index: function (token, data, currData) {
    var object = token.object;
    var newObj = transferToken(object, data, currData);

    var property = token.property;
    transferToken(property, data, newObj);
    return newObj;
  }
  , Method: function (token, data, currData) {
    var callee = token.callee;
    var newFun = {fun: "newFun"};
    var newObj = transferToken(callee, data, currData);
    //newObj = newFun;
    newObj.type = "fun";
    newObj.rtn = (newObj.return || {});

    var arguments = token.arguments;
    for(var i = 0; i < arguments.length; i++){
      transferToken(arguments[i], data, newObj);
    }
    newObj.arguments = arguments;
    return newObj.rtn;
  }
  , If: function (token, data, currData) {
    var test = token.test;
    var newObj = transferToken(test, data, currData);

    var consequent = token.consequent;
    transferToken(consequent, data, currData);
  }
  , BinaryExpr: function (token, data, currData) {
    var left = token.left;
    var newObj = transferToken(left, data, currData);

    var right = token.right;
    transferToken(right, data, currData);
  }
  , AssignExpr: function (token, data, currData) {
    var left = token.left;
    var newObj = transferToken(left, data, currData);

    var right = token.right;
    transferToken(right, data, currData);
  }
  , Foreach: function (token, data, currData) {
    var left = token.left;
    var leftObj = transferToken(left, data, currData);

    var right = token.right;
    var rightObj = transferToken(right, data, currData);
    //rightObj = [];

    var body = token.body;
    transferToken(body, data, currData);

    var rightName = rightObj.__name__;
    var leftName = leftObj.__name__;
    data[rightName] = []
    data[rightName].push(leftObj);
    data[rightName].__name__ = rightName;

    delete data[leftName];
    //leftObj = null;

  }
  , DString: function (token, data, currData) {
    //currData[token.value] = "";
    //return currData;
  }
  , Integer: function (token, data, currData) {
    //currData[token.value] = 0;
    //return currData;
  }
  , Prop: function (token, data, currData) {
    var obj = {};
    currData[token.name] = obj;
    return obj;
  }
  , Property: function (token, data, currData) {
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
}

var VM = {
  config:{},
  setConfig:function(config){
    //rootdir
    this.config = merge.recursive(true, this.config, config);
    this.vmControl = this.config.rootdir+"/control/";
    this.vmLayout = this.config.rootdir+"/layout/";
    this.vmScreen = this.config.rootdir+"/screen/";


  },
  compile:function(realPath, content, contextData){
    var result = content;

    if(!/\.vm$/.test(realPath)){
      return result;
    }

    var dataFilePath = realPath.replace(/\.vm$/,'.vm.mock');
    var context = {};

    var layoutContent = this.getLayoutVm(realPath);
    layoutContent && (content = layoutContent.replace('$screen_placeholder', content));

    if(!fsLib.existsSync(dataFilePath)){
      var ast = VmParser.parse(content);

      var data={}

      transferToken(ast, data, data);

      delete data.control;

      var dataContent = 'module.exports ='+print(data);

      dataContent = beautifyJS(dataContent, { indent_size: 2 });

      try{
        fsLib.writeFileSync(dataFilePath, dataContent, {encoding: "utf-8"});
        fsLib.chmod(dataFilePath, 0777);
      }catch(e){

      }
    }
    //可能创建数据文件失败
    try {
      context = require(dataFilePath) || {};
      delete require.cache[dataFilePath];
    }catch(e){
      context = {};
    }
    this.setUtils(context);

    var engine = new VmEngine({
      template: content
    });

    context = merge(context, contextData);
    result = engine.render(context);

    return result;
  },
  getLayoutVm : function(realPath){
    var layoutVm = '', dir, dirArray=[], fileName, layoutDir = "";

    if((new RegExp("^"+this.vmScreen)).test(realPath)){

      var layoutFile = this.vmLayout + "/default.vm";
      dir = path.dirname(realPath.replace(this.vmScreen,''));
      fileName = path.basename(realPath);
      dirArray = dir.split(path.sep);

      //dir递增寻找layout
      for(var i = dirArray.length-1;i>=0;i--){
        var tempPath = this.vmLayout + path.join.apply(null,dirArray.slice(0,i)) + "/" + fileName;

        if(fsLib.existsSync(tempPath)){
          layoutFile = tempPath;
        }

      }

    }

    if(layoutFile && fsLib.existsSync(layoutFile)){
      layoutVm = Helper.readFileInUTF8(layoutFile);
    }

    return layoutVm;
  },

  //设置工具函数
  setUtils:function(context){
    var _this = this;

    var control = {

      setTemplate: function(vmPath){

        var realPath = _this.vmControl+vmPath;
        var content = "can't find " + realPath;
        if(fsLib.existsSync(realPath)) {
          var content = Helper.readFileInUTF8(realPath);
        }
        this.vm = content;
        this.realPath = realPath;
        return this;

      },
      toString: function(){
        var result = _this.compile(this.realPath, this.vm, this.__temp)
        return result;
      },
      __temp: {},
      setParameter: function(key, value){
        this.__temp[key] = value;
        return this;
      }
    };
    context.control = control;
  }

};
module.exports = VM;
