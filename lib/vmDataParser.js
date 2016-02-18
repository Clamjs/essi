
/**
 * 将json转成字符串输出
 */

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
                    if(obj[i].type != "fun"){
                        obj[i] = changeObj(obj[i])

                    }else{
                        delete obj[i];
                    }

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
            }else if(tempToken.type=='Text'|| tempToken.type=='AssignExpr'){

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

            //console.info(tempText);
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

var cleanObj = function(obj){
    if(typeof obj == "object") {
        for (var i in obj) {
            cleanObj(obj[i]);
            var temp = obj[i];
            if(temp ===null || temp ===undefined ||  Object.getOwnPropertyNames(temp).length<=0){
                delete obj[i];
            }
        }
    }
}

module.exports = function(token, text){
    var newData = {};

    transferToken(token, newData, newData, text);
    newData = clear(newData);
    var dataObj = changeObj(newData);
    cleanObj(dataObj);
    return dataObj;

};
