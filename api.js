var pathLib = require("path");
var fsLib = require("fs");

var Local = require("./lib/local");
var Remote = require("./lib/remote");
var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");

/**
 * ESSI类
 */
function ESSI(param, dir) {
  var moduleName = pathLib.basename(__dirname);

  this.confFile = pathLib.join(process.cwd(), dir || ('.' + moduleName), moduleName + ".json");

  var confDir = pathLib.dirname(this.confFile);
  if (!fsLib.existsSync(confDir)) {
    Helper.mkdirPSync(confDir);
  }

  if (fsLib.existsSync(this.confFile)) {
    this.param = {};
  }
  else {
    this.param = require("./lib/param");
    fsLib.writeFileSync(this.confFile, JSON.stringify(this.param, null, 2), {encoding: "utf-8"});
  }

  var conf = JSON.parse(fsLib.readFileSync(this.confFile));
  this.param = Helper.merge(true, this.param, conf, param || {});

  this.cacheDir = pathLib.join(confDir, "cache");
  if (!fsLib.existsSync(this.cacheDir)) {
    Helper.mkdirPSync(this.cacheDir);
  }
};
ESSI.prototype = {
  constructor: ESSI,
  compile: function (realpath, content, cb) {
    var assetsTool = new AssetsTool(realpath, this.param);

    if (content) {
      content = assetsTool.action(content);
      content = Helper.customReplace(content, this.param.replaces);
      content = Helper.strip(content);
      content = Helper.encode(content, this.param.charset);
      cb(content);
    }
    else {
      var local = new Local(realpath, this.param.rootdir, this.param.virtual, this.param.remote);
      content = local.fetch();

      // 替换用户定义标记，支持正则，抓取远程[前]
      content = Helper.customReplace(content, this.param.replaces);

      // 抓取远程页面
      var self = this;
      var remote = new Remote(content, this.cacheDir, this.param.hosts);
      remote.fetch(function (content) {
        content = assetsTool.action(content);

        // 替换用户定义标记，支持正则，抓取远程[后]
        content = Helper.customReplace(content, self.param.replaces);
        content = Helper.strip(content);

        // convert
        content = Helper.encode(content, self.param.charset);

        cb(content);
      });
    }
  },
  handle: function(req, res, next) {
    Helper.Log.request(req.url);

    var charset  = this.param.charset;
    var realpath = Helper.realPath(req.url, this.param.rootdir);
    var content  = null;

    if (
      typeof this.param.engine != "undefined" && !this.param.engine &&      // 不用引擎
      fsLib.existsSync(realpath) && fsLib.statSync(realpath).isFile()       // 是文件
    ) {
      content = Helper.readFileInUTF8(realpath);
    }

    this.compile(realpath, content, function(content) {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": '*',
        "Content-Type": "text/html; charset=" + charset,
        "X-MiddleWare": "essi"
      });
      res.write(content);
      res.end();

      Helper.Log.response(req.url+"\n");

      try {
        next();
      }
      catch (e) {}
    });
  }
};

exports = module.exports = ESSI;
