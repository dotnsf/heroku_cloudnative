//. update_bonsai.js
//. スケジューラーで実行して、検索エンジンを最新データに更新する
var axios = require( 'axios' );
var PG = require( 'pg' );
var settings = require( './settings' );

PG.defaults.ssl = true;

//. env values
var settings_bonsai_url = 'BONSAI_URL' in process.env ? process.env.BONSAI_URL : settings.bonsai_url; 
var settings_database_url = 'DATABASE_URL' in process.env ? process.env.DATABASE_URL : settings.database_url; 
process.env.PGSSLMODE = 'no-verify';

//. Bonsai Elasticsearch
var bonsai = axios.create({
  baseURL: settings_bonsai_url,
  responseType: 'json'
});


//. インデックスは作成済み（とみなす）
//. インデックス削除 : $ curl -XDELETE https://username:password@xxxxxxxx.us-east-1.bonsaisearch.net:443/items
//. インデックス作成 : $ curl -XPUT https://username:password@xxxxxxxx.us-east-1.bonsaisearch.net:443/items -d @items_index.json -H 'Content-Type: application/json'
//. インデックス確認 : $ curl -XGET https://username:password@xxxxxxxx.us-east-1.bonsaisearch.net:443/items

//. データ挿入後の動作確認例 : $ curl -XGET https://username:password@xxxxxxxx.us-east-1.bonsaisearch.net:443/items/_search -d '{"query":{"match_phrase":{"name":"ニールズヤード"}}}' -H 'Content-Type: application/json'


//. 現在のインデックスを削除
bonsai.delete( '/items', {}, { 'Content-Type': 'application/json' } ).then( async function( response0 ){
  //console.log( { response0 } );
  //. インデックスを作成
  bonsai.put( '/items', { settings: { analysis: { analyzer: { my_kuromoji_analyzer: { type: "custom", tokenizer: "kuromoji_tokenizer" } } } } }, { 'Content-Type': 'application/json' } ).then( async function( response1 ){
    await insertNewData();
    process.exit( 0 );
  }).catch( async function( err1 ){
    process.exit( 1 );
  });
}).catch( async function( err0 ){
  //console.log( { err0 } );
  //. インデックスを作成
  bonsai.put( '/items', { settings: { analysis: { analyzer: { my_kuromoji_analyzer: { type: "custom", tokenizer: "kuromoji_tokenizer" } } } } }, { 'Content-Type': 'application/json' } ).then( async function( response1 ){
    await insertNewData();
    process.exit( 0 );
  }).catch( async function( err1 ){
    process.exit( 1 );
  });
});

//. 最新データを取得して挿入
async function insertNewData(){
  return new Promise( async function( resolve, reject ){
    //. DB 接続
    if( settings_database_url ){
      //console.log( 'database_url = ' + settings_database_url );
      var pg = new PG.Pool({
        connectionString: settings_database_url
      });
      pg.connect( function( err, client ){
        if( err ){
          console.log( err );
          reject( err );
        }else{
          //console.log( 'postgresql connected' );

          //. 最新データ取得
          var sql = "select * from items";
          var query = { text: sql, values: [] };
          var items = null;
          client.query( query, function( err, result ){
            if( err ){
              console.log( err );
            }else{
              if( result.rows.length > 0 ){
                try{
                  items = result.rows;
                }catch( e ){
                  console.log( e );
                }
              }

              if( items && items.length > 0 ){
                var postdata = '';
                //. application/x-ndjson 形式で最新データ挿入
                for( var i = 0; i < items.length; i ++ ){
                  postdata += '{"index":{"_index":"items"}}\n';
                  postdata += JSON.stringify( items[i] ) + '\n\n';
                }
                bonsai.post( '/items/_bulk', postdata, { headers: { 'Content-Type': 'application/x-ndjson' } } ).then( function( response ){
                  console.log( response );
                  console.log( "done." );
                  resolve( true );
                }).catch( function( err ){
                  console.log( err );
                  resolve( true );
                });
              }else{
                reject( null );
              }
            }
          });
        }
      });
    }else{
      reject( 'No DATABASE_URL set' );
    }
  });
}
