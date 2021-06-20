var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var UserSettingsSchema = new Schema({
    accountId: {type: Schema.Types.ObjectId, ref: 'Account'},
    currency: String,
    lastPlannedMonth: Number,
    monthlyIncome: {type: Number, get: getMoney, set: setMoney},
    gender: String,
    dob: Number,
    city: String,
    country: String,
    incomeType: String,
    incomeSources: Array,
    taxFrequency: String,
    taxes: Array,
    houseRent: Number,
    emis: Array,
    bills: Array,
    grocery: Object,
    commutes: Array,
    households: Array,
    eatOut: Number,
    entertainments: Array,
    hobbies: Array,
    community: Array,
    grooming: Array,
    profession: Array,
    medicines: Number,
    mediclaim: Object,
    annualBills: Array,
    education: Number,
    others: Number,
    family: Array,
    friends: Array,
    professionalContacts: Array,
    isPlanPageExplained: Boolean,
    isActualsPageExplained: Boolean
});

function getMoney(num){
    return (num/100).toFixed(2);
}

function setMoney(num){
    return num*100;
}

UserSettingsSchema.set('toObject', { getters: true });
UserSettingsSchema.set('toJSON', { getters: true });


module.exports = mongoose.model('UserSettings', UserSettingsSchema);