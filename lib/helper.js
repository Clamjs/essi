var fs = require("fs");
var path = require("path");
var urlLib = require("url");
var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");
var crypto = require("crypto");
var merge = require("merge");
var utilLib = require("mace")(module);

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

exports.filteredUrl = function (_url, filter, traceRule) {
  filter = filter || {};
  var regx;
  var ori_url;
  for (var fk in filter) {
    regx = new RegExp(fk);
    if (_url.match(regx)) {
      ori_url = _url;
      _url = _url.replace(regx, filter[fk]);
      if (("Filter " + ori_url + _url).match(traceRule)) {
        utilLib.logue("%s %s " + ori_url + " => %s", "[Filter]", regx, _url);
      }
    }
  }
  return _url;
};
exports.realPath = function (_url, param) {
  _url = exports.filteredUrl(urlLib.parse(_url).pathname, param.filter, param.traceRule);
  _url = urlLib.parse(_url).pathname;
  return path.join(param.rootdir, _url);
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
  return crypto.createHash("md5").update(str).digest("hex");
};

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
      opt = merge.recursive(true, {
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
