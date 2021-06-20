var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var ContactSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    firstName: String,
    lastName: String,
    email: String,
    photoUrl: String,
    mobile: String
});

module.exports = mongoose.model('Contact', ContactSchema);