var urlLib = require("url");
var pathLib = require("path");
var util = require("util");
var querystring = require("querystring");
var merge = require("merge");
var Helper = require("./helper");

function AssetsTool(realpath, param, assetsFlag) {
  this.fakePath = "http://fake_path/";
  this.from = realpath.replace(pathLib.join(param.rootdir, '/'), this.fakePath);
  this.cdnPath = param.cdnPath;
  if (param.cdnPath && /^https?:\/\/|^\/\//.test(param.cdnPath)) {
    var prepath = param.cdnPath.replace(/([^\/])$/, "$1/");
    var version = param.version ? (param.version + '/') : '';
    this.cdnPath = urlLib.resolve(prepath, version);
  }

  this.content = '';
  this.assetsFlag = assetsFlag || false;
  this.sourcemap = param.sourcemap;
  this.random = param.random;

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
    var query = {};

    src = src.replace(/([^\?])\?([^\?].*)$/, function(all, $1, $2) {
      query = merge.recursive(true, query, querystring.parse($2));
      return $1;
    });

    if (!this.assetsFlag) {
      if (this.random) {
        query['_random'] = Helper.random();
      }
      if (this.sourcemap) {
        query['_sourcemap'] = 1;
      }
    }

    var qs = querystring.stringify(query);
    return src + (qs ? ('?' + qs) : '');
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

    if (!this.cdnPath) {
      this.content = this.content.replace(/\s{0,}fe\-group=(['"])([^"']*?)\1\s{0,}/g, '');
      return;
    }

    var tag = config[type];
    if (typeof tag == "undefined") {
      return;
    }
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

        if (matched && !/\/$/.test(matched)) {
          if (/\//.test(matched)) {
            matched = urlLib.resolve(matched, "./");
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

    var urlResolve = function (all, $1, Q, url, $4) {
      if (typeof this.cdnPath == "string") {
        var selfRepo = this.cdnPath.replace(/h?t?t?p?s?:?\/\/[^\/]*?\//, '');
        var isAbs = /^https?:\/\/|^\/\/|^\$\!?\{[^\}]*?\}/.test(url);

        if (this.cdnPath && !isAbs) {
          url = urlLib.resolve(this.from, url).replace(this.fakePath, this.cdnPath);
        }

        if (url.indexOf(selfRepo) != -1 && ((selfRepo == '' && !isAbs) || selfRepo != '')) {
          var scriptRegx = /(^<script)\s{1,}/i;
          var charsetRegx = /charset=/i;
          if (scriptRegx.test($1) && !(charsetRegx.test($1) || charsetRegx.test($4))) {
            $1 = $1.replace(scriptRegx, function (all, tag) {
              return tag + ' charset="' + this.assetsCharset + '" ';
            }.bind(this));
          }

          if (this.assetsFlag) {
            url = url.replace(/\.css$|\.css(\,)|\.less$|\.less(\,)|\.less\.css$|\.less\.css(\,)|\.scss$|\.scss(,)|\.scss$\.css$|\.scss$\.css(\,)/g, this.css + "$1$2$3$4$5");
            url = url.replace(/(\.tpl)$|\.js$|\.js(\,)/g, "$1" + this.js + "$2");
          }
          else {
            url = url.replace(/(\.less)$|(\.scss)$|(\.less)(\,)|(\.scss)(,)/g, "$1$2$3$5.css$4$6");
            url = url.replace(/(\.tpl)$|(\.tpl)(\,)$/g, "$1$2.js$3");
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
