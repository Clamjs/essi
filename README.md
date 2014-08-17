# Introduction
## Install
```
npm install essi
```

## Invoke
```
var SSI    = require("essi");

// SSI include three SUB-MOD: Local, Remote, Helper
var Helper = SSI.Helper,
    Local  = SSI.Local,
    Remote = SSI.Remote;
```

# Local MOD
```
var local = new Local("requestURL", options);
local.fetch("realPath", vars);
```
* The `realPath` argument is calculated by Helper.matchVirtual method
* The `options` argument must involve four items of `rootdir`, `target`, `virtual` & `mod`. The `remoteRegx` item is optional, which is a regx array
* The `vars` argument is the data transfer to template, which is optional

# Remote MOD
```
var remote = new Remote("content");
remote.fetch(callback);
```
The `content` argument is usually a HTML string with the special Syntax:
```
<!--#remote url="REMOTE URL"-->
```

# Helper MOD

## isExists
Check if fs.existsSync

`Input:` File Path `String`
`Output:` `Boolen`

## isAssets
Check if path point to assets `!`(`NULL` OR `Directory` OR `HTML`)

`Input:` File Path `String`
`Output:` `Boolen`

## JSON_parse
Parsing the JSON String `with comments`

`Input:` JSON `String`
`Output:` JSON `Object`

## customReplace
Replace the custom defined `MARK` using JSON Map

`Input:` content `String`, map `Object`
```
{
    "$MARK1$":"hello world",
    "$MARK2$":"ju.taobao.com"
}
```
`Output:` content `String`

## matchVirtual
Match the `virtual` path to the `real` path introduced by config

`Input:` request url `String`, options `Object`
* The options argument must involve two items of `rootdir` & `target`

`Output:` matched path `String`