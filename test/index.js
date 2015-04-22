/**
 * Created by suyoubi on 15/4/22.
 */

var path = require("path");
var app = require("plug-base");

app.root('src');
app.disableHosts();
app
  .plug(require("../"), {})
  .listen(80, 443);
