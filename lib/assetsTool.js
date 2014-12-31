var urlLib = require("url");
var pathLib = require("path");

function AssetsTool(realpath, rootdir, cdnPath) {
  this.fakePath = "http://fake_host";
  this.cdnPath = (cdnPath||'/').replace(/([^\/])$/, "$1/");
  this.from = realpath.replace(pathLib.join(process.cwd(), rootdir||"src"), this.fakePath);

  this.flag = "fe-move";
  this.head = "head";
  this.tail = "tail";
  this.content = '';
}
AssetsTool.prototype = {
  constructor: AssetsTool,
  input: function (content) {
    this.content = content.replace(/\<\!\-\-^#.*\-\-\>/g, '');

    var self = this;
    function urlResolve($0, $1, $2, $3, $4) {
      var url = urlLib.resolve(self.from, $3).replace(self.fakePath+'/', self.cdnPath);
      return $1+url+$4;
    }

    this.content = this.content.replace(/(<script[^>]*? src=(['"]))([^"']*?)(\2.*?>[\s\S]*?<\/script>)/g, urlResolve);
    this.content = this.content.replace(/(<link[^>]*? href=(['"]))([^"']*?)(\2.*>)/g, urlResolve);

    /*if (!this.content.match(/<body[^>]*?>([\s\S]*?)<\/body>/gi)) {
      this.content = "<body>\n" + this.content + "\n</body>";
    }

    if (!this.content.match(/<head[^>]*?>([\s\S]*?)<\/head>/gi)) {
      this.content = "<head>\n</head>\n" + this.content;
    }

    if (!this.content.match(/<html[^>]*?>([\s\S]*?)<\/html>/gi)) {
      this.content = "<html>\n" + this.content + "\n</html>";
    }

    if (!this.content.match(/^<!DOCTYPE[^>]*?>/gi)) {
      this.content = "<!DOCTYPE html>\n" + this.content;
    }*/
  },
  findAssets: function (regx, radical) {
    var head = [], tail = [];
    var movetoReg = new RegExp("\\s" + this.flag + "\\s{0,}=\\s{0,}[\'\"]([^\"\']*?)[\'\"]");

    var self = this;
    this.content = this.content.replace(regx, function (mm) {
      var m = mm.match(movetoReg);
      mm = mm.replace(movetoReg, '');
      if (m && typeof m[1] != "undefined") {
        if (m[1] == self.head) {
          head.push(mm);
          return '';
        }
        else if (m[1] == self.tail) {
          tail.push(mm);
          return '';
        }
        else {
          return mm;
        }
      }
      else if (radical) {
        // 激进行为，没标明的全放head
        head.push(mm);
        return '';
      }
      else {
        // 非激进行为，没标明的放原地
        return mm;
      }
    });

    return {
      head: head,
      tail: tail
    };
  },
  putAssets: function (assets) {
    this.content = this.content.replace(/<\/head>/, function (mm) {
      return assets.head.join("\n") + "\n" + mm;
    });
    this.content = this.content.replace(/<\/body>/, function (mm) {
      return assets.tail.join("\n") + "\n" + mm;
    });
  },
  tidy: function () {
    return this.content.replace(/\s{0,}[\r\n]{1,}/g, "\n");
  }
}

function EXP_AssetsTool(realpath, rootdir, cdnPath) {
  this.fe = new AssetsTool(realpath, rootdir, cdnPath);
}
EXP_AssetsTool.prototype = {
  constructor: EXP_AssetsTool,
  action: function (content, radical) {
    this.fe.input(content);

    var scripts = this.fe.findAssets(/<script[^>]*? src=['"]([^"']*?)['"].*?>[\s\S]*?<\/script>/g, radical);
    var styles = this.fe.findAssets(/<link[^>]*? href=['"]([^"']*?).css['"].*>/g, radical);
    this.fe.putAssets(styles);
    this.fe.putAssets(scripts);

    return this.fe.tidy();
  }
};

module.exports = EXP_AssetsTool;