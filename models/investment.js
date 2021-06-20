var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var InvestmentSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    investmentName: String,
    accountType: Number,
    accountNumber: String,
    details: String,
    currency: String,
    order: Number,
    currentValue: {type: Number, get: getMoney, set: setMoney}
});

function getMoney(num) {
    return (num / 100).toFixed(2);
}

function setMoney(num) {
    return num * 100;
}

InvestmentSchema.set('toObject', {getters: true});
InvestmentSchema.set('toJSON', {getters: true});

module.exports = mongoose.model('Investment', InvestmentSchema);