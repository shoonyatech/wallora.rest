//var mongoose = require('mongoose');
//var Schema = mongoose.Schema;
//
//var WorkitemInstanceLineitemSchema = new Schema({
//    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
//    workitemInstanceId: {type: Schema.Types.ObjectId, ref: 'WorkitemInstance'},
//    currency: String,
//    amount: {type: Number, get: getMoney, set: setMoney},
//    comment: String,
//    tags: Array,
//    order: Number
//});
//
//function getMoney(num){
//    return (num/100).toFixed(2);
//}
//
//function setMoney(num){
//    return num*100;
//}
//
//WorkitemInstanceLineitemSchema.set('toObject', { getters: true });
//WorkitemInstanceLineitemSchema.set('toJSON', { getters: true });
//
//module.exports = mongoose.model('WorkitemInstanceLineitem', WorkitemInstanceLineitemSchema);