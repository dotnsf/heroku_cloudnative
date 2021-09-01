//. app.js
var express = require( 'express' ),
    axios = require( 'axios' ),
    basicAuth = require( 'basic-auth-connect' ),
    bodyParser = require( 'body-parser' ),
    fs = require( 'fs' ),
    ejs = require( 'ejs' ),
    session = require( 'express-session' ),
    uuidv1 = require( 'uuid/v1' ),
    app = express();

var settings = require( './settings' );

//. env values
var settings_auth0_callback_url = 'AUTH0_CALLBACK_URL' in process.env ? process.env.AUTH0_CALLBACK_URL : settings.auth0_callback_url; 
var settings_auth0_client_id = 'AUTH0_CLIENT_ID' in process.env ? process.env.AUTH0_CLIENT_ID : settings.auth0_client_id; 
var settings_auth0_client_secret = 'AUTH0_CLIENT_SECRET' in process.env ? process.env.AUTH0_CLIENT_SECRET : settings.auth0_client_secret; 
var settings_auth0_domain = 'AUTH0_DOMAIN' in process.env ? process.env.AUTH0_DOMAIN : settings.auth0_domain; 
var settings_bonsai_url = 'BONSAI_URL' in process.env ? process.env.BONSAI_URL : settings.bonsai_url; 
var settings_database_url = 'DATABASE_URL' in process.env ? process.env.DATABASE_URL : settings.database_url; 
var settings_redis_url = 'REDIS_URL' in process.env ? process.env.REDIS_URL : settings.redis_url; 

process.env.PGSSLMODE = 'no-verify';

//. Bonsai Elasticsearch
var bonsai = axios.create({
  baseURL: settings_bonsai_url,
  responseType: 'json'
});

var PG = require( 'pg' );
PG.defaults.ssl = true;
var pg_client = null;
if( settings_database_url ){
  console.log( 'database_url = ' + settings_database_url );
  var pg = new PG.Pool({
    connectionString: settings_database_url,
    idleTimeoutMillis: ( 3 * 86400 * 1000 )
  });
  pg.connect( function( err, client ){
    if( err ){
      console.log( err );
    }else{
      console.log( 'postgresql connected' );
      pg_client = client;
    }
  });
  pg.on( 'error', function( err ){
    console.error( 'on error', err );
    pg.connect( function( err, client ){
      if( err ){
        console.log( err );
      }else{
      console.log( 'postgresql reconnected' );
        pg_client = client;
      }
    });
  });
}

app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

app.set( 'views', __dirname + '/views' );
app.set( 'view engine', 'ejs' );

//. Redis
var redis = require( 'redis' );
var RedisStore = require( 'connect-redis' )( session );
var redisClient = null;
if( settings_redis_url ){
  redisClient = redis.createClient( settings_redis_url, {} );
  console.log( 'redis connected' );
  redisClient.on( 'error', function( err ){
    console.error( 'on error', err );
    redisClient = redis.createClient( settings_redis_url, {} );
  });
}

//. Auth0
var passport = require( 'passport' );
var Auth0Strategy = require( 'passport-auth0' );
var strategy = new Auth0Strategy({
  domain: settings_auth0_domain,
  clientID: settings_auth0_client_id,
  clientSecret: settings_auth0_client_secret,
  callbackURL: settings_auth0_callback_url
}, function( accessToken, refreshToken, extraParams, profile, done ){
  //console.log( accessToken, refreshToken, extraParams, profile );
  profile.idToken = extraParams.id_token;
  return done( null, profile );
});
passport.use( strategy );

passport.serializeUser( function( user, done ){
  done( null, user );
});
passport.deserializeUser( function( user, done ){
  done( null, user );
});

//. Session
var sess = {
  secret: 'HerokuCloudNativeSecret',
  cookie: {
    path: '/',
    maxAge: (7 * 24 * 60 * 60 * 1000)
  },
  resave: false,
  saveUninitialized: true
};
if( redisClient ){
  sess.store = new RedisStore( { client: redisClient } );
}
app.use( session( sess ) );
app.use( passport.initialize() );
app.use( passport.session() );

app.use( function( req, res, next ){
  if( req && req.query && req.query.error ){
    console.log( req.query.error );
  }
  if( req && req.query && req.query.error_description ){
    console.log( req.query.error_description );
  }
  next();
});


//. login
app.get( '/auth0/login', passport.authenticate( 'auth0', {
  scope: settings.auth0_scope
}, function( req, res ){
  res.redirect( '/' );
}));

//. logout
app.get( '/auth0/logout', function( req, res ){
  req.logout();
  res.redirect( '/' );
});

app.get( '/auth0/callback', async function( req, res, next ){
  passport.authenticate( 'auth0', function( err, user ){
    if( err ) return next( err );
    if( !user ) return res.redirect( '/auth0/login' );

    req.logIn( user, function( err ){
      if( err ) return next( err );
      res.redirect( '/' );
    })
  })( req, res, next );
});


app.get( '/', function( req, res ){
  if( !req.user ){ 
    res.redirect( '/auth0/login' );
  }else{
    var user = { id: req.user.id, name: req.user.nickname, email: req.user.displayName, image_url: req.user.picture };
    var sql = "select * from items";
    var query = { text: sql, values: [] };
    pg_client.query( query, function( err, result ){
      if( err ){
        console.log( err );
        res.render( 'index', { user: user, items: [], error: err } );
      }else{
        var items = [];
        if( result.rows.length > 0 ){
          try{
            items = result.rows;
          }catch( e ){
            console.log( e );
          }
        }
        res.render( 'index', { user: user, items: items, search_text: '' } );
      }
    });
  }
});

app.post( '/', function( req, res ){
  if( !req.user ){ 
    res.redirect( '/auth0/login' );
  }else{
    var user = { id: req.user.id, name: req.user.nickname, email: req.user.displayName, image_url: req.user.picture };
    var search_text = req.body.search_text;
    bonsai.get( '/items/_search', { query: { match_phrase: { name: search_text } } }, { 'Content-Type': 'application/json' } ).then( async function( response ){
      //console.log( response.data.hits.hits );
      var items = [];
      if( response.data && response.data.hits && response.data.hits.hits && response.data.hits.hits.length > 0 ){
        for( var i = 0; i < response.data.hits.hits.length; i ++ ){
          var r = response.data.hits.hits[i];
          if( r && r._source ){
            items.push( r._source );
          }
        }
      }
      console.log( items.length, items );
      res.render( 'index', { user: user, items: items, search_text: search_text } );
    }).catch( async function( err ){
      res.render( 'index', { user: user, items: [], search_text: search_text } );
    });

    /*
    var sql = "select * from items";
    var query = { text: sql, values: [] };
    pg_client.query( query, function( err, result ){
      if( err ){
        console.log( err );
        res.render( 'index', { user: user, items: [], error: err } );
      }else{
        var items = [];
        if( result.rows.length > 0 ){
          try{
            items = result.rows;
          }catch( e ){
            console.log( e );
          }
        }
        res.render( 'index', { user: user, items: items, search_text: search_text } );
      }
    });
    */
  }
});

app.get( '/item/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  var id = req.params.id;
  var sql = "select * from items where id = $1";
  var query = { text: sql, values: [ id ] };
  pg_client.query( query, function( err, result ){
    if( err ){
      console.log( err );
      res.status( 400 );
      res.write( JSON.stringify( { status: false, id: id, error: err }, null, 2 ) );
      res.end();
    }else{
      var item = null;
      if( result.rows.length > 0 && result.rows[0].id ){
        try{
          item = result.rows[0];
        }catch( e ){
        }
      }
      res.write( JSON.stringify( { status: true, id: id, item: item }, null, 2 ) );
      res.end();
    }
  });
});

app.post( '/item', async function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );

  if( pg_client ){
    var name = req.body.name;
    var description = req.body.description;
    var image_url = req.body.image_url;
    var price = req.body.price;
    if( typeof price == 'string' ){
      price = parseInt( price );
    }

    var ts = ( new Date() ).getTime();
    var id = uuidv1();

    var sql = "insert into items( id, name, description, price, image_url, created, updated ) values( $1, $2, $3, $4, $5, $6, $7, $8 )";
    var query = { text: sql, values: [ id, name, description, price, image_url, ts, ts ] };
    pg_client.query( query, function( err, result ){
      if( err ){
        console.log( err );
        res.status( 400 );
        res.write( JSON.stringify( { status: false, error: err }, null, 2 ) );
        res.end();
      }else{
        res.write( JSON.stringify( { status: true, id: id }, null, 2 ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, error: 'db is not initialized.' }, null, 2 ) );
    res.end();
  }
});


var port = process.env.PORT || 8080;
app.listen( port );
console.log( "server starting on " + port + " ..." );
