var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CreditCardTransactionSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    creditCardId: {type: Schema.Types.ObjectId, ref: 'CreditCard'},
    amount: {type: Number, get: getMoney, set: setMoney},
    outstandingBalance: {type: Number, get: getMoney, set: setMoney},
    date: Number,
    remark: String,
    transactionType: Number,     // 0 - debit, 1 - credit, 2 - balance carry forward
    order: Number
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

CreditCardTransactionSchema.set('toObject', { getters: true });
CreditCardTransactionSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('CreditCardTransaction', CreditCardTransactionSchema);
