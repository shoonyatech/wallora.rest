var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var TagSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    name: String,
    displayName: String
});

module.exports = mongoose.model('Tag', TagSchema);