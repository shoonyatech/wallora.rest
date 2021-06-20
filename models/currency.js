var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CurrencySchema = new Schema({
    name: String,
    code: String,
    symbol: String,
    order: Number
});

module.exports = mongoose.model('Currency', CurrencySchema);