var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CashAtHomePlanSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    currency: String,
    amount: {type: Number, get: getMoney, set: setMoney},
    month: Number
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

CashAtHomePlanSchema.set('toObject', { getters: true });
CashAtHomePlanSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('CashAtHomePlan', CashAtHomePlanSchema);