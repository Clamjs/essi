# Introduction
## Install
```
npm install essi
```

## Invoke
```
var ESSI   = require("essi");

// SSI include three SUB-MOD: Local, Remote, Helper and a preAction static method
var Helper = ESSI.Helper,
    Local  = ESSI.Local,
    Remote = ESSI.Remote;
```

# Local MOD
```
var local = new Local("requestURL", "root", [{virtualPath}], [[remoteRegx]]);
local.fetch("realPath", vars);
```
* The `realPath` argument is calculated by Helper.matchVirtual method
* The `remoteRegx` item is optional, which is a regx array
* The `vars` argument is the data transfer to template, which is optional

The template HTML string with the special Syntax:
```
<!--#include file="LOCAL_PATH" data='{"key":value,...}'-->
```

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

`Input:` request url `String`, root `String`, virtual `String`
`Output:` matched path `String`

## preAction
To deal with the pre-transaction

`Input:` Realpath `String`
* The `realPath` argument is calculated by Helper.matchVirtual method
`Output:` `Object`
* {method:`String`, args:`Array`}