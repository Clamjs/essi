/**
 * 主入口
 * 通过require("essi")
 * */
var ESSI = require("./api");
var pathLib = require("path");

exports = module.exports = function (param, dir) {
  if (!dir) {
    var userHome = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH; // 兼容Windows
    dir = pathLib.join(userHome, ".essi");
  }

  var essiInst;

  return function () {
    essiInst = new ESSI(param, dir);

    var req, res, next;
    switch (arguments.length) {
      case 1:
        req = this.req;
        res = this.res;
        next = arguments[0];
        break;
      case 3:
        req = arguments[0];
        res = arguments[1];
        next = arguments[2];
        break;
      default:
        next = function () {
          console.log("Unknown Web Container!");
        };
    }

    try {
      if (req && res && next) {
        essiInst.handle(req, res, next);
      }
      else {
        next();
      }
    }
    catch (e) {
      next();
    }
  }
};

exports.gulp = function(param, dir, type, regx) {
  var through = require("through2");

  var REGX = {
    elements: /<link[^>]*?rel\s{0,}=\s{0,}(["'])\s{0,}(import)\s{0,}\1[^>]*?>/gi,
    demo: /<html[^>]*?>([\s\S]*?)<\/html>/gi
  };

  return through.obj(function (file, enc, cb) {
    var self = this;

    if (file.isNull()) {
      self.push(file);
      return cb();
    }

    if (file.isStream()) {
      self.emit('error', new gutil.PluginError(PLUGIN_NAME, 'Streaming not supported'));
      return cb();
    }

    var essi = new ESSI(param, dir);
    essi.compile(file.path.replace(new RegExp(".*\/"+param.rootdir+"(\/.+$)"), "$1"), function(content) {
      var str = content.toString();
      if (str.match(regx||REGX[type])) {
        file.contents = content;
        self.push(file);
        cb();
      }
      else {
        return cb();
      }
    });
  });
};