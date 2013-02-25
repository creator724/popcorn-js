
var testData = {

  videoSrc: "http://www.dailymotion.com/video/xvttqn_man-of-steel-superman-official-trailer-2_shortfilms?start=8#.USvpAut4aTY",
  shortVideoSrc: "http://www.dailymotion.com/video/xq7vfa",
  expectedDuration: 152,

  createMedia: function( id ) {
    return Popcorn.HTMLDailymotionVideoElement( id );
  },

  // We need to test YouTube's URL params, which not all
  // wrappers mimic.  Do it as a set of tests specific
  // to YouTube.
  playerSpecificAsyncTests: function() {
  }
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
