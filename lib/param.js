module.exports = {
  rootdir: "src",
  charset: "utf-8",
  replaces: {},
  virtual: {},
  cdnPath:"http://g.tbcdn.cn/",
  remote: {
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->":"$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->":"$2"
  },
  hosts:{}
};