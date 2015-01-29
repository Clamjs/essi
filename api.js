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
      fsLib.chmod(confDir, 0777);
    }

    if (!fsLib.existsSync(confFile)) {
      fsLib.writeFileSync(confFile, JSON.stringify(this.param, null, 2), {encoding: "utf-8"});
      fsLib.chmod(confFile, 0777);
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
        fsLib.chmod(this.cacheDir, 0777);
      }
    }
  }
  else {
    this.param = Helper.merge(true, this.param, param || {});
  }

  this.param.traceRule = new RegExp(this.param.traceRule, 'i');
};
ESSI.prototype = {
  constructor: ESSI,
  compile: function (realpath, content, cb) {
    var local = new Local(realpath, this.param.rootdir, this.param.remote, this.param.traceRule);

    // 保证content是String型，非Buffer
    if (content && Buffer.isBuffer(content)) {
      content = Helper.decode(content);
    }

    var isJuicer = this.param.juicer || (fsLib.existsSync(realpath) && fsLib.statSync(realpath).isDirectory());
    if (content) {
      content = local.parse(content, isJuicer);
    }
    else {
      content = local.fetch(isJuicer);
    }

    if (content === false) {
      cb(302);
    }
    else {
      content = Helper.customReplace(content, this.param.replaces);

      // 抓取远程页面
      var self = this;
      var remote = new Remote(content, this.cacheDir, this.param.hosts, this.param.traceRule);
      remote.fetch(function (content) {
        if (!content) {
          content = Helper.readFileInUTF8(realpath);
        }

        content = Helper.customReplace(content, self.param.replaces);

        var assetsTool = new AssetsTool(realpath, content, self.param);
        content = assetsTool.action();

        content = Helper.customReplace(content, self.param.replaces);
        content = Helper.strip(content);

        cb(200, Helper.encode(content, self.param.charset));
      });
    }
  },
  handle: function (req, res, next) {
    if (("Request " + req.url).match(this.param.traceRule)) {
      Helper.Log.request(req.url);
    }

    var self = this;
    this.compile(Helper.realPath(req.url, this.param.rootdir), null, function (code, content) {
      if (code == 302) {
        res.writeHead(302, {
          "Location": req.url + '/'
        });
        res.end();
      }
      else {
        res.writeHead(200, {
          "Access-Control-Allow-Origin": '*',
          "Content-Type": "text/html; charset=" + self.param.charset,
          "X-MiddleWare": "essi"
        });
        res.write(content);
        res.end();

        try {
          next();
        }
        catch (e) {
          console.log(e);
        }
      }

      if (("Response " + req.url).match(self.param.traceRule)) {
        Helper.Log.response(req.url + " [Code] " + code + "\n");
      }
    });
  }
};

exports = module.exports = ESSI;