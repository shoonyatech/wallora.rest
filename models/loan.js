var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var LoanSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    name: String,
    accountType: Number,    // 0 - home loan, 1 - car, 2 - personal loan, 3 - others
    accountNumber: String,
    details: String,
    currency: String,
    order: Number,
    outstandingPrincipal: {type: Number, get: getMoney, set: setMoney},
    paidTillNow: {type: Number, get: getMoney, set: setMoney},
    loanAmount: {type: Number, get: getMoney, set: setMoney}
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

LoanSchema.set('toObject', { getters: true });
LoanSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('Loan', LoanSchema);