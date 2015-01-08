# Introduction

`Server Side Include` enables to include pages in server side before responding HTTP request.

`ESSI` means Enhanced SSI, it supports parsing the custom SSI syntax.

# ESSI syntax

Include

	<!--#include file="path/to/foo.html"-->
	
	<!--#include file="path/to/foo.html" data='{"foo":"bar"}'-->
	
EachInclude

	<!--#eachInclude file="path/to/item.html" itemVOs as item-->

TMS

	fetch from TMS:
	<!--#include file="path/to/foo.html" tms="http://foo.com/path/to/bar.html" site="1"-->
	
	fetch from Local:
	<!--#include file="path/to/foo.html" tms="#http://foo.com/path/to/bar.html" site="1"-->

AWP

	<!--HTTP:http://foo.com/path/to/bar.html,utf-8:HTTP-->
	
Remote

	<!--#remote url="http://foo.com/path/to/bar.html"-->

# Invoke

```
npm install essi
```

## Use in server

As a middleware in `Express` or `KOA`

```
app
  .use(require("essi")(param, dir))
```

## Use in gulp

As a plugin in `gulp`

```
gulp
  .src("path/to/*")
  .pipe(require("essi").gulp(param, dir))
```

## Arguments

### param

```
{
  rootdir: "src",                 // 根目录
  charset: "utf-8",               // 编码
  replaces: {
    "__version__": "1.0.0",
    "__name__": "boying"
  },                              // 变量替换
  cdnPath: "http://127.0.0.1/__version__",            // assets地址补全
  min: true,                      // assets地址加min处理开关
  css: ".min.css",
  js: ".min.js",
  engine: true,                   // 是否要用自带引擎，没有特殊需求一般为true
  strictPage: false,              // 是否只输出严格完整的页面，不输出HTML片段
  remote: {
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->":"$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->":"$2"
  },                              // 自定义远程抓取URL提取的正则表达式
  virtual: {},                    // 虚拟目录挂载
  hosts: {}                       // 域名与IP的hosts对应
}
```

### dir

The DIR where puts the config file