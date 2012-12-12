(function ( window, Popcorn, undefined ) {
/*
http://www.dailymotion.com/doc/api/player.html

Note that all unit tests depending on "canplaythrough" will fail on Firefox,
because Dailymotion will not preload the whole video when using Flash.
*/

  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // Dailymotion doesn't give a suggested min size, YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  apiScriptElement,
  apiReadyCallbacks = [],
  DM,

  htmlMode,

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
    if ( !window.DM && !apiScriptElement ) {
      // Insert the Dailymotion script and wait for it to fire the callback
      apiScriptElement = document.createElement( "script" );
      apiScriptElement.async = true;
      apiScriptElement.src = (document.location.protocol === 'file:' ? 'http:' : document.location.protocol) + "//api.dmcdn.net/all.js";
      document.head.appendChild( apiScriptElement );
    }

    if ( window.DM ) {
      DM = window.DM;
      fn();
    } else {
      // Dailymotion callback for once the script has loaded
      if ( !apiReadyCallbacks.length ) {
        if ( typeof window.dmAsyncInit === 'function' ) {
          apiReadyCallbacks.push( window.dmAsyncInit );
        }

        window.dmAsyncInit = function() {
          DM = window.DM;
          while ( apiReadyCallbacks.length ) {
            ( apiReadyCallbacks.shift() )();
          }
        };
      }
      apiReadyCallbacks.push(fn);
    }
  }

  function HTMLDailymotionVideoElement( id ) {

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
      requestedPlay = false,
      playEventPending = false,
      playingEventPending = false,
      playerReady = false,
      player,
      playerReadyCallbacks = [],
      stalledTimeout,
      dmRegex = /video\/([a-z0-9]+)/i,
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
      player.addEventListener( name, callback );
    }

    function removeEventListeners() {
      Popcorn.forEach( eventCallbacks, function ( name, callback ) {
        player.removeEventListener( name, callback );
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

      parent.removeChild( elem );
      elem = null;
    }

    function onDurationChange() {
      impl.duration = player.duration;
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
      player.width = impl.width;
      player.height = impl.height;
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
      requestedPlay = !!impl.autoplay;

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

      // begin "resource fetch algorithm", set networkState to NETWORK_IDLE and fire "suspend" event

      impl.src = aSrc;

      impl.networkState = self.NETWORK_LOADING;
      setReadyState( self.HAVE_NOTHING );

      apiReadyPromise( function() {
        // We need to extract the video id out of the Dailymotion url
        var videoId;

        if ( !impl.src ) {
          if ( player ) {
            destroyPlayer();
          }
        }

        videoId = dmRegex.exec( impl.src )[ 1 ];

        // Dailymotion needs a sacrificial container that it will replace with an iframe
        elem = document.createElement('div');
        parent.appendChild(elem);

        player = DM.player( elem, {
          video: videoId,
          width: impl.width,
          height: impl.height,
          params: {
            autoplay: +impl.autoplay,
            // By default lets turn of the video info
            info: 0,
            // Also don't display related videos at the end
            related: 0,
            controls: htmlMode && "html" || "flash",
            html: htmlMode,
            logo: !htmlMode && 1 || 0 // Dailymotion API bug: flash mode crashes if logo suppressed
          }
        } );

        player.addEventListener( "apiready", function apiReady() {
          playerReady = true;

          player.removeEventListener( "apiready", apiReady );

          while ( playerReadyCallbacks.length ) {
            ( playerReadyCallbacks.shift() )();
          }
        } );

        playerReadyPromise( function () {
          // set up event listeners
          registerEventListener( "error" );

          monitorStalled();

          registerEventListener( "progress", function () {
            if ( !impl.duration && player.duration ) {
              onDurationChange();
            }

            if ( player.bufferedTime < Infinity ) {
              impl.progressAmount = player.bufferedTime;
            }
            impl.progressAmount = Math.max( impl.progressAmount, player.currentTime );

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
            var volume = player.volume,
              muted = player.muted;

            if ( impl.volume !== volume || impl.muted !== muted ) {
              impl.volume = volume;
              impl.muted = muted;
              return true;
            }
          } );

          registerEventListener( "canplay", function () {
            if ( !impl.duration && player.duration ) {
              onDurationChange();
            }

            setReadyState( self.HAVE_CURRENT_DATA );
            setReadyState( self.HAVE_FUTURE_DATA );

            if ( !requestedPlay ) {
              player.pause();
            }
          } );

          registerEventListener( "canplaythrough", function () {
            setReadyState( self.HAVE_ENOUGH_DATA );
          } );

          registerEventListener( "play", function () {
            if ( !requestedPlay ) {
              player.pause();
              return false;
            }
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
            if ( !impl.duration && player.duration ) {
              onDurationChange();
            }

            if ( !impl.duration ) {
              playingEventPending = true;
              return false;
            }
            setReadyState( self.HAVE_CURRENT_DATA );
            setReadyState( self.HAVE_FUTURE_DATA );

            // DM will sometimes fail to fire "seeking"
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
              return requestedPlay && !!impl.duration;
            }
          } );

          registerEventListener( "ended", function () {
            if ( impl.loop ) {
              player.seek( 0 );
              player.play();
            } else {
              impl.ended = true;
              return true;
            }
          } );

          if ( !impl.autoplay && !impl.duration ) {
            player.play();
            //will pause again on next event. pause sometimes crashes here
          }
        } );

      }, true );
    }

    function setVolume() {
      player.setVolume( impl.volume );
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted() {
      player.setMuted( impl.muted );
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function setCurrentTime() {
      player.seek( impl.currentTime );
    }

    if ( htmlMode === undefined ) {
      elem = document.createElement( "video" );
      htmlMode = !!( elem.canPlayType && elem.canPlayType( "video/mp4" ) );
      elem = null;
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLDailymotionVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as Dailymotion
    self._util.type = "Dailymotion";

    self.play = function () {
      function play() {
        player.play();
      }

      requestedPlay = true;
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
          return player && player.currentTime || 0;
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
          self.dispatchEvent( "volumechange" );
        }
      },

      muted: {
        get: function() {
          return getMuted();
        },
        set: function( aValue ) {
          impl.muted = self._util.isAttributeSet( aValue ) && 1 || 0;
          playerReadyPromise( setMuted, true );
          self.dispatchEvent( "volumechange" );
        }
      },

      error: {
        get: function() {
          return impl.error;
        }
      }
    } );
  }

  HTMLDailymotionVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLDailymotionVideoElement.prototype.constructor = HTMLDailymotionVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLDailymotionVideoElement.prototype._canPlaySrc = function( url ) {
    return (/dailymotion\.com\/(embed\/)?video\/([a-z0-9]+)/i).test( url ) ? "probably" : EMPTY_STRING;
  };

  // We'll attempt to support a mime type of video/x-vimeo
  HTMLDailymotionVideoElement.prototype.canPlayType = function( type ) {
    return type === "video/x-dailymotion" ? "probably" : EMPTY_STRING;
  };

  Popcorn.HTMLDailymotionVideoElement = function( id ) {
    return new HTMLDailymotionVideoElement( id );
  };
  Popcorn.HTMLDailymotionVideoElement._canPlaySrc = HTMLDailymotionVideoElement.prototype._canPlaySrc;

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