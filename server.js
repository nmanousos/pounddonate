var express = require( 'express' )
  , mongoose = require( 'mongoose' )
  , request = require( 'request' )
  , async = require( 'async' )
  , twitter = require( 'ntwitter' )
  , immortalNtwitter = require( 'immortal-ntwitter' )  
  , passport = require( 'passport')
  , io = require('socket.io')  
  , url = require('url')  
  , TwitterStrategy = require( 'passport-twitter' ).Strategy
  , Schema = mongoose.Schema
  , PORT = (process.env.PORT || 80 )
  , MONGO_URL = ( process.env.MONGOHQ_URL || 'dev' )

  , TWITTER_CONSUMER_KEY = 'key'
  , TWITTER_CONSUMER_SECRET = 'secret'
  , TWITTER_ACCESS_TOKEN_KEY = 'key'
  , TWITTER_ACCESS_TOKEN_SECRET = 'secret'

  , TWITTER_CALLBACK = ( process.env.NODE_ENV ? 'http://pounddonate.com/auth/twitter/callback' : 'http://127.0.0.1/auth/twitter/callback' ) 

var donate_list = require( './donate_list.json' )

mongoose.connect( MONGO_URL )
var User = require("./models/user").User

var Analyze = require('./controllers/paypal').Analyze
var Pay = require('./controllers/paypal').Pay
var Preapproval = require('./controllers/paypal').Preapproval
var Ipn = require('./controllers/paypal').Ipn

var twit = immortalNtwitter.create ( {
  consumer_key : TWITTER_CONSUMER_KEY
  , consumer_secret : TWITTER_CONSUMER_SECRET
  , access_token_key : TWITTER_ACCESS_TOKEN_KEY
  , access_token_secret : TWITTER_ACCESS_TOKEN_SECRET
} )

twit.rateLimitStatus(function (err, data) {
	console.log(data);
})

twit.immortalStream( 'statuses/filter', { 'track' : '#pay,#donate,#give,#giving' } ,
  function ( stream ) {
    stream.on( 'data', function ( data ) {
    		io.of( '/admin' ).emit( 'server_message_raw', data )
				Analyze( data, function ( err, results ) {
					if ( err ) return console.log ( err )
					Pay( data.user.screen_name, results.to, results.amount, results.type, data, function ( err, msg, from, status ){ 
						if( err ) return console.log ( err )
						tweetUser( msg, from )
						data.pounddonate_status = status
						io.of( '/' + data.user.screen_name.toLowerCase() ).emit( 'server_message', data )
						io.of( '/' + results.to.toLowerCase() ).emit( 'server_message', data )          
					} )                    
				} )

    } )
    stream.on( 'error', function ( err, data ) {
      console.log ( err )
      console.log ( data )
    } )    
  }
)

function tweetUser ( status, user ) {
  if( user != null ) {
    var twitUser = new twitter ( {
      access_token_key : user.token
      , access_token_secret : user.token_secret
    } )
    twitUser.updateStatus( status, 
      function (err, data) {
        if( err ) return console.log ( err )
        console.log( user.username + ' tweeted: ' + data.text)
      }
    )
  }
}

function createFriendshipWithPoundDonate ( user ) {
  if( user != null ) {
    var twitUser = new twitter ( {
      access_token_key : user.token
      , access_token_secret : user.token_secret
    } )
    twitUser.createFriendship( 702355538, 
      function (err, data) {
        if( err ) return console.log ( err )
        console.log( user.username + ' created friendship with pounddonate' )
        //console.log( data )
      }
    )
  }
}

passport.use( new TwitterStrategy( {
    consumerKey : TWITTER_CONSUMER_KEY
    , consumerSecret : TWITTER_CONSUMER_SECRET
    , callbackURL : TWITTER_CALLBACK
  } ,
  function ( token, tokenSecret, profile, done ) {
    profile.username = profile.username.toLowerCase()
    //console.log( profile )
    User.findOne ( { username : profile.username }, function ( err, user ) {
      if( err ) { return done ( err ) }
      if( user ) { 
        user.token = token
        user.token_secret = tokenSecret
        user.save( function ( err ) {
          if( err ) throw err
          done( null, user )
        } )
      } else {
        var user = new User( )
        user.provider = "twitter"
        user.uid = profile.id
        user.token = token
        user.token_secret = tokenSecret
        user.username = profile.username.toLowerCase()        
        user.profile_image_url = profile._json.profile_image_url
        user.save( function ( err ) {
          if( err ) throw err
          done( null, user )
        } )
      }
    } )
  }
) )

passport.serializeUser( function ( user, done ) {
	createFriendshipWithPoundDonate( user )
  done( null, user.username )
} )

passport.deserializeUser( function ( username, done ) {
  User.findOne( { username: username }, done )
} )

var server = express.createServer( )

server.configure(function( ) {
  server.set( 'views' , __dirname + '/views' )
  server.set( 'view engine', 'ejs' )
  //server.use( express.logger( ) )
  server.use( express.cookieParser( ) )
  server.use( express.bodyParser( ) )
  server.use( express.methodOverride( ) )
  server.use( express.session( { secret : 'newmontgomery' } ) )
  server.use( passport.initialize( ) )
  server.use( passport.session( ) )
  server.use( server.router )
  server.use( express.static( __dirname + '/static' ) )
} )

server.configure('development', function(){
    server.use(express.static(__dirname + '/static'));
    server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

server.configure('production', function(){
  var oneYear = 31557600000;
  server.use(express.static(__dirname + '/static', { maxAge: oneYear }));
  server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

var io = io.listen(server);

io.set('log level', 1); // reduce logging

io.configure(function (){
  io.set('authorization', function (handshakeData, callback) { 
    var pathName = url.parse( handshakeData.headers.referer ).pathname
    var pathUser = pathName.slice( 1, pathName.length )
    io.of( '/' + pathUser.toLowerCase() )
    callback( null, true )
  })
})

server.post ( '/ipn' , function ( req, res ) {
  Ipn( req, res, function ( err, data, from ) {
    if( err ) return console.log ( err )
    tweetUser( data, from )
  } )
} )

server.get( '/auth/twitter' ,
  passport.authenticate( 'twitter' ) ,
  function( req, res ) { }
)

server.get( '/auth/twitter/callback' ,
  passport.authenticate( 'twitter', { failureRedirect : '/' } ) ,
  function ( req, res ) {
  	if(req.params.denied) {
			gaPing('/auth/twitter/callback/denied')
		} else {
			gaPing('/auth/twitter/callback')		
		}
    if( typeof req.user.preapproval_key != 'undefined' && typeof req.user.email != 'undefined' ) {
      console.log ( 'preapproval key exists' )
      res.redirect( '/'+req.user.username )
    } else {
      console.log ( 'no preapproval key - redirecting to paypal' )
      res.redirect( '/preapproval' )
    }
  }
)
  
server.get ( '/preapproval', function ( req, res ) {
	gaPing('/preapproval')
  Preapproval( req, res, server )
} )

server.get( '/preapproval/cancel', function( req, res ) {  
	gaPing('/preapproval/cancel')
  res.redirect('/preapproval')
} )

server.get( '/preapproval/approve', function( req, res ) {
	gaPing('/preapproval/approve')
	console.log('redirecting to: ' + req.user.username)
  res.redirect('/' + req.user.username)
} )

server.get( '/logout' , function( req, res ) {
	gaPing('/logout')
  req.logout( )
  res.redirect( '/' )
} )

server.get( '/faq', function ( req, res ) {
	res.render( 'faq', { user: req.user, isAuthenticated: req.isAuthenticated() } )
} )

server.get( '/admin', ensureAuthenticated, function ( req, res ) {
	if( !req.user.admin ) {
		res.redirect( '/' )
	} else {
		User
			.find ()
			.exec( function ( err, users ) {
				if( err ) console.log ( err )
				if( users ) console.log ( users )
				var twitterUser = new Object()
				twitterUser.username = 'admin'
				twit.rateLimitStatus(function (err, data) {
					console.log(data)
					res.render( 'admin', { rateLimitStatus: data, user : req.user, users : users, twitterUser : twitterUser, isAuthenticated: req.isAuthenticated() } )	
				})
				
			} )
	}
} )

server.get( '/admin/:twitterUser', ensureAuthenticated, function ( req, res ) {
	if( !req.user.admin ) {
		res.redirect( '/' )
	} else {		
	  var twitterUser = new Object()
  	twitterUser.username = req.params.twitterUser
		User.findOne ( { username : req.params.twitterUser.toLowerCase() }, function ( err, twitterUserData ) {
			if( err ) console.log ( err )
	    if( twitterUserData ) twitterUser = twitterUserData		
			res.render( 'admin_user', { user : req.user, twitterUser : twitterUser, isAuthenticated: req.isAuthenticated() } )	
		} )
	}
} )

server.del( '/admin/:twitterUser', ensureAuthenticated, function ( req, res ) {
	if( !req.user.admin ) {
		res.redirect( '/' )
	} else {
		console.log('looking up user to delete')
		User.remove ( { username : req.params.twitterUser.toLowerCase() }, function ( err, result ) {
			if( err ) console.log ( err )
			if( result ) console.log ( result )			
			console.log('deleted user')
			res.render( 'admin', { user : req.user, users : users, isAuthenticated: req.isAuthenticated() } )	
		} )
	}
} )

server.get( '/donate', ensureAuthenticated, function ( req, res ) {
	
	function examineCategory( category, callback ) {

		function examineDonatee( donatee, callback2 ) {
			User.findOne ( { username : donatee.username.toLowerCase() }, function ( err, userData ) {
				if( err ) console.log ( err )
				if( userData ) donatee.payments_incoming = userData.payments_incoming
				twit.showUser( donatee.username.toLowerCase() , function( err, extended_data ) {
					if( err ) console.log ( err )
					if( extended_data ) donatee.extended_data = extended_data
					callback2()
				} )
			} )
		}
		
		function doneExaminingDonatees( err ) {
			if( err ) console.log ( err )
			callback()
		}		
		
		async.forEach( category.donatees, examineDonatee, doneExaminingDonatees )
		
	}

	function doneExaminingCategories( err ) {
		if( err ) console.log ( err )
		res.render( 'donate', { user : req.user, donate_list: donate_list, isAuthenticated: req.isAuthenticated() } )		
	}

	async.forEach( donate_list.categories, examineCategory, doneExaminingCategories )

})

server.get( '/:twitterUser', function ( req, res ) {

	console.log('requesting: ' + req.params.twitterUser.toLowerCase() )

  if( typeof req.header('Referrer') != 'undefined' && req.header('Referrer').indexOf( 't.co' ) != -1 && !req.isAuthenticated() ) {

  	console.log('t.co referrer exists: ' + req.header('Referrer'))
    res.redirect( '/auth/twitter' )

  } else {
  
		var twitterUser = new Object()
		twitterUser.username = req.params.twitterUser
		User.findOne ( { username : req.params.twitterUser.toLowerCase() }, function ( err, twitterUserData ) {
			if( err ) console.log ( err )
			if( twitterUserData ) twitterUser = twitterUserData
			console.log(twitterUser)    
	
			 twit.showUser( req.params.twitterUser , function( err, extended_data ) {
				 if( err ) console.log ( err )
				 if( extended_data ) twitterUser.extended_data = extended_data
				 res.render( 'user', { user : req.user, twitterUser : twitterUser, isAuthenticated: req.isAuthenticated() } )
			 } )
	
		} ) 
		
	}

} )

server.get( '/', function ( req, res ) {
  res.render( 'index', { user : req.user, isAuthenticated: req.isAuthenticated() } )
} )

server.listen( PORT )

function ensureAuthenticated( req, res, next ) {
	console.log('ensureAuthenticated')
  if( req.isAuthenticated() ) return next()
  res.redirect( '/auth/twitter' )
}

function gaPing( url ) {
}