
var testData = {

  videoSrc: "http://video-js.zencoder.com/oceans-clip.mp4",
  expectedDuration: 151,

  createMedia: function( id ) {
    return Popcorn.HTMLVideojsVideoElement( id );
  },
  };

// YouTube tends to fail when the iframes live in the qunit-fixture
// div. Simulate the same effect by deleting all iframes under #video
// after each test ends.
var qunitStart = start;
start = function() {
  // Give the video time to finish loading so callbacks don't throw
  setTimeout( function() {
    qunitStart();
    var video = document.querySelector( "#video" );
    while( video.hasChildNodes() ) {
      video.removeChild( video.lastChild );
    }
  }, 500 );
};
