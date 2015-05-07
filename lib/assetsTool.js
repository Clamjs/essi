var urlLib = require("url");
var util = require("util");
var pathLib = require("path");
var Helper = require("./helper");

function AssetsTool(realpath, param, assetsFlag) {
  this.fakePath = "http://fake_path/";
  this.from = realpath.replace(pathLib.join(param.rootdir, '/'), this.fakePath);
  this.cdnPath = param.cdnPath || null;
  if (param.cdnPath && /^https?:\/\/|^\/\//.test(param.cdnPath)) {
    var prepath = param.cdnPath.replace(/([^\/])$/, "$1/");
    var version = param.version ? (param.version + '/') : '';
    this.cdnPath = urlLib.resolve(prepath, version);
  }

  this.content = '';
  this.assetsFlag = assetsFlag || false;

  this.css = param.css;
  this.js = param.js;
  this.assetsCharset = param.assetsCharset || "utf-8";

  this.scripts = {
    top: [],
    bottom: []
  };
  this.styles = {
    top: [],
    bottom: []
  };
}
AssetsTool.prototype = {
  constructor: AssetsTool,
  groupToken: function (group) {
    return "_ESSI_INLINE_" + group + '_';
  },
  rough_classify: function (tag, path, type) {
    var fepos = tag.match(/\sfe\-move=(["'])([^"']*?)\1/);
    var pos = (fepos && fepos[2]) ? fepos[2] : null;
    if (pos) {
      this[type][pos].push(tag.replace(/\s{0,}fe\-move=(["'])([^"']*?)\1/, ''));
      return ''
    }
    else {
      return tag;
    }
  },
  extractScripts: function () {
    this.content = this.content.replace(/<script([^>]*?)>[\s\S]*?<\/script>/g, (function (all, attr) {
      var matched = attr.match(/src=(['"])([^"']*?)\1/);
      if (matched && matched[2]) {
        return this.rough_classify(all, matched[2], "scripts");
      }
      else {
        return this.rough_classify(all, null, "scripts");
      }
    }).bind(this));
  },
  extractStyles: function () {
    this.content = this.content.replace(/<link[^>]*? href=(['"])([^"']*?)\1[^>]*?>|(<style([^>]*?)>[\s\S]*?<\/style>)/g, (function (all, $1, path, style) {
      if (/type=(['"])text\/css\1/.test(all) || /rel=(['"])stylesheet\1/.test(all)) {
        return this.rough_classify(all, path, "styles");
      }
      else if (style) {
        return this.rough_classify(all, null, "styles");
      }
      else {
        return all;
      }
    }).bind(this));
  },
  rough_place: function (type) {
    var tag;
    for (var pos in this[type]) {
      if (this[type][pos].length == 0) {
        continue;
      }

      tag = this[type][pos].join("\n");

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
    }
  },
  addTimestamp: function (src) {
    if (!this.assetsFlag) {
      src = src.replace(/([^\?])\?[^\?].*$/, "$1");
      src += "?t=" + Helper.random();
    }
    return src;
  },
  combo: function (type) {
    var self = this;
    var config = {
      scripts: [
        /<script[^>]*? fe\-group=(['"])([^"']*?)\1[^>]*?>[\s\S]*?<\/script>\n{0,}/g,
        /<script[^>]*? src=(['"])([^"']*?)\1[^>]*?>[\s\S]*?<\/script>/,
        function (src) {
          src = self.addTimestamp(src);
          return '<script type="text/javascript" charset="' + this.assetsCharset + '" src="' + src + '"></script>';
        }.bind(this)
      ],
      styles: [
        /<link[^>]*? fe\-group=(['"])([^"']*?)\1[^>]*?>\n{0,}/g,
        /<link[^>]*? href=(['"])([^"']*?)\1[^>]*?>/,
        function (href) {
          href = self.addTimestamp(href);
          return '<link type="text/css" rel="stylesheet" href="' + href + '">';
        }.bind(this)
      ]
    };
    if (this.cdnPath && typeof config[type] == "undefined") {
      return;
    }

    var tag = config[type];
    var arr = {};

    this.content = this.content.replace(tag[0], (function (all, $1, group) {
      var matched = all.match(tag[1]);
      var URL = (matched && util.isArray(matched) && matched[2]) ? matched[2] : null;
      if (URL && (URL.indexOf(this.cdnPath) != -1 || URL.indexOf('$') == 0)) {
        if (!arr[group]) {
          arr[group] = [];
        }
        arr[group].push(URL.replace(/([^\?])\?[^\?].*$/, "$1"));
        return arr[group].length == 1 ? this.groupToken(group) : '';
      }
      else {
        return all;
      }
    }).bind(this));

    var url = this.getURL(arr);
    for (var group in url) {
      this.content = this.content.replace(this.groupToken(group), tag[2](url[group]));
    }
  },
  getURL: function (lists) {
    function getReg(path) {
      var reg = path.split('');
      var len = reg.length;
      for (var i = 0; i < len; i++) {
        if (['.', '/', '?', ':', '$', '{', '}'].indexOf(reg[i]) != -1) {
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
            var tmp = '';
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
  action: function (content, resolving) {
    this.content = content;

    var addCharset = function ($1, $4) {
      $4 = $4 || '';
      var scriptRegx = /(^<script)\s{1,}/i;
      var charsetRegx = /charset=/i;
      if (scriptRegx.test($1) && !(charsetRegx.test($1) || charsetRegx.test($4))) {
        $1 = $1.replace(scriptRegx, function (all, tag) {
          return tag + ' charset="' + this.assetsCharset + '" ';
        }.bind(this));
      }
      return $1;
    }.bind(this);

    var urlResolve = function (all, $1, Q, url, $4) {
      if (typeof this.cdnPath == "string") {
        if (!/^https?:\/\/|^\/\/|^\$\!?\{[^\}]*?\}/.test(url)) {
          url = urlLib.resolve(this.from, url).replace(this.fakePath, this.cdnPath);
        }

        var selfRepo = this.cdnPath.replace(/h?t?t?p?s?:?\/\/[^\/]*?\//, '');
        if (url.indexOf(selfRepo) != -1) {
          $1 = addCharset($1, $4);

          if (this.assetsFlag) {
            url = url.replace(/\.css$|\.css(\,)|\.less$|\.less(\,)|\.less\.css$|\.less\.css(\,)|\.scss$|\.scss(,)|\.scss$\.css$|\.scss$\.css(\,)/g, this.css + "$1$2$3$4$5");
            url = url.replace(/\.js$|\.js(\,)/g, this.js + "$1");
          }
          url = this.addTimestamp(url);

          return $1 + url + $4;
        }
        else {
          return all;
        }
      }
      else {
        return all;
      }
    }.bind(this);

    if (resolving) {
      this.content = this.content.replace(/(<script[^>]*? src=(['"]))([^"']*?)(\2[^>]*?>[\s\S]*?<\/script>)/g, urlResolve);
      this.content = this.content.replace(/(<link[^>]*? href=(['"]))([^"']*?)(\2[^>]*?>)/g, urlResolve);
    }

    this.extractStyles();
    this.extractScripts();

    this.rough_place("styles");
    this.rough_place("scripts");

    this.combo("styles");
    this.combo("scripts");

    return this.content;
  }
};

module.exports = AssetsTool;
