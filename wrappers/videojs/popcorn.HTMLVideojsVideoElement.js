(function ( window, Popcorn, undefined ) {
  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  apiScriptElement,
  apiCSS,
  apiReadyCallbacks = [],
  _V_,

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
    "x-videojs": {
      "type": "video/x-videojs"
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

  function apiReadyPromise( fn ) {
    if ( !window._V_ && !apiScriptElement ) {
      // Insert the VideoJS script and wait for it to fire the callback
      apiScriptElement = document.createElement( "script" );
      apiScriptElement.async = true;
      apiScriptElement.src = (document.location.protocol === 'file:' ? 'http:' : document.location.protocol) + "//vjs.zencdn.net/c/video.js";

      apiCSS = document.createElement( "link" );
      apiCSS.type = "text/css";
      apiCSS.rel = "stylesheet";
      apiCSS.href = ( document.location.protocol === "file:" ? "http:" : document.location.protocol ) + "//vjs.zencdn.net/c/video-js.css";

      document.head.appendChild( apiCSS );
      document.head.appendChild( apiScriptElement );
    }

    // VideoJS doesn't notify us when the script has loaded so we have to do poll
    // and check for existance of _V_ on the window
    function checkAPIReady() {
      if ( window._V_ ) {
        _V_ = window._V_;
        while ( apiReadyCallbacks.length ) {
          ( apiReadyCallbacks.shift() )();
        }
        return;
      }
      setTimeout( checkAPIReady, 10 );
    }

    if ( window._V_ ) {
      _V_ = window._V_;
      fn();
    } else {
      if ( !apiReadyCallbacks.length ) {
      	checkAPIReady();
      }
      apiReadyCallbacks.push(fn);
    }
  }

  function HTMLVideojsVideoElement( id ) {

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
        player.removeEventListener( name, callback );
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
      player.pause();

      removeEventListeners();

      try {
        player.destroy();
      } catch (e) {}

      if ( elem && elem.parentNode === parent ) {
        parent.removeChild( elem );
      }
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

      if ( aSrc === parent ) {
        aSrc = impl.src = parent.tag.src;
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

        if ( !self._canPlaySrc( aSrc ) ) {
          impl.error = {
            name: "MediaError",
            message: "Media Source Not Supported",
            code: window.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          };
          impl.networkState = self.NETWORK_NO_SRC;
          self.dispatchEvent( "error" );
          return;
        }

        if ( !elem && !player ) {
          elem = document.createElement( "video" );

          elem.width = impl.width;
          elem.setAttribute( "class", "video-js vjs-default-skin" );
          elem.height = impl.height;
          elem.loop = impl.loop;
          elem.preload = "auto";
          elem.autoplay = impl.autoplay;
          // Seems that videojs needs the controls to always be present
          elem.controls = true;
          if ( Array.isArray( impl.src ) ) {
            for ( var i = 0, l = impl.src.length; i < l; i++ ) {
              sourceElem = document.createElement( "source" );
              sourceElem.src = impl.src[ i ].src;
              sourceElem.type = impl.src[ i ].type;
              elem.appendChild( sourceElem );
            }
          } else if ( typeof impl.src === "object" ) {
              sourceElem = document.createElement( "source" );
              sourceElem.src = impl.src.src;
              sourceElem.type = impl.src.type;
              elem.appendChild( sourceElem );
          } else {
            elem.src = impl.src;
          }

          parent.appendChild( elem );
        }

        function fireReadyCallbacks() {
          while ( playerReadyCallbacks.length ) {
            ( playerReadyCallbacks.shift() )();
          }
        }

        if ( !player ) {
          _V_( elem ).ready(function() {
            playerReady = true;

            player = this;
            fireReadyCallbacks();
          });
        } else {
          playerReady = true;
          fireReadyCallbacks();
        }

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

    if ( typeof parent === "object" ) {
      apiReadyPromise(function() {
        var players = _V_.players;
        // Check if the object we were given matches one of the videojs players
        for ( var prop in players ) {
          if ( players.hasOwnProperty( prop ) ) {
            if ( players[ prop ] === parent ) {
              player = parent;
              changeSrc( player );
            }
          }
        }
        if ( !player ) {
          impl.error = {
            name: "MediaError",
            message: "Invalid Videojs Object",
            // Could use error code 1 here instead ( Aborted )
            code: window.MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          };
          impl.networkState = self.NETWORK_NO_SRC;
          self.dispatchEvent( "error" );
          return;
        }
      });
    // If the specified container is a video element use it instead of creating another
    } else if ( parent.nodeName === "VIDEO" ) {
      elem = parent;
      impl.src = elem.src;
      changeSrc( impl.src );
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLVideojsVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as Videojs
    self._util.type = "Videojs";

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

  HTMLVideojsVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLVideojsVideoElement.prototype.constructor = HTMLVideojsVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLVideojsVideoElement.prototype._canPlaySrc = function( source ) {
    // url can be array or obj, make lookup table
    if ( Array.isArray( source ) ) {
      var result = false;

      for ( var i = 0, l = source.length; i < l && !result; i++ ) {
        result = _V_.html5.canPlaySource( source[ i ] ) ? true : _V_.flash.canPlaySource( source[ i ] );
      }
      return result;
    } else if ( typeof source === "object" ) {
      return _V_.html5.canPlaySource( source ) ? true : _V_.flash.canPlaySource( source );
    } else {
      var extensionIdx = source.lastIndexOf( "." ),
          extension = validVideoTypes[ source.substr( extensionIdx + 1, source.length - extensionIdx ) ];

      return _V_.html5.canPlaySource( extension ) ? true : _V_.flash.canPlaySource( extension );
    }
  };

  // We'll attempt to support a mime type of video/x-videojs
  HTMLVideojsVideoElement.prototype.canPlayType = function( type ) {
    return type === "video/x-videojs" ||
           _V_.html5.canPlaySource({ "type": type }) ||
           _V_.flash.canPlaySource({ "type": type }) ? "probably" : EMPTY_STRING;
  };

  Popcorn.HTMLVideojsVideoElement = function( id ) {
    return new HTMLVideojsVideoElement( id );
  };
  Popcorn.HTMLVideojsVideoElement._canPlaySrc = HTMLVideojsVideoElement.prototype._canPlaySrc;

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
