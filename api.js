var pathLib = require("path");
var fsLib = require("fs");
var urlLib = require("url");
var util = require("util");
var merge = require("merge");
var mkdirp = require("mkdirp");
var J = require("juicer");
var Stack = require("plug-trace").stack;

var Juicer = require("./lib/juicer");
var VM = require("./lib/vm");
var Remote = require("./lib/remote");
var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");

function ESSI(param, confFile) {
  this.cacheDir = null;

  this.param = merge(true, require("./lib/param"));
  param = param || {};

  var pkgName = require(__dirname + "/package.json").name;
  this.trace = new Stack(pkgName);

  var confJSON = {};
  if (confFile) {
    this.cacheDir = pathLib.join(pathLib.dirname(confFile), "../.cache");

    if (!fsLib.existsSync(confFile)) {
      fsLib.writeFileSync(confFile, JSON.stringify(this.param, null, 2), {encoding: "utf-8"});
      fsLib.chmod(confFile, 0777);
    }

    try {
      confJSON = require(confFile);
      delete require.cache[confFile];

      param.hosts = merge.recursive(param.hosts, confJSON.hosts || {});
    }
    catch (e) {
      this.trace.error("Can't require config file!", "IO");
      confJSON = {};
    }
  }

  this.param = merge.recursive(true, this.param, confJSON, param);

  // Magic Variable
  var key;
  for (var i in this.param) {
    key = "__" + i + "__";
    if (typeof this.param[i] == "string" && !this.param.replaces[key]) {
      this.param.replaces[key] = this.param[i];
    }
  }

  var rootdir = this.param.rootdir || "src";
  if (rootdir.indexOf('/') == 0 || /^\w{1}:[\\/].*$/.test(rootdir)) {
    this.param.rootdir = rootdir;
  }
  else {
    this.param.rootdir = pathLib.normalize(pathLib.join(process.cwd(), rootdir));
  }

  if (!this.cacheDir) {
    this.cacheDir = pathLib.join(this.param.rootdir, "../.cache");
  }
  this.cacheDir = pathLib.join(this.cacheDir, pkgName);
  if (this.param.cache && !fsLib.existsSync(this.cacheDir)) {
    mkdirp(this.cacheDir, function (e, dir) {
      fsLib.chmod(dir, 0777);
      fsLib.chmod(this.cacheDir, 0777);
    }.bind(this));
  }
}
ESSI.prototype = {
  constructor: ESSI,
  compile: function (realpath, content, cb) {
    var assetsFlag = (content === null ? false : true);

    // 保证content是String型，非Buffer
    if (content && Buffer.isBuffer(content)) {
      content = Helper.decode(content);
    }

    var isVM = /\.vm$/.test(realpath);
    if (isVM) {
      var vm = new VM(this.param, this.trace);
      if (!content) {
        content = Helper.readFileInUTF8(realpath);
      }

      content = vm.render(content, realpath);
      cb(null, Helper.encode(content, this.param.charset));
    }
    else {
      var dirname = urlLib.resolve(
        this.param.cdnPath + '/',
        pathLib.dirname(pathLib.join(this.param.version, realpath.replace(this.param.rootdir, '')))
      );
      this.param.replaces["__fullPath__"] = dirname;

      this.trace.info(this.param.replaces, "Magic Variables");

      var isJuicer = true;
      var ignoreJuicer = this.param.ignoreJuicer;
      if (util.isArray(ignoreJuicer)) {
        isJuicer = ignoreJuicer.every(function (i) {
          return !new RegExp(i).test(realpath);
        });
      }
      else if (typeof ignoreJuicer == "boolean") {
        isJuicer = !ignoreJuicer;
      }

      var local = new Juicer(this.param, this.trace);
      if (content) {
        content = content.replace(/\$\{random\(\)\}/g, '');
        content = local.parse(content, realpath, isJuicer, true);
      }
      else {
        content = local.fetch(realpath, isJuicer);
      }

      content = Helper.customReplace(content, this.param.replaces);
      // 抓取远程页面
      var remote = new Remote(content, this.param, this.trace, this.cacheDir);
      remote.fetch(function (content) {
        if (!content) {
          content = Helper.readFileInUTF8(realpath);
        }

        content = Helper.customReplace(content, this.param.replaces);
        var assetsTool = new AssetsTool(realpath, this.param, assetsFlag);
        content = assetsTool.action(content, true);
        content = Helper.customReplace(content, this.param.replaces);

        if (this.param.native2ascii) {
          content = Helper.encodeHtml(content);
        }
        content = content.replace(/^[\n\r]{1,}|[\n\r]{1,}$/g, '');

        cb(null, Helper.encode(content, this.param.charset));
      }.bind(this));
    }
  },
  getRealPath: function (_url) {
    _url = urlLib.parse(_url).pathname;
    var _filter = this.param.filter || {};
    var jsonstr = JSON.stringify(_filter).replace(/\\{2}/g, '\\');
    var filter = [];
    jsonstr.replace(/[\{\,]"([^"]*?)"/g, function (all, key) {
      filter.push(key);
    });

    var regx, ori_url;
    for (var k = 0, len = filter.length; k < len; k++) {
      regx = new RegExp(filter[k], 'g');
      if (regx.test(_url)) {
        ori_url = _url;
        _url = _url.replace(regx, _filter[filter[k]]);
        this.trace.filter(regx, ori_url, _url);
      }
    }

    _url = urlLib.parse(_url).pathname;
    var realPath = pathLib.join(this.param.rootdir, _url);
    var vmRealPath = realPath.replace(/_(\w)/g, function (total, word) {
      return word.toUpperCase();
    });

    var isExistsVM = fsLib.existsSync(vmRealPath);
    if (fsLib.existsSync(realPath) || isExistsVM) {
      return isExistsVM ? vmRealPath : realPath;
    }
    else {
      return null;
    }
  },
  handle: function (req, res, next) {
    var matching = this.param.supportedFile;
    if (matching.length && !new RegExp(matching.join('|')).test(req.url)) {
      next();
    }
    else {
      var HOST = (req.connection.encrypted ? "https" : "http") + "://" + (req.hostname || req.host || req.headers.host);
      this.trace.request(HOST, req.url);

      var Header = {
        "Access-Control-Allow-Origin": '*',
        "Content-Type": "text/html; charset=" + this.param.charset,
        "X-MiddleWare": "essi"
      };

      var realPath = this.getRealPath(req.url);
      if (realPath) {
        var state = fsLib.statSync(realPath);
        if (state && state.isFile()) {
          this.compile(realPath, null, function (err, buff) {
            if (!err) {
              res.writeHead(200, Header);
              res.write(buff);
              res.end();
              this.trace.response(realPath, buff);
            }
            else {
              this.trace.error(realPath, err.code);
              next();
            }
          }.bind(this));
        }
        else {
          next();
        }
      }
      else {
        var errorTPL = Helper.readFileInUTF8(pathLib.join(__dirname, "www/error.tpl"));
        res.write(J(errorTPL, {
          url: realPath,
          code: 404,
          reason: "Not Found"
        }));
        res.end();

        this.trace.error(realPath, "404 Not Found");
        this.trace.response(HOST + req.url);
      }
    }
  }
};

exports = module.exports = ESSI;
