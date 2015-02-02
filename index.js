/**
 * 主入口
 * 通过require("essi")
 * */
var ESSI = require("./api");

exports = module.exports = function (param, dir) {
  return function () {
    var essiInst = new ESSI(param, dir);

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
      console.log(e);
    }
  }
};

exports.gulp = function (param, dir) {
  var through = require("through2");

  return through.obj(function (file, enc, cb) {
    var self = this;

    if (file.isNull()) {
      self.emit("error", "isNull");
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      self.emit("error", "Streaming not supported");
      cb(null, file);
      return;
    }

    var essiInst = new ESSI(param, dir);
    essiInst.compile(
      file.path,
      file.contents,
      true,
      function(code, buff) {
        var str = buff.toString();
        if (!param.strictPage || str.match(/<html[^>]*?>([\s\S]*?)<\/html>/gi)) {
          file.contents = buff;
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