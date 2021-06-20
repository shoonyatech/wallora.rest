var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var InviteeSchema = new Schema({
    email: String,
    username: { type : String , unique : true, required : true},
    firstName: String,
    lastName: String,
    registeredOn: Number
});

module.exports = mongoose.model('Invitee', InviteeSchema);