var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var BankTransactionSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    bankId: {type: Schema.Types.ObjectId, ref: 'Bank'},
    amount: {type: Number, get: getMoney, set: setMoney},
    balance: {type: Number, get: getMoney, set: setMoney},
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

BankTransactionSchema.set('toObject', { getters: true });
BankTransactionSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('BankTransaction', BankTransactionSchema);
