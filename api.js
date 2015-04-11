var pathLib = require("path");
var urlLib = require("url");
var fsLib = require("fs");
var util = require("util");
var merge = require("merge");
var mkdirp = require("mkdirp");
var fetch = require("fetch-agent");
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
        mkdirp.sync(this.cacheDir);
        fsLib.chmod(this.cacheDir, 0777);
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

    isJuicer = isJuicer || fsLib.existsSync(realpath);
    if (content) {
      content = local.parse(content, realpath, isJuicer, true);
    }
    else {
      content = local.fetch(realpath, isJuicer);
    }

    if (content === false) {
      cb();
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

        cb(Helper.encode(content, this.param.charset));
      }.bind(this));
    }
  },
  handle: function (req, res, next) {
    if (("Request " + req.url).match(this.param.traceRule)) {
      Helper.Log.request(req.url);
    }

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
      if (("Response " + realPath).match(this.param.traceRule)) {
        Helper.Log.response(realPath + "\n");
      }

      var state = fsLib.statSync(realPath);
      if (state && state.isFile()) {
        this.compile(realPath, null, false, function (content) {
          if (typeof content != "undefined") {
            res.writeHead(200, Header);
            res.write(content);
            res.end();
          }

          try {
            next();
          }
          catch (e) {
            console.log(e);
          }
        }.bind(this));
      }
      else {
        next();
      }
    }
    else {
      fetch.pipe(req, this.param.hosts, function(err, buff, nsres) {
        if (err) {
          res.writeHead(404, Header);
          res.write("<h1 style='color: #e60000'>404 Not Found!</h1><h2>" + realPath + "</h2>");

          if (("Response " + realPath).match(this.param.traceRule)) {
            Helper.Log.error("  <= " + realPath + "\n");
          }
        }
        else {
          var location;
          if (nsres.statusCode == 302) {
            location = nsres.headers.location;
            res.writeHead(302, {
              "Location": location
            });
          }
          else {
            location = req.url;
            res.writeHead(nsres.statusCode, Header);
            res.write(buff);
          }

          if (("Response " + location).match(this.param.traceRule)) {
            Helper.Log.response(location + "\n");
          }
        }
        res.end();
      }.bind(this));
    }
  }
};

exports = module.exports = ESSI;
