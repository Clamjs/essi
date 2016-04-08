/**
 * 主入口
 * 通过require("essi")
 * */
var ESSI = require("./api");
var trace = require("plug-trace");

var pkg = require(__dirname + "/package.json");

function init_config(dir) {
  var pathLib = require("path");
  var fsLib = require("fs");
  var mkdirp = require("mkdirp");

  if (dir) {
    var confDir, confFile, json = pkg.name + ".json";
    if (dir.indexOf('/') == 0 || /^\w{1}:[\\/].*$/.test(dir)) {
      if (/\.json$/.test(dir)) {
        confFile = dir;
        confDir = pathLib.dirname(confFile);
      }
      else {
        confDir = dir;
        confFile = pathLib.join(confDir, json);
      }
    }
    else {
      confDir = pathLib.join(process.cwd(), dir);
      confFile = pathLib.join(confDir, json);
    }

    if (!fsLib.existsSync(confDir)) {
      mkdirp.sync(confDir);
      fsLib.chmod(confDir, 0777);
    }

    return confFile;
  }
  else {
    return null;
  }
}

exports = module.exports = function (param, dir) {
  var confFile = init_config(dir);

  process.on(pkg.name, function (data) {
    console.log("\n=== Served by %s ===", trace.chalk.white(pkg.name));
    trace(data);
  });

  return function () {
    var essiInst = new ESSI(param, confFile);

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
      if (req && res && !res._header && next) {
        if (/\.vm|\.htm/.test(req.url)) {
          essiInst.handle(req, res, next);
        }
        else {
          next();
        }
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

exports.name = pkg.name;
exports.config = require("./lib/param");
exports.gulp = function (param, dir) {
  param.livereload = false;

  var through = require("through2");
  var Helper = require("./lib/helper");
  var confFile = init_config(dir);

  process
    .removeAllListeners(pkg.name)
    .on(pkg.name, function (data) {
      trace(data, "error");
    });

  return through.obj(function (file, enc, cb) {
    var essiInst = new ESSI(param, confFile);

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

    essiInst.compile(
      file.path,
      file.contents,
      function (err, str) {
        if (!param.strictPage || /<html[^>]*?>([\s\S]*?)<\/html>/gi.test(str)) {
          file.contents = Helper.encode(str, param.charset);
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
exports.engine = exports.gulp;