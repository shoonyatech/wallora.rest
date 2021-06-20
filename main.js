var http = require("http");
var mongoose = require("mongoose");
var express = require("express");

var env = process.argv[2] || "local";
console.log("Deploying to " + env);

var deployFolder = ".";
var config = require(deployFolder + "/config/config-" + env);

var server_port = process.env.PORT || config.server_port;
var server_ip_address = config.server_ip_address;

console.log("IP: " + server_ip_address);
console.log("Port: " + server_port);

mongoose.connect(process.env.MONGODB_URI || config.database);

var app = require("./app")(config);
app.set("root", deployFolder);
app.set("port", server_port);

var server = http.createServer(app);
server.listen(server_port, server_ip_address);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== "listen") {
    throw error;
  }

  var bind =
    typeof port === "string" ? "Pipe " + server_port : "Port " + server_port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  console.log("Listening on " + bind);
}
