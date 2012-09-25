var mongoose = require( 'mongoose' )

var UserSchema = new mongoose.Schema( {
  provider : String
  , uid : String
  , name : String
  , username : String
  , image : String
  , preapproval_key : String
  , token : String
  , goal : String
  , token_secret : String
  , email : String
  , profile_image_url : String
  , percentage : { type: Number }
  , payments_incoming_pending : Array
  , payments_outgoing_pending : Array
  , payments_outgoing : Array
  , payments_incoming : Array
  , created : { type : Date, default : Date.now }
  , admin : { type : Boolean, default : false }
  
} )

var User = mongoose.model( 'User', UserSchema )

module.exports = {
  User: User
}