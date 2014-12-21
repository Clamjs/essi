/**
 * 主入口
 * 通过require("essi")
 * */
var ESSI = require("./api");

exports = module.exports = function (param, dir) {
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