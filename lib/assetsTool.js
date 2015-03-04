var urlLib = require("url");
var pathLib = require("path");
var Helper = require("./helper");

function AssetsTool(realpath, content, param) {
  this.fakePath = "http://fake_host/";
  this.content = content;

  this.cdnPath = null;
  if (param.cdnPath) {
    var prepath = param.cdnPath.replace(/([^\/])$/, "$1/");
    var version = param.version ? (param.version + '/') : '';
    this.cdnPath = urlLib.resolve(prepath, version);
  }

  this.from = realpath.replace(pathLib.join(process.cwd(), param.rootdir || "src", '/'), this.fakePath);

  this.css = param.css;
  this.js = param.js;

  this.scripts = {
    top: {},
    bottom: {}
  };
  this.styles = {
    top: {},
    bottom: {}
  };
}
AssetsTool.prototype = {
  constructor: AssetsTool,
  pushList: function (tag, path, type) {
    function uniqid() {
      var time = new Date().getTime();
      while (time == new Date().getTime());
      return new Date().getTime().toString(36);
    }

    var fepos = tag.match(/\sfe\-move=(["'])([^"']*?)\1/);
    var pos = (fepos && fepos[2]) ? fepos[2] : null;

    var fegroup = tag.match(/\sfe\-group=(["'])([^"']*?)\1/);

    var urlObj = urlLib.parse(path);
    var key = this.fakePath;
    if (urlObj.host) {
      key = "//" + urlObj.host;
    }

    if (pos && ["top", "bottom"].indexOf(pos) != -1) {
      var group = (fegroup && fegroup[2]) ? fegroup[2] : uniqid();

      if (!this[type][pos][group]) {
        this[type][pos][group] = {};
      }

      if (!this[type][pos][group][key]) {
        this[type][pos][group][key] = [];
      }
      this[type][pos][group][key].push(urlObj.path);
      return '';
    }
    else if (fegroup) {
      var token = "_ESSI_TAG_" + fegroup[2] + '_';
      if (!this[type][token]) {
        this[type][token] = {};
      }
      if (!this[type][token][token]) {
        this[type][token][token] = {};
      }
      if (!this[type][token][token][key]) {
        this[type][token][token][key] = [];
      }

      this[type][token][token][key].push(urlObj.path);
      return token;
    }
    else {
      return tag;
    }
  },
  extractScripts: function () {
    this.content = this.content.replace(/<script[^>]*? src=(['"])([^"']*?)\1.*?>[\s\S]*?<\/script>/g, (function (all, $1, path) {
      return this.pushList(all, path, "scripts");
    }).bind(this));
  },
  extractStyles: function () {
    this.content = this.content.replace(/<link[^>]*? href=(['"])([^"']*?)\1.*>/g, (function (all, $1, path) {
      if (/type=(['"])text\/css\1/.test(all) || /rel=(['"])stylesheet\1/.test(all)) {
        return this.pushList(all, path, "styles");
      }
      else {
        return all;
      }
    }).bind(this));
  },
  getURL: function (lists) {
    function getReg(path) {
      var reg = path.split('');
      var len = reg.length;
      for (var i = 0; i < len; i++) {
        if (['.', '/', '?', ':'].indexOf(reg[i]) != -1) {
          reg[i] = "\\" + reg[i];
        }
      }

      return new RegExp('^(' + reg.join("?)(") + "?)");
    }

    var arr;
    for (var key in lists) {
      arr = lists[key];
      if (arr.length > 1) {
        var reg = getReg(arr[0]);
        var matched = '';
        arr.sort(function (a, b) {
          if (!reg) {
            reg = getReg(a);
          }

          var mm = b.match(reg);
          if (mm) {
            var tmp = ''
            for (var i = 1; i < mm.length; i++) {
              if (mm[i]) {
                tmp += mm[i];
              }
              else {
                break;
              }
            }

            if (!matched || tmp.length < matched.length) {
              matched = tmp;
            }
            if (matched) {
              reg = getReg(matched);
            }
          }
          return 0;
        });

        if (matched && !matched.match(/\/$/)) {
          if (matched.match(/\//)) {
            matched = pathLib.join(matched, "../");
          }
          else {
            matched = '';
          }
        }

        if (matched) {
          for (var i = 0; i < arr.length; i++) {
            arr[i] = arr[i].replace(matched, '');
          }
        }

        arr = Helper.unique(arr);
        if (arr.length) {
          lists[key] = matched + "??" + arr.join(',');
        }
        else {
          lists[key] = matched;
        }
      }
      else if (arr.length) {
        lists[key] = arr[0];
      }
      else {
        delete lists[key];
      }
    }
    return lists;
  },
  placeAssets: function (pos, type) {
    var assets = this[type][pos] || [];
    var assetPaths;
    var assetTags = [];

    var tagPS = {
      scripts: ['<script type="text/javascript" charset="utf-8" src="', '"></script>'],
      styles: ['<link type="text/css" rel="stylesheet" href="', '">']
    };

    for (var group in assets) {
      assetPaths = this.getURL(assets[group]);
      for (var host in assetPaths) {
        assetTags.push(
          tagPS[type][0] + (host.replace(this.fakePath, '') + assetPaths[host]) + tagPS[type][1]
        );
      }
    }

    if (assetTags.length) {
      var tag = assetTags.join("\n");

      if (pos == "top") {
        if (/<\/head>/.test(this.content)) {
          this.content = this.content.replace(/<\/head>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content = tag + "\n" + this.content;
        }
      }
      else if (pos == "bottom") {
        if (/<\/body>/.test(this.content)) {
          this.content = this.content.replace(/<\/body>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content += "\n" + tag;
        }
      }
      else {
        this.content = this.content.replace(new RegExp(pos, "g"), (function (i) {
          return function () {
            return (i++) ? '' : tag;
          };
        })(0));
      }
    }
  },
  combo: function () {
    this.extractScripts();
    this.extractStyles();

    for (var asset in this.styles) {
      this.placeAssets(asset, "styles");
    }
    for (var asset in this.scripts) {
      this.placeAssets(asset, "scripts");
    }
  },
  action: function (assetsFlag) {
    function urlResolve($0, $1, $2, $3, $4) {
      var scriptRegx = /(^<script)\s{1,}/i;
      var charsetRegx = /charset=/i;
      if (scriptRegx.test($1) && !(charsetRegx.test($1) || charsetRegx.test($4))) {
        $1 = $1.replace(scriptRegx, function(all, tag) {
          return tag + ' charset="utf-8" ';
        });
      }

      if (!/^https?:\/\/|^\/\//.test($3)) {
        if (assetsFlag) {
          $3 = $3.replace(/\.css$|\.css(\,)|\.less$|\.less(\,)|\.less\.css$|\.less\.css(\,)|\.scss$|\.scss(,)|\.scss$\.css$|\.scss$\.css(\,)/g, this.css + "$1$2$3$4$5");
          $3 = $3.replace(/\.js$|\.js(\,)/g, this.js + "$1");
        }

        var url = $3;
        if (this.cdnPath) {
          url = urlLib.resolve(this.from, url).replace(this.fakePath, this.cdnPath);
        }

        return $1 + url + $4;
      }
      else {
        return $0;
      }
    }

    this.content = this.content.replace(/(<script[^>]*? src=(['"]))([^"']*?)(\2.*?>[\s\S]*?<\/script>)/g, urlResolve.bind(this));
    this.content = this.content.replace(/(<link[^>]*? href=(['"]))([^"']*?)(\2.*>)/g, urlResolve.bind(this));

    this.combo();

    return this.content;
  }
};

module.exports = AssetsTool;