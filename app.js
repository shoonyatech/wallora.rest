var express = require("express");
var cors = require("cors");

module.exports = function (config) {
  var deployFolder = ".";
  var apiRouter = require(deployFolder + "/routes/api-routes")(config);

  var app = express();
  app.use(cors());

  app.use("/api", apiRouter);
  return app;
};
