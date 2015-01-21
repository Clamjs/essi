var fs = require("fs");
var path = require("path");
var urlLib = require("url");
var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");
var utilLib = require("mace")(module);

exports.realPath = function (_url, root) {
  _url = urlLib.parse(_url).pathname;
  return path.join(process.cwd(), root || "src", _url);
};
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

exports.encode = function(content, charset) {
  return iconv.encode(content, charset);
};
exports.decode = function (buff) {
  return isUtf8(buff) ? buff.toString() : iconv.decode(buff, "gbk");
};
exports.readFileInUTF8 = function(fullpath) {
  return exports.decode(fs.readFileSync(fullpath));
};
exports.strip = function(content) {
  content = content.replace(/<\!\-\-^#.*\-\->/g, '');
  content = content.replace(/\s{0,}[\r\n]{1,}/g, "\n");
  return content;
};

exports.merge = utilLib.merge;
exports.MD5 = utilLib.MD5;
exports.mkdirPSync = utilLib.mkdirPSync;
exports.joinBuffer = utilLib.joinBuffer;
exports.clone = utilLib.clone;

exports.Log = (function () {
  var colors = {
    bold: [ 1, 22 ],
    italic: [ 3, 23 ],
    underline: [ 4, 24 ],
    inverse: [ 7, 27 ],
    white: [ 37, 39 ],
    grey: [ 89, 39 ],
    black: [ 30, 39 ],
    blue: [ 34, 39 ],
    cyan: [ 36, 39 ],
    green: [ 32, 39 ],
    magenta: [ 35, 39 ],
    red: [ 31, 39 ],
    yellow: [ 33, 39 ]
  };

  function colorFull (color, str, style, wrap) {
    var prefix = '\x1B[';

    return [
      wrap ? '·'+new Array(10-str.length).join(' ') : '',
      style ? (prefix + style[0] + 'm') : '',
      prefix, color[0], 'm',

      str,
      prefix, color[1], 'm',
      style ? (prefix + style[1] + 'm') : '',
      wrap ? ' ' : ''
    ].join('');
  }

  function typing(type, url, input) {
    utilLib.logue("%s " + url + " %s %s", '[' + type + ']', "<=", input);
  }

  return {
    request: function (input) {
      utilLib.info("=> %a", input);
    },
    response: function (input) {
      utilLib.done("<= %s\n", input);
    },
    warn: function (input, reason) {
      utilLib.logue("%s " + input + " %s", "[Warn]", reason || "Exception");
    },
    error: function (input) {
      utilLib.logue("%s %s", colorFull(colors.red, "[Error]", colors.inverse), colorFull(colors.red, input));
    },
    process: function (type, input) {
      utilLib.logue("%s "+input, '[' + type + ']');
    },
    local: function (url, input) {
      typing("Local", url, input);
    },
    cache: function (url, input) {
      typing("Cache", url, input);
    },
    remote: function (url, opt) {
      opt = utilLib.merge(true, {
        protocol: "http:",
        host: "127.0.0.1",
        path: "/fake",
        port: 80,
        headers: {
          host: "localhost"
        }
      }, opt);
      typing("Remote", url, opt.protocol + "//" + opt.headers.host + ':' + opt.port + opt.path + " (IP:" + opt.host + ')');
    }
  }
})();
