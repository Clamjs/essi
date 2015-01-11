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

exports.gulp = function(param, dir) {
  var through = require("through2");

  return through.obj(function (file, enc, cb) {
    var self = this;

    if (file.isNull()) {
      self.emit('error', 'isNull');
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      self.emit('error', 'Streaming not supported');
      cb(null, file);
      return;
    }

    var essi = new ESSI(param, dir);
    essi.compile(
      file.path,
      (typeof param.enable == "undefined" || param.enable) ? null : file.contents.toString(),
      function(content) {
        var str = content.toString();
        if (!param.strictPage || str.match(/<html[^>]*?>([\s\S]*?)<\/html>/gi)) {
          file.contents = content;
          self.push(file);
          cb();
        }
        else {
          return cb();
        }
      }
    );
  });
};