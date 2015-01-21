# Introduction

`Server Side Include` enables to include pages in server side before responding HTTP request.

`ESSI` means Enhanced SSI, it supports parsing the custom SSI syntax.

# ESSI syntax

## Include

	<!--#include file="path/to/foo.html"-->
	
	<!--#include file="path/to/foo.html" data='{"foo":"bar"}'-->
	
## EachInclude

	<!--#eachInclude file="path/to/item.html" itemVOs as item-->

## Remote

	<!--#remote url="http://foo.com/path/to/bar.html"-->

### Customize

	set remote field in param


# Install & Usage

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
    "_name_": "boying"
  },                              // 变量替换
  remote: {"(http:\/\/.+)":"$1"}, // 自定义远程抓取URL提取的正则表达式
  hosts: {},                      // 域名与IP的hosts对应
  enable: true,                   // 是否要用自带引擎，没有特殊需求一般为true
  cache: true,                    // 是否缓存远程抓取页面
  cdnPath: "http://domain/",      // assets地址补全
  version: "1.0.0",               // assets版本
  css: ".min.css",
  js: ".min.js",
  strictPage: false               // 是否只输出严格完整的页面，不输出HTML片段
}
```

### [dir]

The DIR where puts the config file