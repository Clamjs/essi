var pathLib = require("path");
var fsLib = require("fs");

var Local = require("./lib/local");
var Remote = require("./lib/remote");
var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");

function ESSI(param, dir) {
  this.param = Helper.clone(require("./lib/param"));
  this.cacheDir = null;

  if (dir) {
    var confFile = pathLib.join(process.cwd(), dir || ".config", pathLib.basename(__dirname) + ".json");
    var confDir = pathLib.dirname(confFile);

    if (!fsLib.existsSync(confDir)) {
      Helper.mkdirPSync(confDir);
    }

    if (!fsLib.existsSync(confFile)) {
      fsLib.writeFileSync(confFile, JSON.stringify(this.param, null, 2), {encoding: "utf-8"});
    }

    var confJSON = {};
    try {
      confJSON = JSON.parse(fsLib.readFileSync(confFile));
    }
    catch (e) {
      Helper.Log.error("Params Error!");
      confJSON = {};
    }

    this.param = Helper.merge(true, this.param, confJSON, param || {});

    if (this.param.cache) {
      this.cacheDir = pathLib.join(confDir, "../.cache");
      if (!fsLib.existsSync(this.cacheDir)) {
        Helper.mkdirPSync(this.cacheDir);
      }
    }
  }
  else {
    this.param = Helper.merge(true, this.param, param || {});
  }
};
ESSI.prototype = {
  constructor: ESSI,
  uniform: function (content, realpath, cb) {
    if (!content) {
      content = Helper.readFileInUTF8(realpath);
    }

    content = Helper.customReplace(content, this.param.replaces);

    var assetsTool = new AssetsTool(realpath, content, this.param);
    content = assetsTool.action();

    content = Helper.customReplace(content, this.param.replaces);
    content = Helper.strip(content);

    cb(Helper.encode(content, this.param.charset));
  },
  compile: function (realpath, content, cb) {
    var local = new Local(realpath, this.param.rootdir, this.param.remote);

    // 保证content是String型，非Buffer
    if (content && Buffer.isBuffer(content)) {
      content = Helper.decode(content);
    }

    if (
      typeof this.param.enable != "undefined" && !this.param.enable &&      // 引擎不生效
      fsLib.existsSync(realpath) && fsLib.statSync(realpath).isFile()       // 是文件
    ) {
      this.uniform(content, realpath, cb);
    }
    else {
      if (content) {
        content = local.parse(content);
      }
      else {
        content = local.fetch();
      }

      // 替换用户定义标记，支持正则（抓取远程前）
      content = Helper.customReplace(content, this.param.replaces);

      // 抓取远程页面
      var self = this;
      var remote = new Remote(content, this.cacheDir, this.param.hosts);
      remote.fetch(function (content) {
        self.uniform(content, realpath, cb);
      });
    }
  },
  handle: function (req, res, next) {
    Helper.Log.request(req.url);

    var charset = this.param.charset;
    var realpath = Helper.realPath(req.url, this.param.rootdir);

    this.compile(realpath, null, function (content) {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": '*',
        "Content-Type": "text/html; charset=" + charset,
        "X-MiddleWare": "essi"
      });
      res.write(content);
      res.end();

      Helper.Log.response(req.url + "\n");

      try {
        next();
      }
      catch (e) {
        console.log(e);
      }
    });
  }
};

exports = module.exports = ESSI;