var pathLib = require("path");
var urlLib = require("url");
var fsLib = require("fs");
var util = require("util");
var merge = require("merge");
var mkdirp = require("mkdirp");
var fetch = require("fetch-agent");
var J = require("juicer");
var HTML = require("js-beautify").html;

var Juicer = require("./lib/juicer");
var Remote = require("./lib/remote");
var AssetsTool = require("./lib/assetsTool");
var Helper = require("./lib/helper");

function ESSI(param, dir) {
  this.param = merge(true, require("./lib/param"));
  this.cacheDir = null;

  if (dir) {
    var confFile = pathLib.join(process.cwd(), dir || ".config", pathLib.basename(__dirname) + ".json");
    var confDir = pathLib.dirname(confFile);

    if (!fsLib.existsSync(confDir)) {
      mkdirp.sync(confDir);
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

    this.param = merge.recursive(true, this.param, confJSON, param || {});

    // Magic Variable
    var key;
    for (var i in this.param) {
      key = "__" + i + "__";
      if (typeof this.param[i] == "string" && !this.param.replaces[key]) {
        this.param.replaces[key] = this.param[i];
      }
    }

    if (this.param.cache) {
      this.cacheDir = pathLib.join(confDir, "../.cache");
      if (!fsLib.existsSync(this.cacheDir)) {
        mkdirp(this.cacheDir, function (e, dir) {
          fsLib.chmod(dir, 0777);
        });
      }
    }
  }
  else {
    this.param = merge.recursive(true, this.param, param || {});
  }

  this.param.traceRule = new RegExp(this.param.traceRule, 'i');
};
ESSI.prototype = {
  constructor: ESSI,
  compile: function (realpath, content, assetsFlag, cb) {
    var local = new Juicer(this.param);

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
      var remote = new Remote(content, this.param, this.cacheDir);
      remote.fetch(function (content) {
        if (!content) {
          content = Helper.readFileInUTF8(realpath);
        }

        content = Helper.customReplace(content, this.param.replaces);

        var assetsTool = new AssetsTool(realpath, content, this.param);
        content = assetsTool.action(assetsFlag);

        content = Helper.customReplace(content, this.param.replaces);

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
            unformatted: ['code', 'pre', 'em', 'strong', 'span']
          });
        }

        cb(null, Helper.encode(content, this.param.charset));
      }.bind(this));
    }
  },
  handle: function (req, res, next) {
    var Header = {
      "Access-Control-Allow-Origin": '*',
      "Content-Type": "text/html; charset=" + this.param.charset,
      "X-MiddleWare": "essi"
    };

    var realPath = Helper.realPath(
      Helper.filteredUrl(urlLib.parse(req.url).pathname, this.param.filter, this.param.traceRule),
      this.param.rootdir
    );
    if (fsLib.existsSync(realPath)) {
      var state = fsLib.statSync(realPath);
      if (state && state.isFile()) {
        if (("Request " + req.url).match(this.param.traceRule)) {
          Helper.Log.request(req.url);
        }

        this.compile(realPath, null, false, function (err, buff) {
          if (!err) {
            res.writeHead(200, Header);
            res.write(buff);
            res.end();

            if (("Response " + realPath).match(this.param.traceRule)) {
              Helper.Log.response(realPath + "\n");
            }
          }
          else {
            Helper.Log.error("  <= " + realPath + ' ' + err.code + "!\n");
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
          Helper.Log.error(req.url + ' ' + err.code + "!\n");
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
              Helper.Log.error(realPath + " Not Found!\n");
            }
            else {
              res.write(buff);
            }
          }
        }
        res.end();
      }.bind(this));
    }
  }
};

exports = module.exports = ESSI;
