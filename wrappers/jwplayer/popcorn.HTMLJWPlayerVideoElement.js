(function ( window, Popcorn, undefined ) {
  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  apiScriptElement1,
  apiScriptElement2,
  JWPLAYER_API_URL = "//www.longtailvideo.com/jwplayer/jwplayer.js",
  JWPLAYER_HTML5_URL = "http://www.longtailvideo.com/jwplayer/jwplayer.html5.js",
  JWPLAYER_FLASH_URL = "http://www.longtailvideo.com/jwplayer/jwplayer.flash.swf",
  EVENT_PREFIX = "popcorn_jwplayer_",
  apiCSS,
  apiReadyCallbacks = [],
  canplayFired = false,
  eventElement = document.createElement( "div" ),
  jwplayer = window.jwplayer,
  youtubeRegex = "",
  rtmpDirectRegex = "",

  validMediaTypes = {
    // Video formats
    "mp4": {
      "type": "video/mp4"
    },
    "ogv": {
      "type": "video/ogg"
    },
    "webm": {
      "type": "video/webm"
    },
    "flv": {
      "type": "video/flv"
    },
    "m4v": {
      "type": "videp/mp4"
    },
    // Audio formats
    "aac": {
      "type": "audio/mp4"
    },
    "m4a": {
      "type": "audio/mp4"
    },
    "f4a": {
      "type": "audio/mp4"
    },
    "mp3": {
      "type": "audio/mpeg"
    },
    "ogg": {
      "type": "audio/ogg"
    },
    "oga": {
      "type": "audio/ogg"
    },
    // Stream formats
    "smil": {
      "type": "application/smil"
    },
    "m3u8": {
      "type": "application/vnd.apple.mpegurl"
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
    // JWPlayer doesn't notify us when the script has loaded so we have to do poll
    // and check for existance of jwplayer on the window
    function checkAPIReady() {
      if ( window.jwplayer ) {
        jwplayer = window.jwplayer;
        while ( apiReadyCallbacks.length ) {
          ( apiReadyCallbacks.shift() )();
        }
        return;
      }
      setTimeout( checkAPIReady, 10 );
    }

    if ( window.jwplayer ) {
      fn();
      return;
    }

    if ( !apiScriptElement1 ) {
      // Insert the VideoJS script and wait for it to fire the callback
      apiScriptElement1 = document.createElement( "script" );
      apiScriptElement1.async = true;
      apiScriptElement1.src = JWPLAYER_API_URL;

      document.head.appendChild( apiScriptElement1 );
    }

    if ( !apiScriptElement2 ) {
      // Insert the VideoJS script and wait for it to fire the callback
      apiScriptElement2 = document.createElement( "script" );
      apiScriptElement2.async = true;
      apiScriptElement2.src = JWPLAYER_HTML5_URL;

      document.head.appendChild( apiScriptElement2 );
    }

    if ( !apiReadyCallbacks.length ) {
      setTimeout( checkAPIReady, 10 );
    }
    apiReadyCallbacks.push(fn);
  }

  function findExistingPlayer( obj ) {
    var item,
        player,
        i = 0;

    if ( !window.jwplayer ) {
      return;
    }

    item = jwplayer( i );
    while ( item.config ) {
      if ( item === jwplayer( obj.container ) ) {
        player = item;
      }
      i++;
      item = jwplayer( i );
    }

    return player;
  }

  function HTMLJWPlayerVideoElement( id ) {

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
      eventCallbacks = {},
      events = {
        "canplay": undefined,
        "canplaythrough": undefined,
        "durationchange": undefined,
        "ended": undefined,
        "error": undefined,
        "loadeddata": undefined,
        "loadedmetadata": undefined,
        "loadstart": undefined,
        "pause": undefined,
        "play": undefined,
        "playing": undefined,
        "progress": undefined,
        "seeked": undefined,
        "seeking": undefined,
        "stalled": undefined,
        "timeupdate": undefined,
        "volumechange": undefined,
        "waiting": undefined
      };

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

    // JWPlayer doesn't support removing event listeners so lets setup our own to make things function properly
    function registerEventListener( name, src, dest ) {
      var callback;

      //no duplicates, just in case
      callback = eventCallbacks[ name ];
      if ( callback ) {
        return;
      }

      if ( typeof src === 'string' ) {
        callback = function() {
          var val = events[ dest || src ];
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
      eventElement.addEventListener( EVENT_PREFIX + name, callback, false );
    }

    function setupJWPlayerEventCallbacks() {
      var player = jwplayer( parent );

      for ( var name in events ) {
        events[ name ] = document.createEvent( "Event" );
        events[ name ].initEvent( EVENT_PREFIX + name, true, true );
      }

      player.onBufferChange(function( e ) {
        eventElement.dispatchEvent( events[ "progress" ] );
      });

      player.onPlay(function( e ) {
        eventElement.dispatchEvent( events[ "play" ] );
        eventElement.dispatchEvent( events[ "playing" ] );
      });

      player.onPause(function( e ) {
        eventElement.dispatchEvent( events[ "pause" ] );
      });

      player.onIdle(function( e ) {
        eventElement.dispatchEvent( events[ "stalled" ] );
      });

      player.onSeek(function( e ) {
        eventElement.dispatchEvent( events[ "seeking" ] );
        eventElement.dispatchEvent( events[ "seeked" ] );
      });

      player.onTime(function( e ) {
        eventElement.dispatchEvent( events[ "timeupdate" ] );
        if ( e.duration !== impl.duration ) {
          eventElement.dispatchEvent( events[ "durationchange" ] );
        }
      });

      player.onMute(function( e ) {
        eventElement.dispatchEvent( events[ "volumechange" ] );
      });

      player.onVolume(function( e ) {
        eventElement.dispatchEvent( events[ "volumechange" ] );
      });

      player.onError(function( e ) {
        eventElement.dispatchEvent( events[ "error" ] );
      });

      player.onBufferFull(function( e ) {
        eventElement.dispatchEvent( events[ "canplaythrough" ] );
      });

      player.onComplete(function( e ) {
        eventElement.dispatchEvent( events[ "ended" ] );
      });
    }

    function removeEventListeners() {
      Popcorn.forEach( eventCallbacks, function ( name, callback ) {
        eventElement.removeEventListener( EVENT_PREFIX + name, callback, false );
      });
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

      var player;
      clearTimeout( stalledTimeout );

      if( !( playerReady && player ) ) {
        return;
      }

      player = jwplayer( parent );

      removeEventListeners();

      if ( !existingPlayer ) {
        player.pause();

        try {
          player.remove();
        } catch (e) {}

        if ( elem && elem.parentNode === parent ) {
          parent.removeChild( elem );
        }
      }

      events = null;
      existingPlayer = null;
      player = null;
      parent = null;
      playerReady = false;
      elem = null;
    }

    function onDurationChange( e ) {
      var player = jwplayer( parent );
      if ( player.getDuration() === impl.duration ) {
        return;
      }
      impl.duration = player.getDuration();
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
      var player = jwplayer( parent );
      player.width( impl.width );
      player.height( impl.height );
    }

    function changeSrc( aSrc ) {

      var player;
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
          player = jwplayer( parent );
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
        aSrc = impl.src = existingPlayer.config.file;
      } else {
        impl.src = aSrc;
      }

      impl.networkState = self.NETWORK_LOADING;
      setReadyState( self.HAVE_NOTHING );

      apiReadyPromise(function() {
        var sourceElem,
            player = jwplayer( parent );

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

        /*if ( !elem && !player ) {
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
        }*/

        if ( !player ) {
          player = jwplayer( parent );
        }

        window.player = player;
        player.setup({
          "file": impl.src,
          "events": {
            "onReady": function( event ) {
              playerReady = true;

              setupJWPlayerEventCallbacks();
              player = jwplayer( parent );
              while ( playerReadyCallbacks.length ) {
                ( playerReadyCallbacks.shift() )();
              }
            }
          },
          modes: [
            {
              "type": "html5"
            },
            {
              "type": "flash",
              "src": JWPLAYER_FLASH_URL
            }
          ]
        });

        playerReadyPromise( function () {
          var player = jwplayer( parent );
          // set up event listeners
          registerEventListener( "error" );

          monitorStalled();

          eventElement.addEventListener( EVENT_PREFIX + "play", function onPlay() {
            if ( !impl.autoplay ) {
              player.pause( true );
            }
            eventElement.removeEventListener( EVENT_PREFIX + "play", onPlay, false );
          }, false);

          player.play( true );
          // Maps to HTML progress event
          // The first time this fires, emit a `canplay` event as the user would technically be able to begin playback
          registerEventListener( "progress", function () {
            var player = jwplayer( parent );
            if ( impl.duration <= 0 && player.getDuration() > 0 ) {
              onDurationChange();
            }

            // This is the best we can do to notify a `canplay` event
            if ( !canplayFired ) {
              canplayFired = true;
              setReadyState( self.HAVE_CURRENT_DATA );
              setReadyState( self.HAVE_FUTURE_DATA );
            }

            impl.progressAmount = player.getBuffer();
            impl.progressAmount = Math.max( impl.progressAmount, player.getPosition() );

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
          });

          registerEventListener( "stalled", onStalled );

          registerEventListener( "timeupdate", "currentTime" );
          registerEventListener( "timeupdate", onDurationChange );

          registerEventListener( "volumechange", function() {
            var player = jwplayer( parent ),
                volume = player.getVolume() / 100,
                muted = player.getMute();

            muted = +muted;
            if ( impl.volume !== volume || impl.muted !== muted ) {
              impl.volume = volume;
              impl.muted = muted;
              return true;
            }
          });

          registerEventListener( "canplaythrough", function () {
            setReadyState( self.HAVE_ENOUGH_DATA );
          });

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
          });

          registerEventListener( "seeked" , function () {
            if ( impl.seeking ) {
              impl.seeking = false;
              return true;
            }
          });

          registerEventListener( "playing", function () {
            var player = jwplayer( parent );
            if ( !impl.duration && player.getDuration() ) {
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
          });

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
      var player = jwplayer( parent );
      player.setVolume( impl.muted > 0 ? 0 : impl.volume * 100 );
      self.dispatchEvent( "volumechange" );
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted() {
      var player = jwplayer( parent );
      player.setMute( impl.muted );
      setVolume();
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function setCurrentTime() {
      // JWPlayer will automatically play the video after a seek so we need to store the value of
      // `impl.paused` before we seek
      var prevPauseState = impl.paused,
          player = jwplayer( parent );
      eventElement.addEventListener( EVENT_PREFIX + "seeked", function onSeeked() {
        if ( prevPauseState ) {
          player.pause( true );
        }
        eventElement.removeEventListener( EVENT_PREFIX + "seeked", onSeeked, false );
      }, false);

      player.seek( impl.currentTime );
    }

    existingPlayer = findExistingPlayer( parent );
    if ( existingPlayer ) {
      parent = existingPlayer.container;
      changeSrc( existingPlayer );
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLJWPlayerVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as JWPlayer
    self._util.type = "JWPlayer";

    self._util.destroy = function () {
      destroyPlayer();
    };

    self.play = function () {
      function play() {
        var player = jwplayer( parent );
        player.play( true );
      }

      playerReadyPromise(play, true);
    };

    self.pause = function () {
      function pause() {
        var player = jwplayer( parent );
        player.pause( true );
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
          var player = jwplayer( parent );
          return player && player.getPosition() || 0;
        },
        set: function( aValue ) {

          aValue = parseFloat( aValue );
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

  HTMLJWPlayerVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLJWPlayerVideoElement.prototype.constructor = HTMLJWPlayerVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLJWPlayerVideoElement.prototype._canPlaySrc = function( source ) {
    // See if the HTML5 video element can play the source, if not fall back to JWPlayers supported list
    // http://www.longtailvideo.com/support/jw-player/28836/media-format-support
    var testVideo = document.createElement( "video" ),
        result;

    if ( findExistingPlayer( source ) ) {
      return "probably";
    }

    // url can be array or obj, make lookup table
    if ( Array.isArray( source ) ) {
      for ( var i = 0, l = source.length; i < l && !result; i++ ) {
        result = testVideo( source[ i ].type ) ? "probably" : EMPTY_STRING;
        if ( !result ) {
        }
      }
      return result;
    } else if ( typeof source === "object" ) {
      result = testVideo.canPlayType( source.type ) ? "probably" : EMPTY_STRING;
      return result;
    } else {
      if ( typeof source !== "string" ) {
        return EMPTY_STRING;
      }

      var extensionIdx = source.lastIndexOf( "." ),
          extension = validMediaTypes[ source.substr( extensionIdx + 1, source.length - extensionIdx ) ];

      if ( !extension ) {
        return EMPTY_STRING;
      }
      result = testVideo.canPlayType( extension.type ) ? "probably" : EMPTY_STRING;
      return result;
    }
  };

  // We'll attempt to support a mime type of video/x-videojs
  HTMLJWPlayerVideoElement.prototype.canPlayType = function( type ) {
    var testVideo = document.createElement( "video" );

    return type === "video/x-videojs" || video.canPlayType( type ) ? "probably" : EMPTY_STRING;
  };

  Popcorn.HTMLJWPlayerVideoElement = function( id ) {
    return new HTMLJWPlayerVideoElement( id );
  };
  Popcorn.HTMLJWPlayerVideoElement._canPlaySrc = HTMLJWPlayerVideoElement.prototype._canPlaySrc;

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
