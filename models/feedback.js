var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var FeedbackSchema = new Schema({
    message: String,
    email: String,
    fullName: String,
    source: String
});

module.exports = mongoose.model('Feedback', FeedbackSchema);