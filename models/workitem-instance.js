var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var WorkitemInstanceSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    workitemId: {type: Schema.Types.ObjectId, ref: 'Workitem'},
    lineitems: Array,
    date: Number
});

module.exports = mongoose.model('WorkitemInstance', WorkitemInstanceSchema);