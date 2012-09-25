var request = require( 'request' )
  , async = require( 'async' )
  , qs = require( 'querystring' )
  , PAYPAL_API_USERID = ( process.env.NODE_ENV ? '	prod' : 'dev' )
  , PAYPAL_API_PASSWORD = ( process.env.NODE_ENV ? 'prod' : 'dev' )
  , PAYPAL_API_SIGNATURE = ( process.env.NODE_ENV ? 'prod' : 'dev' )    
  , PAYPAL_API_APPID = ( process.env.NODE_ENV ? 'prod' : 'dev' )
  , PAYPAL_CANCEL_URL = ( process.env.NODE_ENV ? 'http://pounddonate.com/preapproval/cancel' : 'http://localhost/preapproval/cancel' )
  , PAYPAL_APPROVE_URL = ( process.env.NODE_ENV ? 'http://pounddonate.com/preapproval/approve' : 'http://localhost/preapproval/approve' )
  , PAYPAL_IPN_URL = ( process.env.NODE_ENV ? 'http://pounddonate.com/ipn' : 'dev' )
  , PAYPAL_IPN_ENDPOINT = ( process.env.NODE_ENV ? 'https://www.paypal.com/cgi-bin/webscr' : 'https://www.sandbox.paypal.com/cgi-bin/webscr' )
  , PAYPAL_ENDPOINT = ( process.env.NODE_ENV ? 'paypal.com' : 'sandbox.paypal.com' )
  , POUNDDONATE_ACCOUNT = ( process.env.NODE_ENV ? 'prod' : 'dev' ) 
  , PERCENTAGE = ( process.env.PERCENTAGE ? process.env.PERCENTAGE : 1 )
  
  console.log('PERCENTAGE: ' + PERCENTAGE )

var User = require("../models/user").User

function analyze ( data, callback ) {
  console.log ( 'analyzing: ' + data.text )
  async.parallel ( 
    {
      amount: function ( callback ) {
        async.detectSeries( data.text.split(' '),
          function( item, callback ) { item.indexOf( '$' ) != -1 ? callback ( true ) : callback ( false ) },
          function( result ) { if( result ) { callback( null, result.slice( 1, result.length ) ) } }
        )        
      },
      to: function ( callback ) {
        async.detectSeries( data.text.split(' ').reverse(),
          function( item, callback ) { item.indexOf( '@' ) != -1 ? callback ( true ) : callback ( false ) },
          function( result ) { if( result ) { callback( null, result.indexOf( ':' ) != -1 ? result.slice( 1, result.length -1 ) : result.slice( 1, result.length ) ) } }
        )        
      },
      type: function ( callback ) {
        data.text.indexOf ( '#pay' ) != -1 ? callback ( null, 'payment' ) : callback ( null, 'donation' )
        
      }
    }, 
    function ( err, results ) {
      console.log ( results )
      data.pounddonate = results
      data.user.screen_name != results.to ? callback( null, results ) : callback( 'cant send to yourself!' )
    }
  )
}

function pay( from, to, amount, type, data, callback ) {

  from = from.toLowerCase()
  to = to.toLowerCase()
  
  console.log( 'paying ' + to + ' $' + amount + ' from ' + from )
  
  async.parallel( {
    from: function( cb ) { User.findOne ( { username : from }, cb ) },
    to: function( cb ) { User.findOne ( { username : to }, cb ) } 
  },
  function ( err, results ) {
    if ( results.from === null) {
      console.log ('case1 - from user has not signed up at all')
      if( results.to != null ) {
        var user = new User( )
        user.provider = "twitter"
        user.username = from
        user.payments_outgoing_pending.push( data )
        user.save( function ( err ) {
          if( err ) return console.log( err )
          callback( null, '@' + from + ' thanks for your ' + type + ' of $' + amount + '! please complete your ' + type + ' by signing up at www.pounddonate.com/' + from, results.to, "Pending" )
        } )
      } else {
        callback( 'from and to were both not signed up, so not saving them' )
      }      
    } else if ( typeof results.from.preapproval_key === 'undefined') {     
      console.log ('case2 - from user has not linked paypal')
      results.from.payments_outgoing_pending.push( data )
      results.from.save( function ( err ) {
        if( err ) return console.log ( err )
        callback( null, '@' + from + ' thanks for your ' + type + ' of $' + amount + '! please complete your ' + type + ' by signing up at www.pounddonate.com/' + from, results.to, "Pending" )
      } )
    } else if ( results.to === null ) {
      console.log ('case3 - to user has not signed up or received any payments')      
      var user = new User( )
      user.provider = "twitter"
      user.username = to
      user.payments_incoming_pending.push( data )
      user.save( function ( err ) {
        if( err ) return console.log ( err )
        callback( null, '@' + to + ' ' + type + ' for $' + amount + ' waiting for you at www.pounddonate.com/' + to , results.from, "Pending" )
      } )
    } else if( typeof results.to.email === 'undefined' ) {
      console.log ('case4 - to user has not signed but has payments waiting')
      results.to.payments_incoming_pending.push( data )
      results.to.save( function ( err ) {
        if( err ) return console.log ( err )
        callback( null, '@' + to + ' ' + type + ' for $' + amount + ' waiting for you at www.pounddonate.com/' + to , results.from, "Pending" )
      } )
    } else {
      console.log ('case5 - both are signed up - starting payment of ' + amount )
 
 			if( typeof results.to.percentage != 'undefined' ) {
 				console.log('user percentage exists: ' + results.to.percentage )
	      var pounddonateAmount = ( ( Number(results.to.percentage) * .01 ) * Number(amount) ).toFixed( 2 )
	    } else {
 				console.log('no user percentage exists, using global: ' + PERCENTAGE )	    
	      var pounddonateAmount = ( ( Number(PERCENTAGE) * .01 ) * Number(amount) ).toFixed( 2 )	    
	    }

      console.log('paying ' + POUNDDONATE_ACCOUNT + ' ' + pounddonateAmount )      
      
      request(
        'https://svcs.' + PAYPAL_ENDPOINT + '/AdaptivePayments/Pay' +
        '?actionType=PAY' +
        '&receiverList.receiver(0).email='+ results.to.email +
        '&receiverList.receiver(0).amount='+ amount + 
        '&receiverList.receiver(0).primary=true'+
        '&receiverList.receiver(1).email='+ POUNDDONATE_ACCOUNT +
        '&receiverList.receiver(1).amount='+ pounddonateAmount + 
        '&feesPayer=PRIMARYRECEIVER' +
        '&currencyCode=USD' +
        '&cancelUrl=' + PAYPAL_CANCEL_URL +
        '&returnUrl=' + PAYPAL_APPROVE_URL +
        '&ipnNotificationUrl=' + PAYPAL_IPN_URL +
        '&requestEnvelope.errorLanguage=en_US' +
        '&memo=' + encodeURIComponent('@' + results.from.username + ': ' + data.text ) +
        '&preapprovalKey='+ results.from.preapproval_key,
        {
          headers : {
            'X-PAYPAL-SECURITY-USERID' : PAYPAL_API_USERID,
            'X-PAYPAL-SECURITY-PASSWORD' : PAYPAL_API_PASSWORD,
            'X-PAYPAL-SECURITY-SIGNATURE' : PAYPAL_API_SIGNATURE,
            'X-PAYPAL-SERVICE-VERSION' : '1.1.0',
            'X-PAYPAL-APPLICATION-ID' : PAYPAL_API_APPID,
            'X-PAYPAL-REQUEST-DATA-FORMAT' : 'NV',
            'X-PAYPAL-RESPONSE-DATA-FORMAT' : 'NV'
          }
        } ,
        function ( request, response, body ) {
        	console.log( body )
          if ( body.indexOf( 'paymentExecStatus=COMPLETED' ) != -1 ) {
            callback( null, '@' + from + ' ' + type + ' for $'+ amount +' confirmed, thanks!', results.to, "Completed" )
            results.from.payments_outgoing.push( data )
            results.from.save( function ( err ) { if( err ) return console.log ( err )} )
            results.to.payments_incoming.push( data )
            results.to.save( function ( err ) { if( err ) return console.log ( err )} )
          } else {
            callback( body )
          }
        }
      ) 
    }
  }
  )
}

function preapproval(req, res) {
	
	console.log('starting preapproval request: ' + PAYPAL_ENDPOINT)
	
  if( typeof req.user != 'undefined' ) {
      
    var MyDate = new Date()
    var startingDate = MyDate.getUTCFullYear() + '-' + ('0' + (MyDate.getUTCMonth()+1)).slice(-2) + '-' + ('0' + MyDate.getUTCDate()).slice(-2) + 'Z'
    var endingDate = (MyDate.getUTCFullYear() + 1 )+ '-' + ('0' + (MyDate.getUTCMonth())).slice(-2) + '-' + ('0' + MyDate.getUTCDate()).slice(-2) + 'Z'
    
    console.log( startingDate )
		console.log( endingDate )    
    
    request(
      'https://svcs.' + PAYPAL_ENDPOINT + '/AdaptivePayments/Preapproval' +
      '?startingDate=' + startingDate +
      '&endingDate=' + endingDate +
      '&currencyCode=USD' +
      '&cancelUrl=' + PAYPAL_CANCEL_URL +
      '&returnUrl=' + PAYPAL_APPROVE_URL +
      '&ipnNotificationUrl=' + PAYPAL_IPN_URL +    
      '&feesPayer=PRIMARYRECEIVER' +
      '&maxTotalAmountOfAllPayments=2000' +
      '&maxAmountPerPayment=100' +
      '&requestEnvelope.errorLanguage=en_US' ,
      {
        headers : {
          'X-PAYPAL-SECURITY-USERID' : PAYPAL_API_USERID,
          'X-PAYPAL-SECURITY-PASSWORD' : PAYPAL_API_PASSWORD,
          'X-PAYPAL-SECURITY-SIGNATURE' : PAYPAL_API_SIGNATURE,
          'X-PAYPAL-SERVICE-VERSION' : '1.1.0',
          'X-PAYPAL-APPLICATION-ID' : PAYPAL_API_APPID,
          'X-PAYPAL-REQUEST-DATA-FORMAT' : 'NV',
          'X-PAYPAL-RESPONSE-DATA-FORMAT' : 'NV'
        }
      } ,
      function ( request2, response2, body2 ) {
      	console.log(body2)
        //need to check for errs
        if( String(body2).indexOf('responseEnvelope.ack=Failure') === -1 ) {
          var vars = body2.split('&')
          for (var i = 0; i < vars.length; i++) {
            var pair = vars[i].split("=");
            if (pair[0] == 'preapprovalKey') {
              User.findOne( {'_id' : req.user._id }, function( err, user) {
                user.preapproval_key = pair[1]
                user.save( function ( err ) {
                  if( err ) throw err
                } )
              } )
              res.redirect( 'https://' + PAYPAL_ENDPOINT + '/webscr?cmd=_ap-preapproval&preapprovalkey=' + pair[1] )
            }
          }
        } else {
          res.redirect( '/' )
        }
      }
    )
    
  } else {
    res.redirect('/')
  }
}

function ipn( req, res ) {
  console.log ( 'ipn received' )
  console.log ( req.body )
  res.send()
  request.post( { url: PAYPAL_IPN_ENDPOINT, body: 'cmd=_notify-validate&'+qs.stringify(req.body) },
    function ( err, res, body ) { 
      console.log ( body )
      User.findOne( {'preapproval_key' : req.body.preapproval_key }, function( err, user) {
        if( user ) {
          user.email = req.body.sender_email
          user.save( function ( err ) {
            if( err ) return console.log ( err )
            
            
            
            
            if( user.payments_incoming_pending.length > 0 ) {
              console.log ( 'user has pending incoming payments!!! '+ user.payments_incoming_pending.length )            
              async.forEachSeries( user.payments_incoming_pending, 
                function(data, cb){
                  analyze( data, function ( err, results ) {
                    if ( err ) return console.log ( err )
                    pay( data.user.screen_name, results.to, results.amount, results.type, data, function ( err, msg, from ){ 
                      console.log( msg ) 
                      cb()
                    } )                    
                  } )
                },
                function (err) {
                  if ( err ) console.log ( err )
                  console.log ( 'done with pending incoming payments' )
                  user.payments_incoming_pending = []
                  user.save( function ( err ) {
                    if( err ) throw err
                    //console.log ( user )
                  } )
                }
              )
            }

            if( user.payments_outgoing_pending.length > 0 ) {
              console.log ( 'user has pending outgoing payments!!! '+ user.payments_outgoing_pending.length )            
              async.forEachSeries( user.payments_outgoing_pending, 
                function(data, cb){
                  analyze( data, function ( err, results ) {
                    if ( err ) return console.log ( err )
                    pay( data.user.screen_name, results.to, results.amount, results.type, data, function ( err, msg, from ){ 
                      console.log( msg ) 
                      cb()
                    } )                    
                  } )
                },
                function (err) {
                  if ( err ) console.log ( err )
                  console.log ( 'done with pending outgoing payments' )
                  user.payments_outgoing_pending = []
                  user.save( function ( err ) {
                    if( err ) throw err
                    //console.log ( user )
                  } )
                }
              )
            }            
            
            
            
            
            

          } )
        }
      })
      
    }
  )

}

module.exports = {
  Analyze : analyze
  , Pay : pay
  , Preapproval : preapproval
  , Ipn : ipn 
}