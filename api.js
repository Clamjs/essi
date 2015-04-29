var pathLib = require("path");
var fsLib = require("fs");
var urlLib = require("url");
var util = require("util");
var merge = require("merge");
var mkdirp = require("mkdirp");
var fetch = require("fetch-agent");
var J = require("juicer");
var HTML = require("js-beautify").html;
var Stack = require("plug-trace").stack;

var Juicer = require("./lib/juicer");
var Remote = require("./lib/remote");
var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");

function ESSI(param, confFile) {
  this.cacheDir = null;

  this.param = merge(true, require("./lib/param"));
  param = param || {};

  this.trace = new Stack(require(__dirname + "/package.json").name);

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
  if (this.param.cache && !fsLib.existsSync(this.cacheDir)) {
    mkdirp(this.cacheDir, function (e, dir) {
      fsLib.chmod(dir, 0777);
    });
  }
};
ESSI.prototype = {
  constructor: ESSI,
  compile: function (realpath, content, assetsFlag, cb) {
    var local = new Juicer(this.param, this.trace);

    // 保证content是String型，非Buffer
    if (content && Buffer.isBuffer(content)) {
      content = Helper.decode(content);
    }

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

    if (content) {
      content = local.parse(content, realpath, isJuicer, true);
    }
    else {
      content = local.fetch(realpath, isJuicer);
    }

    if (content === false) {
      cb({code: "Not Found"});
    }
    else {
      content = Helper.customReplace(content, this.param.replaces);

      // 抓取远程页面
      var remote = new Remote(content, this.param, this.trace, this.cacheDir);
      remote.fetch(function (content) {
        if (!content) {
          content = Helper.readFileInUTF8(realpath);
        }

        content = Helper.customReplace(content, this.param.replaces);

        var assetsTool = new AssetsTool(realpath, content, this.param);
        content = assetsTool.action(assetsFlag);

        content = Helper.customReplace(content, this.param.replaces);

        if (this.param.native2ascii) {
          content = Helper.encodeHtml(content);
        }

        var pass = false;
        var ignorePretty = this.param.ignorePretty;
        if (util.isArray(ignorePretty)) {
          pass = ignorePretty.some(function (i) {
            return new RegExp(i).test(realpath);
          });
        }
        else if (typeof ignorePretty == "boolean") {
          pass = ignorePretty;
        }

        if (!pass) {
          content = HTML(content, {
            indent_char: ' ',
            indent_size: 2,
            indent_inner_html: true,
            unformatted: ["code", "pre", "em", "strong", "span"]
          });
        }

        cb(null, Helper.encode(content, this.param.charset));

        this.trace.response(realpath);
      }.bind(this));
    }
  },
  getRealPath: function (_url) {
    var _filter = this.param.filter || {};
    var jsonstr = JSON.stringify(_filter).replace(/\\{2}/g, '\\');
    var filter = [];
    jsonstr.replace(/[\{\,]"([^"]*?)"/g, function (all, key) {
      filter.push(key);
    });

    var regx, ori_url;
    for (var k = 0, len = filter.length; k < len; k++) {
      regx = new RegExp(filter[k]);
      if (regx.test(_url)) {
        ori_url = _url;
        _url = _url.replace(regx, _filter[filter[k]]);
        this.trace.filter(regx, ori_url, _url);
      }
    }

    _url = urlLib.parse(_url).pathname;
    return pathLib.join(this.param.rootdir, _url);
  },
  handle: function (req, res, next) {
    var HOST = (req.connection.encrypted ? "https" : "http") + "://" + (req.hostname || req.host || req.headers.host);
    this.trace.request(HOST, req.url);

    var Header = {
      "Access-Control-Allow-Origin": '*',
      "Content-Type": "text/html; charset=" + this.param.charset,
      "X-MiddleWare": "essi"
    };
    var realPath = this.getRealPath(req.url);

    if (fsLib.existsSync(realPath)) {
      var state = fsLib.statSync(realPath);
      if (state && state.isFile()) {
        this.compile(realPath, null, false, function (err, buff) {
          if (!err) {
            res.writeHead(200, Header);
            res.write(buff);
            res.end();
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
      fetch.pipe(req, this.param.hosts, function (err, buff, nsres) {
        var errorTPL = Helper.readFileInUTF8(pathLib.join(__dirname, "www/error.tpl"));

        if (err) {
          res.writeHead(500, Header);
          res.write(J(errorTPL, {
            url: req.url,
            code: 500,
            reason: err.code
          }));
          this.trace.error(req.url, err.code);
        }
        else if (nsres.statusCode) {
          if (nsres.statusCode == 302) {
            res.writeHead(302, {
              "Location": nsres.headers.location
            });
          }
          else {
            res.writeHead(nsres.statusCode, Header);
            if (nsres.statusCode == 404) {
              res.write(J(errorTPL, {
                url: realPath,
                code: 404,
                reason: "Not Found"
              }));
              this.trace.error(realPath, "404 Not Found");
            }
            else {
              res.write(buff);
            }
          }
        }
        res.end();
        this.trace.response(HOST + req.url);
      }.bind(this));
    }
  }
};

exports = module.exports = ESSI;
