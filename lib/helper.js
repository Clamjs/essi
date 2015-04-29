var iconv = require("iconv-lite");

exports.JSON_parse = function (vars) {
  vars = vars.replace(/(^\s*)|(\s*$)/g, '');
  return new Function("return " + vars + ';')();
};
exports.customReplace = function (content, replaces) {
  replaces = replaces || {};
  for (var regx in replaces) {
    content = content.replace(new RegExp(regx, 'g'), replaces[regx]);
  }
  return content;
};

exports.encode = function (content, charset) {
  return iconv.encode(content, charset);
};
exports.decode = function (buff) {
  var isUtf8 = require("is-utf8");
  return isUtf8(buff) ? buff.toString() : iconv.decode(buff, "gbk");
};
exports.readFileInUTF8 = function (fullpath) {
  var fsLib = require("fs");
  return exports.decode(fsLib.readFileSync(fullpath));
};

exports.unique = function (Q) {
  var u = {}, a = [];
  for (var i = 0, l = Q.length; i < l; ++i) {
    if (u.hasOwnProperty(Q[i])) {
      continue;
    }
    a.push(Q[i]);
    u[Q[i]] = 1;
  }

  if (a.length == 1 && !a[0]) {
    return [];
  }
  return a;
};

exports.MD5 = function (str) {
  var crypto = require("crypto");
  return crypto.createHash("md5").update(str).digest("hex");
};

exports.encodeHtml = function (s) {
  var ignoreArr = [
    " ", "/", "'", '"', "-", "!", "?",
    "\n", "\r", "\t", "|", "y", "z",
    ".", ",", "#", "&", "(", ")",
    "$", "~", "{", "}", "+", "*"
  ];

  return (typeof s != "string") ? s :
    s.replace(
      /[^x00-xff]/g,
      function (item) {
        if (ignoreArr.indexOf(item) != -1) {
          return item;
        }

        var c = item.charCodeAt(0), ca = ["&#"];
        c = (c == 0x20) ? 0xA0 : c;
        ca.push(c, ';');
        return ca.join('');
      }
    );
};
