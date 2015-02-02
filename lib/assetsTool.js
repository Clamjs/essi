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
  }
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
    if (pos && ["top", "bottom"].indexOf(pos) != -1) {
      var fegroup = tag.match(/\sfe\-group=(["'])([^"']*?)\1/);
      var group = (fegroup && fegroup[2]) ? fegroup[2] : uniqid();

      if (!this[type][pos][group]) {
        this[type][pos][group] = {};
      }

      var urlObj = urlLib.parse(path);
      var key = this.fakePath;
      if (urlObj.protocol && urlObj.host) {
        key = urlObj.protocol + "//" + urlObj.host;
      }
      if (!this[type][pos][group][key]) {
        this[type][pos][group][key] = [];
      }
      this[type][pos][group][key].push(urlObj.path);
      return true;
    }
    else {
      return false;
    }
  },
  extractScripts: function () {
    var self = this;
    this.content = this.content.replace(/<script[^>]*? src=(['"])([^"']*?)\1.*?>[\s\S]*?<\/script>/g, function (all, $1, path) {
      return self.pushList(all, path, "scripts") ? '' : all;
    });
  },
  extractStyles: function () {
    var self = this;
    this.content = this.content.replace(/<link[^>]*? href=(['"])([^"']*?)\1.*>/g, function (all, $1, path) {
      if (all.match(/type=(['"])text\/css\1/) || all.match(/rel=(['"])stylesheet\1/)) {
        return self.pushList(all, path, "styles") ? '' : all;
      }
      else {
        return all;
      }
    });
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
  placeStyles: function (pos) {
    var styles = this.styles[pos] || [];
    var stylePaths;
    var stylesTags = [];
    for (var group in styles) {
      stylePaths = this.getURL(styles[group]);
      for (var host in stylePaths) {
        stylesTags.push(
          '<link type="text/css" rel="stylesheet" href="' + (host.replace(this.fakePath, "./") + stylePaths[host]) + '">'
        );
      }
    }

    if (stylesTags.length) {
      var tag = stylesTags.join("\n");

      if (pos == "bottom") {
        if (this.content.match(/<\/body>/)) {
          this.content = this.content.replace(/<\/body>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content += "\n" + tag;
        }
      }
      else {
        if (this.content.match(/<\/head>/)) {
          this.content = this.content.replace(/<\/head>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content = tag + "\n" + this.content;
        }
      }
    }
  },
  placeScripts: function (pos) {
    var scripts = this.scripts[pos] || [];
    var scriptPaths;
    var scriptTags = [];
    for (var group in scripts) {
      scriptPaths = this.getURL(scripts[group]);
      for (var host in scriptPaths) {
        scriptTags.push(
          '<script type="text/javascript" src="' + (host.replace(this.fakePath, "./") + scriptPaths[host]) + '"></script>'
        );
      }
    }

    if (scriptTags.length) {
      var tag = scriptTags.join("\n");

      if (pos == "top") {
        if (this.content.match(/<\/head>/)) {
          this.content = this.content.replace(/<\/head>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content = tag + "\n" + this.content;
        }
      }
      else {
        if (this.content.match(/<\/body>/)) {
          this.content = this.content.replace(/<\/body>/, function (mm) {
            return tag + "\n" + mm;
          });
        }
        else {
          this.content += "\n" + tag;
        }
      }
    }
  },
  combo: function () {
    this.extractScripts();
    this.extractStyles();

    this.placeStyles("top");
    this.placeScripts("top");
    this.placeStyles("bottom");
    this.placeScripts("bottom");
  },
  action: function (assetsFlag) {
    var self = this;

    function urlResolve($0, $1, $2, $3, $4) {
      if (!$3.match(/^http:\/\//)) {
        if (assetsFlag) {
          $3 = $3.replace(/\.css$|\.css(\,)|\.less$|\.less(\,)|\.less\.css$|\.less\.css(\,)|\.scss$|\.scss(,)|\.scss$\.css$|\.scss$\.css(\,)/g, self.css + "$1$2$3$4$5");
          $3 = $3.replace(/\.js$|\.js(\,)/g, self.js + "$1");
        }

        var url = $3;
        if (self.cdnPath) {
          url = urlLib.resolve(self.from, url).replace(self.fakePath, self.cdnPath);
        }

        return $1 + url + $4;
      }
      else {
        return $0;
      }
    }

    this.content = this.content.replace(/(<script[^>]*? src=(['"]))([^"']*?)(\2.*?>[\s\S]*?<\/script>)/g, urlResolve);
    this.content = this.content.replace(/(<link[^>]*? href=(['"]))([^"']*?)(\2.*>)/g, urlResolve);

    this.combo();

    return this.content;
  }
};

module.exports = AssetsTool;