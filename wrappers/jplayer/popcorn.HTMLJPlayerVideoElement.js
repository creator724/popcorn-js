(function ( window, Popcorn, undefined ) {
  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  JQUERY_SCRIPT_URL = "//ajax.googleapis.com/ajax/libs/jquery/1.8/jquery.min.js",
  JPLAYER_SCRIPT_URL = "//www.jplayer.org/2.2.0/js/jquery.jplayer.min.js",
  JPLAYER_SWF_URL = "http://www.jplayer.org/2.2.0/js/",
  jqueryScriptElement,
  jplayerScriptElement,
  apiReadyCallbacks = [],
  srcExtensions = "",

  htmlMode,

  validVideoTypes = {
    "mp4": {
      "type": "video/mp4"
    },
    "ogv": {
      "type": "video/ogg"
    },
    "webm": {
      "type": "video/webm"
    },
    "m4v": {
      "type": "videp/m4v"
    },
    "x-jplayer": {
      "type": "video/x-jplayer"
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
    return $ && $.jPlayer;
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
      jplayerScriptElement = document.createElement( "script" );
      jplayerScriptElement.async = true;
      jplayerScriptElement.src = JPLAYER_SCRIPT_URL;

      document.head.appendChild( jplayerScriptElement );
    }

    if ( isJPlayerReady() ) {
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

  function findExistingVideoJSPlayer( obj ) {
    var id, byName, player;

    if ( !isJPlayerReady() || !obj ) {
      return false;
    }

    //byName = typeof obj === 'string';
    //id = byName ? obj : obj.id;

    //player = _V_.players[ id ];
    //if ( player && ( byName || obj === player ) ) {
      //return player;
    //}

    //if ( typeof obj !== 'object' || typeof obj.techGet !== 'function' ) {
      //return false;
    //}

    //for ( id in _V_.players ) {
      //if ( _V_.players.hasOwnProperty( id ) && _V_.players[ id ] === obj ) {
        //return _V_.players[ id ];
      //}
    //}
    return false;
  }

  function HTMLJPlayerVideoElement( id ) {

    var self = this,
      parent = typeof id === "string" ? Popcorn.dom.find( id ) : id,
      elem,
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
        player.removeEvent( name, callback );
      }

      if ( typeof src === 'string' ) {
        callback = function() {
          var val = player[ dest || src ];
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
      player.addEvent( name, callback );
    }

    function removeEventListeners() {
      Popcorn.forEach( eventCallbacks, function ( name, callback ) {
        player.removeEvent( name, callback );
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
        player.pause();

        try {
          player.jPlayer( "destroy" );
        } catch (e) {}
      }

      existingPlayer = null;
      player = null;
      parent = null;
      playerReady = false;
      elem = null;
    }

    function onDurationChange() {
      impl.duration = player.duration();
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
      player.width( impl.width );
      player.height( impl.height );
    }

    function changeSrc( aSrc ) {

      // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-video-element.html#media-element-load-algorithm

      destroyPlayer();

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
          player.pause();
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

      if ( existingPlayer ) {
        aSrc = impl.src = existingPlayer.tag.src;
      } else {
        impl.src = aSrc;
      }

      impl.networkState = self.NETWORK_LOADING;
      setReadyState( self.HAVE_NOTHING );

      apiReadyPromise( function() {
        var sourceElem;

        if ( !impl.src ) {
          if ( player ) {
            destroyPlayer();
          }
        }

        player = existingPlayer;

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

        if ( !elem ) {
          /*elem = document.createElement( "video" );

          elem.width = impl.width;
          elem.setAttribute( "class", "video-js vjs-default-skin" );
          elem.height = impl.height;
          elem.loop = impl.loop;
          elem.preload = "auto";
          elem.autoplay = impl.autoplay;
          // Seems that videojs needs the controls to always be present
          elem.controls = true;

          parent.appendChild( elem );*/
        }

        // Since everything is done using jQuery in jPlayer, we will make our player === elem
        if ( !player ) {
          player = $( parent );
        }

        player.jPlayer({
          "ready": function() {
            var srcObj = {},
                extensions = srcExtensions.split( "," );

            playerReady = true;

            // Since we accept a source in various formats, we need to split them
            // up and create an object the JPlayer can work with
            if ( Array.isArray( impl.src ) ) {
              for ( var i = 0, l = impl.src.length; i < l; i++ ) {
                srcObj[ exntensions[ i ] ] = impl.src[ i ].src;
              }
            } else if ( typeof impl.src === "object" ) {
                srcObj[ srcExtensions ] = impl.src.src;
            } else {
              srcObj[ srcExtensions ] = impl.src;
            }

            player.jPlayer( "setmedia", srcObj );

            while ( playerReadyCallbacks.length ) {
              ( playerReadyCallbacks.shift() )();
            }
          },
          "size": {
            "width": impl.width + "px",
            "height": impl.height + "px"
          },
          "swfPath": JPLAYER_SWF_URL,
          "solution": "html, flash",
          "supplied": srcExtensions,
        });

        playerReadyPromise( function () {
          // set up event listeners
          registerEventListener( "error" );

          monitorStalled();

          registerEventListener( "progress", function () {
            if ( !impl.duration && player.duration() ) {
              onDurationChange();
            }

            impl.progressAmount = player.buffered().end();
            impl.progressAmount = Math.max( impl.progressAmount, player.currentTime() );

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
            var volume = player.volume(),
              muted = player.muted();

            if ( impl.volume !== volume || impl.muted !== muted ) {
              impl.volume = volume;
              impl.muted = muted;
              return true;
            }
          } );

          registerEventListener( "canplay", function () {
            if ( !impl.duration && player.duration() ) {
              onDurationChange();
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
            if ( !impl.duration && player.duration() ) {
              onDurationChange();
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
      player.volume( impl.muted > 0 ? 0 : impl.volume );
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted() {
      player.muted( impl.muted );
      setVolume();
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function setCurrentTime() {
      player.currentTime( impl.currentTime );
    }

    existingPlayer = findExistingVideoJSPlayer( parent );
    if ( existingPlayer ) {
      // TODO Figure out how to handle existing players in jPlayer
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
        player.play();
      }

      playerReadyPromise(play, true);
    };

    self.pause = function () {
      function pause() {
        player.pause();
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
          return elem && elem.width || impl.width;
        },
        set: function( aValue ) {
          impl.width = aValue;
          playerReadyPromise( updateSize );
        }
      },

      height: {
        get: function() {
          return elem && elem.height || impl.height;
        },
        set: function( aValue ) {
          impl.height = aValue;
          playerReadyPromise( updateSize );
        }
      },

      currentTime: {
        get: function() {
          return player && player.currentTime() || 0;
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
    var testVideo = document.createElement( "video" ),
        result;

    // url can be array or obj, make lookup table
    if ( Array.isArray( source ) ) {
      for ( var i = 0, l = source.length; i < l && !result; i++ ) {
        result = testVideo.canPlayType( source[ i ].type ) ? "probably" : EMPTY_STRING;
        if ( !result ) {
          break;
        }
        srcExtensions += source[ i ].type.split( "/" )[ 0 ] + ", ";
      }
      if ( !result ) {
        srcExtensions = "";
      }
      return result;
    } else if ( typeof source === "object" ) {
      result = testVideo.canPlayType( source.type ) ? "probably" : EMPTY_STRING;
      if ( result ) {
        srcExtensions = source.type.split( "/" )[ 1 ];
      }
      return result;
    } else {
      var extensionIdx = source.lastIndexOf( "." ),
          extension = validVideoTypes[ source.substr( extensionIdx + 1, source.length - extensionIdx ) ];

      if ( !extension ) {
        return EMPTY_STRING;
      }
      result = testVideo.canPlayType( extension.type ) ? "probably" : EMPTY_STRING;
      if ( result ) {
        srcExtensions = extension.type.split( "/" )[ 1 ];
      }
      return result;
    }
  };

  // We'll attempt to support a mime type of video/x-videojs
  HTMLJPlayerVideoElement.prototype.canPlayType = function( type ) {
    var testVideo = document.createElement( "video" );

    return type === "video/x-videojs" || video.canPlayType( type ) ? "probably" : EMPTY_STRING;
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
