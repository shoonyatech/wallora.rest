var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var InvestmentTransactionSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    investmentId: {type: Schema.Types.ObjectId, ref: 'Investment'},
    amount: {type: Number, get: getMoney, set: setMoney},
    currentValue: {type: Number, get: getMoney, set: setMoney},
    date: Number,
    remark: String,
    transactionType: Number,     // 0 - buy, 1 - sell, 2 - current-value
    order: Number
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

InvestmentTransactionSchema.set('toObject', { getters: true });
InvestmentTransactionSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('InvestmentTransaction', InvestmentTransactionSchema);
