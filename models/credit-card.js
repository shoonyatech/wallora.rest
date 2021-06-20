var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CreditCardSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    name: String,
    cardNumber: String,
    details: String,
    currency: String,
    order: Number,
    outstandingBalance: {type: Number, get: getMoney, set: setMoney},
    creditLimit: {type: Number, get: getMoney, set: setMoney}
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

CreditCardSchema.set('toObject', { getters: true });
CreditCardSchema.set('toJSON', { getters: true });

module.exports = mongoose.model('CreditCard', CreditCardSchema);