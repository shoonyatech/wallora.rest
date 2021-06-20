var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var WorkitemSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    name: String,
    incomeOrExpense: String,
    order: Number
});

WorkitemSchema.set('toObject', { getters: true });
WorkitemSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('Workitem', WorkitemSchema);