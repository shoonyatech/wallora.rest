var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var WorkitemPlanSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    workitemId: {type: Schema.Types.ObjectId, ref: 'Workitem'},
    lineitems: Array,
    month: Number
});

module.exports = mongoose.model('WorkitemPlan', WorkitemPlanSchema);