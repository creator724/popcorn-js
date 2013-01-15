
var players = {},
  testData = {

  videoSrc: "../../test/trailer.mp4",
  shortVideoSrc: "http://media.w3.org/2010/05/sintel/trailer.mp4",
  expectedDuration: 65,

  createMedia: function( id ) {
    var wrapper = Popcorn.HTMLJWPlayerVideoElement( id );
    players[QUnit.config.current.testName] = wrapper;
    return wrapper;
  },
  playerSpecificAsyncTests: function() {
    var video;
    //asyncTest( "JWPlayer 01 - JWPlayer wrapper can be created with JWPlayer object", 1, function() {
      //var elem = document.createElement( "video" ),
          //parent = document.getElementById( "video" );

      //elem.src = testData.videoSrc;
      //parent.appendChild( elem );

      //_V_( elem ).ready(function() {
        //video = testData.createMedia( this );

        //video.addEventListener( "play", function playListener() {
          //video.removeEventListener( "play", playListener, false );
          //ok( true, "JWPlayer wrapper created using JWPlayer object" );
          //parent.removeChild( parent.children[ 0 ] );
          //video.pause();
          //start();
        //}, false );
        //video.play();
      //});
    //});

    //asyncTest( "JWPlayer 02 - destroying a JWPlayer wrapper created with a JWPlayer object does not remove the video", 1, function() {
      //var elem = document.createElement( "video" ),
          //parent = document.getElementById( "video" );

      //elem.src = testData.videoSrc;
      //parent.appendChild( elem );

      //_V_( elem ).ready(function() {
        //video = testData.createMedia( this );

        //console.log( video );
        //video._util.destroy();
        //equal( parent.children[ 0 ].children[ 0 ], elem, "Video element still exists after being destroyed" );
        //start();
      //});
    //});
  }
};

var qunitStart = start;
start = function() {
  // Give the video time to finish loading so callbacks don't throw
  var wrapper = players[QUnit.config.current.testName];
  delete players[QUnit.config.current.testName];

  if (wrapper && wrapper._util && wrapper._util.destroy) {
    wrapper._util.destroy();
  } else {
    var video = document.querySelector( "#video" );
    while( video.hasChildNodes() ) {
      video.removeChild( video.lastChild );
    }
  }
  qunitStart();
};
