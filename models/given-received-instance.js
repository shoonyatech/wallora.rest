var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var GivenReceivedInstanceSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    currency: String,
    amount: {type: Number, get: getMoney, set: setMoney},
    date: Number,
    actualOrPlanned: Number,
    givenOrReceived: Number,
    toWhom: {type: Schema.Types.Object, ref: 'Contact'},
    comment: String,
    tags: Array,
    remainingAmount: {type: Number, get: getMoney, set: setMoney},
    isResolved: Boolean,
    linkedPlanId: {type: Schema.Types.ObjectId, ref: 'GivenReceivedInstance'}
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

GivenReceivedInstanceSchema.set('toObject', { getters: true });
GivenReceivedInstanceSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('GivenReceivedInstance', GivenReceivedInstanceSchema);