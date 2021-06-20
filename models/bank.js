var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var BankSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    bankName: String,
    accountType: Number,    // 0 - savings, 1 - current
    accountNumber: String,
    details: String,
    currency: String,
    order: Number,
    balance: {type: Number, get: getMoney, set: setMoney}
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

BankSchema.set('toObject', { getters: true });
BankSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('Bank', BankSchema);