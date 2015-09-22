# Introduction

> `Server Side Include` enables to include pages in server side before responding HTTP request.

> `ESSI` means Enhanced SSI, it supports parsing the custom SSI syntax.

> Besides, the template engine `Juicer` is integrated in `ESSI`.

# ESSI syntax

## Def

Define Mock Data in template.

```
<!--#def
{
  "name": "ESSI"
}
-->
```

## Include
```
<!--#include file="path/to/foo.html"-->

<!--#include file="path/to/foo.html" data='{"name":"${name}"}'-->
```

## EachInclude
```
<!--#eachInclude file="path/to/item.html" itemVOs as item-->
```

## Remote
```
<!--#remote url="http://foo.com/path/to/bar.html"-->
```

* Customize

  set remote field with RegExp in param
	
## Juicer

The template engine `Juicer` is integrated in `ESSI`.

Your can read [Reference](http://juicer.name/docs/docs_zh_cn.html) for detail.

## Magic Variable

`__PARAM_STRING_ITEM__`

## Assets

> Using `fe-move` attribute in `<script>` or `<link>` tag,
> attribute value could be `top` or `bottom`:

```
<script fe-move="top" type="text/javascript" src="path/to/file.js"></script>

<link fe-move="bottom" rel="stylesheet" href="path/to/file.css" />
```

> Using `fe-group` attribute in `<script>` or `<link>` tag,
> attribute value could be whatever you like

```
<script fe-group="groupname" type="text/javascript" src="path/to/file.js"></script>

<link fe-group="groupname" rel="stylesheet" href="path/to/file.css" />
```
> `ESSI` will make the `Combo URL` according to `fe-group` and `fe-move` in build process.

```
<script fe-group="group1" type="text/javascript" src="path/to/file1.js"></script>
<script fe-group="group1" type="text/javascript" src="path/to/file2.js"></script>
<script fe-move="top" fe-group="group2" type="text/javascript" src="path/to/file3.js"></script>
```
	After Build Process, the script tags above will be converted to:

```
<script type="text/javascript" src="http://CDNPATH/version/path/to/file3.js"></script>
</head>

...

<script type="text/javascript" src="http://CDNPATH/version/path/to/??file1.js,file2.js"></script>

```

# Velocity syntax

[Thinks for velocity](https://www.npmjs.com/package/velocity)

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
  "rootdir": "src",                 // 根目录
  "charset": "utf-8",               // 页面编码
  "assetsCharset": "utf-8",         // assets编码
  "sourcemap": true,                // 是否在assets的地址中加入sourcemap开启标记
  "random": true,                   // 是否在assets的地址中加入随机数（防缓存）
  "replaces": {                     // 变量替换（正则）
    "_name_": "boying"
  },
  "remote": {"(http:\/\/.+)":"$1"}, // 自定义远程抓取URL提取的正则表达式
  "hosts": {},                      // 域名与IP的hosts对应
  "ignoreTokens": [],               // 忽略解析某些Token（正则数组）
  "ignoreJuicer": [],               // 忽略使用juicer引擎解析的文件列表（正则数组）；若布尔型,则为全局生效开关
  "native2ascii": false,            // 将HTML中的双字节字符（如中文）替换为HTML转义符号
  "cache": true,                    // 是否缓存远程抓取页面
  "cdnPath": "http://domain/",      // assets地址补全
  "layout": "default.vm",           // velocity缺省layout文件
  "screenPlaceholder": "screen_placeholder",           // velocity缺省layout文件占位符名称
  "version": "1.0.0",               // assets版本
  "css": ".min.css",
  "js": ".min.js",
  "strictPage": false               // 是否只输出严格完整的页面，不输出HTML片段
}
```

### [dir]

The DIR where puts the config file