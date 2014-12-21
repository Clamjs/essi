var urlLib = require("url");
var pathLib = require("path");
var fsLib = require("fs");
var utilLib = require("mace")(module);

var isUtf8 = require("is-utf8");
var iconv = require("iconv-lite");

var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");
var Local = require("./lib/local");
var Remote = require("./lib/remote");

var Log = (function () {
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
      utilLib.error(input);
    },
    local: function (url, input) {
      typing("Local", url, input);
    },
    engine: function (url, input) {
      typing("Engine", url, input);
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

/**
 * ESSI类
 */
function ESSI(param, dir) {
  var moduleName = pathLib.basename(__dirname);

  this.param = require("./lib/param");

  if (dir && (/^\//.test(dir) || /^\w{1}:\\.*$/.test(dir))) {
    this.confFile = pathLib.join(dir, "config.json");
  }
  else {
    this.confFile = pathLib.join(process.cwd(), dir || ('.' + moduleName), moduleName + ".json");
  }

  var confDir = pathLib.dirname(this.confFile);
  if (!fsLib.existsSync(confDir)) {
    utilLib.mkdirPSync(confDir);
  }

  if (!fsLib.existsSync(this.confFile)) {
    fsLib.writeFileSync(this.confFile, JSON.stringify(this.param, null, 2), {encoding: "utf-8"});
  }

  var conf = JSON.parse(fsLib.readFileSync(this.confFile));
  this.param = utilLib.merge(true, this.param, conf, param || {});

  this.cacheDir = pathLib.join(confDir, "cache");
  if (!fsLib.existsSync(this.cacheDir)) {
    utilLib.mkdirPSync(this.cacheDir);
  }
};
ESSI.prototype = {
  constructor: ESSI,
  config: function (param) {
    this.param = utilLib.merge(true, this.param, param || {});
  },
  handle: function(req, res, next) {
    var _url = urlLib.parse(req.url).pathname;
    Log.request(req.url);

    var realpath = Helper.matchVirtual(_url, this.param.rootdir, this.param.virtual);
    var todo = Helper.preAction(realpath);
    if (todo.method) {
      Log[todo.log](todo.content+"\n");
      res[todo.method].apply(this, todo.args);
    }
    else {
      var local = new Local(_url, this.param.rootdir, this.param.virtual, this.param.remote);
      var content = local.fetch(realpath);

      // 替换用户定义标记，支持正则
      content = Helper.customReplace(content, this.param.replaces);

      // 抓取远程页面
      var remote = new Remote(content, this.param.hosts);
      remote.fetch(function (content) {
        //var assetsTool = new AssetsTool();
        //console.log(assetsTool)
        //content = iconv.encode(assetsTool.action(content, false), this.param.charset);
        // TODO assetsTool
        res.send(content);

        Log.response(req.url+"\n");
        try {
          next();
        }
        catch (e) {
        }
      });
    }
  }
};

exports = module.exports = ESSI;
