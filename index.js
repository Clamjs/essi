/**
 * 主入口
 * 通过require("essi")
 * */
var ESSI = require("./api");
var pathLib = require("path");

module.exports = function (param, dir) {
  if (!dir) {
    var userHome = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH; // 兼容Windows
    dir = pathLib.join(userHome, ".essi");
  }

  var essiInst;

  return function () {
    essiInst = new ESSI(param, dir);

    var req, res, next;
    switch (arguments.length) {
      case 1:
        req = this.req;
        res = this.res;
        next = arguments[0];
        break;
      case 3:
        req = arguments[0];
        res = arguments[1];
        next = arguments[2];
        break;
      default:
        next = function () {
          console.log("Unknown Web Container!");
        };
    }

    try {
      if (req && res && next) {
        essiInst.handle(req, res, next);
      }
      else {
        next();
      }
    }
    catch (e) {
      next();
    }
  }
};