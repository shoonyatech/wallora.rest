var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var LoanTransactionSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    loanId: {type: Schema.Types.ObjectId, ref: 'Loan'},
    amount: {type: Number, get: getMoney, set: setMoney},
    paidTillNow: {type: Number, get: getMoney, set: setMoney},
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

LoanTransactionSchema.set('toObject', { getters: true });
LoanTransactionSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('LoanTransaction', LoanTransactionSchema);
