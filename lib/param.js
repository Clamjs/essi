module.exports = {
  rootdir: "src",
  charset: "utf-8",
  replaces: {},
  cdnPath: "http://127.0.0.1/",
  min: true,
  css: ".min.css",
  js: ".min.js",
  engine: true,
  strictPage: false,
  remote: {
    "<!--\\s{0,}HTTP\\s{0,}:\\s{0,}(.+),.+[^->]*?-->":"$1",
    "<!--\\s{0,}#include[^->]*?tms\\s{0,}=\\s{0,}([\"'])\\s{0,}([^#\"']*?)\\s{0,}\\1[^->]*?-->":"$2"
  },
  hosts: {}
};