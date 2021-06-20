var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CashAtHomeInstanceSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    currency: String,
    amount: {type: Number, get: getMoney, set: setMoney},
    date: Number
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

CashAtHomeInstanceSchema.set('toObject', { getters: true });
CashAtHomeInstanceSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('CashAtHomeInstance', CashAtHomeInstanceSchema);