(function ( window, Popcorn, undefined ) {

  "use strict";

  window.testData = {

    videoSrc: "http://www.dailymotion.com/embed/video/xvnehg",
    expectedDuration: 66,

    createMedia: function( id ) {
      return Popcorn.HTMLDailymotionVideoElement( id );
    }

  };

  // Vimeo tends to fail when the iframes live in the qunit-fixture
  // div. Simulate the same effect by deleting all iframes under #video
  // after each test ends.
  var qunitStart = window.start;
  window.start = function() {
    // Give the video time to finish loading so callbacks don't throw
    setTimeout( function() {
      qunitStart();
      var video = document.querySelector( "#video" );
      while( video.hasChildNodes() ) {
        video.removeChild( video.lastChild );
      }
    }, 500 );
  };

}( this, this.Popcorn ));