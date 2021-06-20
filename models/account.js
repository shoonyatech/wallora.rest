var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AccountSchema = new Schema({
    email: String,
    password: String,
    username: String,
    firstName: String,
    lastName: String,
    registeredOn: Number,
    passwordResetOtp: String
});

module.exports = mongoose.model('Account', AccountSchema);