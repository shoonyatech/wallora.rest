var express = require("express");

module.exports = function (config) {
  var deployFolder = ".";
  var apiRouter = require(deployFolder + "/routes/api-routes")(config);

  var app = express();

  app.use("/api", apiRouter);
  return app;
};
