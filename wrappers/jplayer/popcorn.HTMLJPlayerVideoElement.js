(function ( window, Popcorn, undefined ) {
  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // The min height for jPlayer seems to be 480x298
  MIN_WIDTH = 480,
  MIN_HEIGHT = 298,
  JQUERY_SCRIPT_URL = "//ajax.googleapis.com/ajax/libs/jquery/1.8/jquery.min.js",
  JPLAYER_SCRIPT_URL = "//www.jplayer.org/2.2.0/js/jquery.jplayer.min.js",
  JPLAYER_SWF_URL = "http://www.jplayer.org/2.2.0/js",
  jqueryScriptElement,
  jplayerScriptElement,
  apiReadyCallbacks = [],
  srcExtensions = "",
  jPlayer,

  validMediaTypes = {
    mp3: {
      codec: 'audio/mpeg; codecs="mp3"',
      flashCanPlay: true
    },
    m4a: { // AAC / MP4
      codec: 'audio/mp4; codecs="mp4a.40.2"',
      flashCanPlay: true
    },
    oga: { // OGG
      codec: 'audio/ogg; codecs="vorbis"',
      flashCanPlay: false
    },
    wav: { // PCM
      codec: 'audio/wav; codecs="1"',
      flashCanPlay: false
    },
    webma: { // WEBM
      codec: 'audio/webm; codecs="vorbis"',
      flashCanPlay: false
    },
    fla: { // FLV / F4A
      codec: 'audio/x-flv',
      flashCanPlay: true
    },
    rtmpa: { // RTMP AUDIO
      codec: 'audio/rtmp; codecs="rtmp"',
      flashCanPlay: true
    },
    m4v: { // H.264 / MP4
      codec: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
      flashCanPlay: true
    },
    ogv: { // OGG
      codec: 'video/ogg; codecs="theora, vorbis"',
      flashCanPlay: false
    },
    webmv: { // WEBM
      codec: 'video/webm; codecs="vorbis, vp8"',
      flashCanPlay: false
    },
    flv: { // FLV / F4V
      codec: 'video/x-flv',
      flashCanPlay: true
    },
    rtmpv: { // RTMP VIDEO
      codec: 'video/rtmp; codecs="rtmp"',
      flashCanPlay: true
    }
  },
  readyStates = [
    //HAVE_NOTHING = 0
    [ "loadstart" ],

    //HAVE_METADATA = 1
    [ "durationchange", "loadedmetadata" ],

    //HAVE_CURRENT_DATA = 2
    [ "loadeddata" ],

    //HAVE_FUTURE_DATA = 3
    [ "loadeddata", "canplay" ],

    //HAVE_ENOUGH_DATA = 4
    [ "canplaythrough" ]
  ];

  // Utility function to check if the neccessary APIs have been loaded
  function isJPlayerReady() {
    if ( ( window.$ || window.jQuery ) && ( window.$.jPlayer || window.jQuery.jPlayer ) ) {
      jPlayer = window.jQuery.jPlayer;
      return true;
    }
    return false;
  }

  function apiReadyPromise( fn ) {
    // JPlayer doesn't notify us when the script has loaded so we have to do poll
    // and check for existance of `jPlayer` on the jQuery object
    function checkAPIReady() {
      if ( isJPlayerReady() ) {
        while ( apiReadyCallbacks.length ) {
          ( apiReadyCallbacks.shift() )();
        }
        return;
      }
      setTimeout( checkAPIReady, 10 );
    }

    // Utility function to inject the JPlayer script
    function injectJPlayerScript() {
      if ( !window.$ || !window.jQuery ) {
        setTimeout( injectJPlayerScript, 10 );
        return;
      }
      jplayerScriptElement = document.createElement( "script" );
      jplayerScriptElement.async = true;
      jplayerScriptElement.src = JPLAYER_SCRIPT_URL;

      document.head.appendChild( jplayerScriptElement );
      jPlayer = window.jQuery.jPlayer;
    }

    if ( isJPlayerReady() ) {
      jPlayer = window.jQuery.jPlayer;
      fn();
      return;
    }

    if ( !jqueryScriptElement ) {
      // Since JPlayer requires jQuery, inject it into our page
      jqueryScriptElement = document.createElement( "script" );
      jqueryScriptElement.async = true;
      jqueryScriptElement.src = JQUERY_SCRIPT_URL;

      document.head.appendChild( jqueryScriptElement );
      injectJPlayerScript();
    } else if ( !jplayerScriptElement ) {
      injectJPlayerScript();
    }

    if ( !apiReadyCallbacks.length ) {
      setTimeout( checkAPIReady, 10 );
    }
    apiReadyCallbacks.push(fn);
  }

  function findExistingPlayer( obj ) {
    if ( !isJPlayerReady() || typeof obj === "string" ) {
      return false;
    }

    obj = $( obj );

    return obj.data &&
           obj.data( "jPlayer" ) &&
           jPlayer.prototype.instances[ obj.data( 'jPlayer' ).internal.instance ];
  }

  function HTMLJPlayerVideoElement( id ) {

    var self = this,
      parent = typeof id === "string" ? Popcorn.dom.find( id ) : id,
      impl = {
        src: EMPTY_STRING,
        networkState: self.NETWORK_EMPTY,
        readyState: self.HAVE_NOTHING,
        seeking: false,
        autoplay: EMPTY_STRING,
        preload: EMPTY_STRING,
        controls: false,
        loop: false,
        poster: EMPTY_STRING,
        volume: 1,
        muted: 0,
        currentTime: 0,
        duration: NaN,
        ended: false,
        paused: true,
        width: parent.width|0   ? parent.width  : MIN_WIDTH,
        height: parent.height|0 ? parent.height : MIN_HEIGHT,
        error: null,
        progressAmount: null
      },
      maxReadyState = 0,
      existingPlayer,
      playEventPending = false,
      playingEventPending = false,
      playerReady = false,
      player,
      playerObject,
      playerReadyCallbacks = [],
      stalledTimeout,
      eventCallbacks = {};

    function playerReadyPromise( fn, unique ) {
      var i;
      if ( playerReady ) {
        fn();
        return;
      }

      if ( unique ) {
        i = playerReadyCallbacks.indexOf( fn );
        if (i >= 0) {
          playerReadyCallbacks.splice( i, 1 );
        }
      }
      playerReadyCallbacks.push( fn );
    }

    function registerEventListener( name, src, dest ) {
      var callback;

      //no duplicates, just in case
      callback = eventCallbacks[ name ];
      if ( callback ) {
        player.off( jPlayer.event[ name ], callback );
      }

      if ( typeof src === 'string' ) {
        callback = function() {
          var playerObject = $( this ).data( "jPlayer" ),
              val = playerObject.status[ dest || src ];
          if ( impl[ src ] !== val ) {
            impl[ src ] = val;
            self.dispatchEvent( name );
          }
        };
      } else if ( typeof src === 'function' ) {
        callback = function ( evt ) {
          if ( src.apply( this, evt ) ) {
            self.dispatchEvent( name );
          }
        };
      } else {
        callback = function () {
          self.dispatchEvent( name );
        };
      }

      eventCallbacks[ name ] = callback;
      player.on( jPlayer.event[ name ], callback );
    }

    function removeEventListeners() {
      Popcorn.forEach( eventCallbacks, function ( name, callback ) {
        player.off( jPlayer.event[ name ], callback );
      } );
    }

    function setReadyState( state ) {
      var i, queue;

      if ( state <= impl.readyState ) {
        return;
      }

      maxReadyState = Math.max( maxReadyState, state );
      if ( state - impl.readyState > 1 ) {
        return;
      }

      impl.readyState++;
      queue = readyStates[ impl.readyState ];
      for ( i = 0; i < queue.length; i++ ) {
        self.dispatchEvent( queue[ i ] );
      }
      setReadyState( maxReadyState );
    }

    function destroyPlayer() {

      clearTimeout( stalledTimeout );

      if( !( playerReady && player ) ) {
        return;
      }

      removeEventListeners();


      if ( !existingPlayer ) {
        player.jPlayer( "pause" );

        try {
          player.jPlayer( "destroy" );
        } catch (e) {}
      }

      player = null;
      playerObject = null;
      existingPlayer = null;
      parent = null;
      playerReady = false;
    }

    function onDurationChange() {
      var po;
      if ( this.status ) {
        po = this;
      } else {
        po = $( this ).data( "jPlayer" );
      }

      impl.duration = po.status.duration;
      if ( impl.readyState < self.HAVE_METADATA ) {
        setReadyState( self.HAVE_METADATA );
      } else {
        self.dispatchEvent( "durationchange" );
      }

      if ( playEventPending ) {
        self.dispatchEvent( "play" );
      }

      if ( playingEventPending ) {
        playingEventPending = false;
        self.dispatchEvent( "playing" );
      }

      if ( playEventPending ) {
        playEventPending = false;
        if ( impl.paused ) {
          self.dispatchEvent( "pause" );
        }
      }
    }

    function onStalled() {
      if ( !impl.duration || impl.progressAmount < impl.duration ) {
          impl.networkState = self.NETWORK_IDLE;
          self.dispatchEvent( "stalled" );
      } else {
        monitorStalled();
      }
    }

    function monitorStalled() {
      // if progress doesn't happen for 3 seconds, fire "stalled" event

      clearTimeout( stalledTimeout );
      stalledTimeout = setTimeout( onStalled, 3000 );
    }

    function updateSize() {
      var container = playerObject.ancestorJq[ 0 ],
          video = playerObject.internal.domNode;

      container.style.width = impl.width;
      video.style.width = impl.width;
      container.style.height = impl.height;
      video.style.height = impl.height;
    }

    function changeSrc( aSrc ) {

      function isJPlayerObject() {
        return isJPlayerReady() && typeof aSrc === "object" && jPlayer.prototype.instances[ aSrc.data( "jPlayer" ).internal.instance ];
      }
      // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-video-element.html#media-element-load-algorithm

      if ( !isJPlayerObject() ) {
        destroyPlayer();
      }

      impl.readyState = -1;
      maxReadyState = -1;
      playEventPending = false;
      playingEventPending = false;

      if ( impl.networkState !== self.NETWORK_EMPTY ) {
        if ( impl.networkState === self.NETWORK_LOADING || impl.networkState === self.NETWORK_IDLE ) {
          self.dispatchEvent( "abort" );
        }
        self.dispatchEvent( "emptied" );
      }

      if ( !impl.paused ) {
        if ( playerReady ) {
          player.jPlayer( "pause" );
        }
        impl.paused = false;
      }

      impl.seeking = false;

      impl.duration = NaN;

      if ( impl.currentTime ) {
        impl.currentTime = 0;
        self.dispatchEvent( "timeupdate" );
      }

      impl.error = null;

      // technically, an empty src should fire MEDIA_ERR_SRC_NOT_SUPPORTED
      // but we allow it for now as a way to clean up the player
      if ( !aSrc ) {
        impl.readyState = self.HAVE_NOTHING;
        return;
      }

      // begin "resource fetch algorithm", set networkState to NETWORK_IDLE and fire "suspend" event

      if ( isJPlayerObject() ) {
        impl.src = player.data( "jPlayer" ).status.src;
      } else {
        impl.src = aSrc;
      }

      impl.networkState = self.NETWORK_LOADING;
      setReadyState( self.HAVE_NOTHING );

      apiReadyPromise( function() {
        if ( !impl.src ) {
          if ( player ) {
            destroyPlayer();
          }
        }

        if ( !player && !self._canPlaySrc( aSrc ) ) {
          impl.error = {
            name: "MediaError",
            message: "Media Source Not Supported",
            code: window.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          };
          impl.networkState = self.NETWORK_NO_SRC;
          self.dispatchEvent( "error" );
          return;
        }

        // Since everything is done using jQuery in jPlayer, we will make our player === elem
        if ( !player ) {
          player = $( parent );
        } else {
          playerReady = true;
          playerObject = player.data( "jPlayer" );

          while ( playerReadyCallbacks.length ) {
            ( playerReadyCallbacks.shift() )();
          }
        }

        player.css({
          "position": "relative"
        });

        player.jPlayer({
          "ready": function() {
            var srcObj = {},
                extensions = srcExtensions.split( "," );

            playerReady = true;

            playerObject = player.data( "jPlayer" );
            // Since we accept a source in various formats, we need to split them
            // up and create an object the JPlayer can work with
            if ( Array.isArray( impl.src ) ) {
              for ( var i = 0, l = impl.src.length; i < l; i++ ) {
                srcObj[ extensions[ i ] ] = impl.src[ i ].src;
              }
            } else if ( typeof impl.src === "object" ) {
                srcObj[ srcExtensions ] = impl.src.src;
            } else {
              srcObj[ srcExtensions ] = impl.src;
            }

            player.jPlayer( "setMedia", srcObj );

            if ( impl.autoplay ) {
              player.jPlayer( "play" );
            }

            while ( playerReadyCallbacks.length ) {
              ( playerReadyCallbacks.shift() )();
            }
          },
          "loop": !!impl.loop,
          "size": {
            "width": impl.width,
            "height": impl.height
          },
          "swfPath": JPLAYER_SWF_URL,
          "solution": "html, flash",
          "supplied": srcExtensions
        });

        playerReadyPromise( function () {
          // set up event listeners
          registerEventListener( "error" );

          monitorStalled();

          registerEventListener( "progress", function () {
            var playerObject = $( this ).data( "jPlayer" );
            if ( !impl.duration && playerObject.status.duration ) {
              onDurationChange.call( playerObject );
            }

            impl.progressAmount = playerObject.status.seekPercent;
            impl.progressAmount = Math.max( impl.progressAmount, playerObject.status.currentTime );

            setReadyState( self.HAVE_CURRENT_DATA );

            if ( impl.progressAmount >= impl.duration ) {
              impl.networkState = self.NETWORK_IDLE;
              setReadyState( self.HAVE_CURRENT_DATA );
              setReadyState( self.HAVE_FUTURE_DATA );
              setReadyState( self.HAVE_ENOUGH_DATA );
            } else {
              impl.networkState = self.NETWORK_LOADING;
              monitorStalled();
            }
            return true;
          } );

          registerEventListener( "stalled", onStalled );

          registerEventListener( "timeupdate", "currentTime" );
          registerEventListener( "durationchange", onDurationChange );

          registerEventListener( "volumechange", function() {
            var playerObject = $( this ).data( "jPlayer" ),
                volume = playerObject.options.volume,
                muted = playerObject.options.muted;

            if ( impl.volume !== volume || impl.muted !== muted ) {
              impl.volume = volume;
              impl.muted = muted;
              return true;
            }
          } );

          registerEventListener( "canplay", function () {
            if ( !impl.duration && playerObject.status.duration ) {
              onDurationChange.call( playerObject );
            }

            setReadyState( self.HAVE_CURRENT_DATA );
            setReadyState( self.HAVE_FUTURE_DATA );
          } );

          registerEventListener( "canplaythrough", function () {
            setReadyState( self.HAVE_ENOUGH_DATA );
          } );

          registerEventListener( "play", function () {
            if ( impl.paused ) {
              impl.paused = false;
              if ( !impl.duration) {
                playEventPending = true;
              } else {
                return true;
              }
            }
          } );

          registerEventListener( "seeking" , function () {
            impl.seeking = true;
            return true;
          } );

          registerEventListener( "seeked" , function () {
            if ( impl.seeking ) {
              impl.seeking = false;
              return true;
            }
          } );

          registerEventListener( "playing", function () {
            if ( !impl.duration && playerObject.status.duration ) {
              onDurationChange.call( playerObject );
            }

            if ( !impl.duration ) {
              playingEventPending = true;
              return false;
            }
            setReadyState( self.HAVE_CURRENT_DATA );
            setReadyState( self.HAVE_FUTURE_DATA );

            if ( impl.seeking ) {
              impl.seeking = false;
              self.dispatchEvent( "seeked" );
            }

            return true;
          } );

          registerEventListener( "pause", function () {
            if ( !impl.paused ) {
              //if ( impl.loop && player.currentTime >= impl.duration ) {
              //  return false;
              //}
              impl.paused = true;
              return !!impl.duration;
            }
          } );

          registerEventListener( "ended", function () {
            impl.ended = true;
            return true;
          });
        });
      }, true );
    }

    function setVolume() {
      player.jPlayer( "unmute" );
      impl.muted = 0;
      player.jPlayer( "volume", impl.volume );
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted() {
      if ( !impl.muted ) {
        player.jPlayer( "unmute" );
      } else {
        player.jPlayer( "mute" );
      }
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function setCurrentTime() {
      if ( impl.paused ) {
        player.jPlayer( "pause", impl.currentTime );
      } else {
        player.jPlayer( "play", impl.currentTime );
      }
    }

    existingPlayer = findExistingPlayer( parent );

    if ( existingPlayer ) {
      player = existingPlayer;
      changeSrc( existingPlayer );
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLJPlayerVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as JPlayer
    self._util.type = "JPlayer";

    self._util.destroy = function () {
      destroyPlayer();
    };

    self.play = function () {
      function play() {
        impl.paused = true;
        player.jPlayer( "play" );
      }

      playerReadyPromise(play, true);
    };

    self.pause = function () {
      function pause() {
        player.jPlayer( "pause" );
      }

      playerReadyPromise(pause, true);
    };

    self.load = function () {
      changeSrc( impl.src );
    };

    Object.defineProperties( self, {

      src: {
        get: function() {
          return impl.src;
        },
        set: function( aSrc ) {
          if ( aSrc !== impl.src ) {
            changeSrc( aSrc );
          }
        }
      },

      autoplay: {
        get: function() {
          return impl.autoplay;
        },
        set: function( aValue ) {
          impl.autoplay = self._util.isAttributeSet( aValue );
        }
      },

      loop: {
        get: function() {
          return impl.loop;
        },
        set: function( aValue ) {
          impl.loop = self._util.isAttributeSet( aValue );
        }
      },

      controls: {
        get: function() {
          return impl.controls;
        },
        set: function( aValue ) {
          impl.controls = self._util.isAttributeSet( aValue );
        }
      },

      width: {
        get: function() {
          return player && player.width() || impl.width;
        },
        set: function( aValue ) {
          impl.width = aValue;
          playerReadyPromise( updateSize );
        }
      },

      height: {
        get: function() {
          return player && player.height() || impl.height;
        },
        set: function( aValue ) {
          impl.height = aValue;
          playerReadyPromise( updateSize );
        }
      },

      currentTime: {
        get: function() {
          return player && playerObject.status.currentTime || 0;
        },
        set: function( aValue ) {
          aValue = parseFloat( aValue );
          /*
          if( !impl.duration || aValue < 0 || impl.duration > 1 || isNaN( aValue ) ) {
            throw "Invalid currentTime";
          }
          */

          impl.currentTime = aValue;
          playerReadyPromise( setCurrentTime, true );
        }
      },

      currentSrc: {
        get: function() {
          return impl.src;
        }
      },

      duration: {
        get: function() {
          return impl.duration;
        }
      },

      ended: {
        get: function() {
          return impl.ended;
        }
      },

      paused: {
        get: function() {
          return impl.paused;
        }
      },

      seeking: {
        get: function() {
          return impl.seeking;
        }
      },

      readyState: {
        get: function() {
          return impl.readyState;
        }
      },

      networkState: {
        get: function() {
          return impl.networkState;
        }
      },

      volume: {
        get: function() {
          return getVolume();
        },
        set: function( aValue ) {
          aValue = parseFloat( aValue );
          if( aValue < 0 || aValue > 1 || isNaN( aValue ) ) {
            throw "Volume value must be between 0.0 and 1.0";
          }

          impl.volume = aValue;
          playerReadyPromise( setVolume, true );
        }
      },

      muted: {
        get: function() {
          return getMuted();
        },
        set: function( aValue ) {
          impl.muted = self._util.isAttributeSet( aValue ) && 1 || 0;
          playerReadyPromise( setMuted, true );
        }
      },

      error: {
        get: function() {
          return impl.error;
        }
      }
    } );
  }

  HTMLJPlayerVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLJPlayerVideoElement.prototype.constructor = HTMLJPlayerVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLJPlayerVideoElement.prototype._canPlaySrc = function( source ) {
    if ( findExistingPlayer( source ) ) {
      return "probably";
    }

    var testVideo = document.createElement( "video" ),
        canPlayHTML,
        canPlayFlash,
        extension,
        extensionIdx,
        mediaTypeObj,
        i,
        l,
        // The extension types jPlayer uses seem to be slightly different so lets make
        // sure we conform to what they are doing.
        jPlayerExtensions = {
          "webm": "webmv",
          "mp4": "m4v",
          "ogg": "ogv"
        };

    // url can be array or obj, make lookup table
    // Try HTML5 audio/video types first, if it can't play, attempt to fallback to flash
    if ( Array.isArray( source ) ) {
      for ( i = 0, l = source.length; i < l; i++ ) {
        canPlayHTML = testVideo.canPlayType( source[ i ].type ) ? "probably" : EMPTY_STRING;
        extension = source[ i ].type.split( "/" )[ 0 ];
        extension = jPlayerExtensions[ extension ] || extension;
        canPlayFlash = validMediaTypes[ extension ].flashCanPlay;

        if ( canPlayHTML || canPlayFlash ) {
          srcExtensions += extension + ", ";
          break;
        }
      }
      return ( canPlayHTML || canPlayFlash );
    } else if ( typeof source === "object" ) {
      if ( !source.type || typeof source.type !== "string" ) {
        return EMPTY_STRING;
      }
      canPlayHTML = testVideo.canPlayType( source.type ) ? "probably" : EMPTY_STRING;
      extension = source.type.split( "/" )[ 1 ];
      extension = jPlayerExtensions[ extension ] || extension;
      canPlayFlash = validMediaTypes[ extension ].flashCanPlay;

      if ( canPlayHTML || canPlayFlash ) {
        srcExtensions = extension;
        return "probably";
      } else {
        return EMPTY_STRING;
      }
    } else if ( typeof source === "string" ) {
      extensionIdx = source.lastIndexOf( "." );

      extension = source.substr( extensionIdx + 1, source.length - extensionIdx );
      extension = jPlayerExtensions[ extension ] || extension;
      mediaTypeObj = validMediaTypes[ extension ];

      if ( !mediaTypeObj ) {
        return EMPTY_STRING;
      }

      canPlayHTML = testVideo.canPlayType( mediaTypeObj.codec ) ? "probably" : EMPTY_STRING;
      canPlayFlash = mediaTypeObj.flashCanPlay;

      if ( canPlayHTML || canPlayFlash ) {
        srcExtensions = extension;
        return "probably";
      } else {
        return EMPTY_STRING;
      }
    } else {
      return EMPTY_STRING;
    }
  };

  HTMLJPlayerVideoElement.prototype.canPlayType = function( type ) {
    var testVideo = document.createElement( "video" ),
        canPlay = false,
        extension;

    for ( extension in validMediaTypes ) {
      if ( validMediaTypes[ extension ].codec === type ) {
        canPlay = true;
        break;
      }
    }

    return testVideo.canPlayType( type ) || canPlay ? "probably" : EMPTY_STRING;
  };

  Popcorn.HTMLJPlayerVideoElement = function( id ) {
    return new HTMLJPlayerVideoElement( id );
  };

  Popcorn.HTMLJPlayerVideoElement._canPlaySrc = HTMLJPlayerVideoElement.prototype._canPlaySrc;

}( this, this.Popcorn ));
/*
## readyState reference ##

impl.duration > 0
- readyState: HAVE_METADATA
  - durationchange
  - loadedmetadata

first progress event
- readyState: HAVE_CURRENT_DATA
  - loadeddata

canplay event (or playing)
- readyState: HAVE_FUTURE_DATA
  - loadeddata
  - canplay

canplaythrough or progressAmount >= duration
- readyState: HAVE_ENOUGH_DATA
  - canplaythrough
*/
