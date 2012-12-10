(function( window, Popcorn, undefined ) {

  var

  document = window.document,

  CURRENT_TIME_MONITOR_MS = 16,
  EMPTY_STRING = "",

  // Dailymotion doesn't give a suggested min size, YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  apiScriptElement,
  apiReadyCallbacks = [],

  controlsMode,
  logoMode;

  function apiReadyPromise( fn ) {
    if ( !window.DM && !apiScriptElement ) {
      // Insert the Dailymotion script and wait for it to fire the callback
      apiScriptElement = document.createElement( "script" );
      apiScriptElement.async = true;
      apiScriptElement.src = (document.location.protocol === 'file:' ? 'http:' : document.location.protocol) + "//api.dmcdn.net/all.js";
      document.head.appendChild( apiScriptElement );
    }

    if ( window.DM ) {
      fn();
    } else {
      // Dailymotion callback for once the script has loaded
      if ( !apiReadyCallbacks.length ) {
        if ( typeof window.dmAsyncInit === 'function' ) {
          apiReadyCallbacks.push( window.dmAsyncInit );
        }

        window.dmAsyncInit = function() {
          while ( apiReadyCallbacks.length ) {
            ( apiReadyCallbacks.shift() )();
          }
        };
      }
      apiReadyCallbacks.push(fn);
    }
  }

  function HTMLDailymotionVideoElement( id ) {

    // Dailymotion API requires postMessage
    if( !window.postMessage ) {
      throw "ERROR: HTMLDailymotionVideoElement requires window.postMessage";
    }

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
        muted: false,
        currentTime: 0,
        duration: NaN,
        ended: false,
        paused: true,
        width: parent.width|0   ? parent.width  : MIN_WIDTH,
        height: parent.height|0 ? parent.height : MIN_HEIGHT,
        error: null
      },
      playerReady = false,
      playerUID = Popcorn.guid(),
      player,
      playerReadyCallbacks = [],
      timeUpdateInterval,
      currentTimeInterval,
      dmRegex = /video\/([a-z0-9]+)/i,
      events = "canplay canplaythrough ended play pause " +
               "timeupdate playing seeked seeking volumechange progress",
      eventCallbacks = {},
      lastCurrentTime = 0;

    function playerReadyPromise( fn, unique ) {
      if ( playerReady ) {
        fn();
        return;
      }

      if ( unique ) {
        playerReadyCallbacks.splice( playerReadyCallbacks.indexOf( fn ), 1 );
      }
      playerReadyCallbacks.push( fn );
    }

    function setupEventListeners() {
      events.split( " " ).forEach(function( val ) {
        eventCallbacks[ val ] = function() {
          self.dispatchEvent( val );
        };
        player.addEventListener( val, eventCallbacks[ val ] );
      });
    }

    function removeEventListeners() {
      events.split( " " ).forEach(function( val ) {
        player.removeEventListener( val, eventcallbacks[ val ] );
      });
    }

    function updateDuration( newDuration ) {
      var oldDuration = impl.duration;

      if( oldDuration !== newDuration ) {
        impl.duration = newDuration;
        self.dispatchEvent( "durationchange" );

        // Deal with first update of duration
        if( isNaN( oldDuration ) ) {
          impl.networkState = self.NETWORK_IDLE;
          impl.readyState = self.HAVE_METADATA;
          self.dispatchEvent( "loadedmetadata" );

          self.dispatchEvent( "loadeddata" );

          // Auto-start if necessary
          if( impl.autoplay ) {
            self.play();
          }

          var i = playerReadyCallbacks.length;
          while( i-- ) {
            playerReadyCallbacks[ i ]();
            delete playerReadyCallbacks[ i ];
          }
        }
      }
    }

    function getDuration() {
      if( !playerReady ) {
        // Queue a getDuration() call so we have correct duration info for loadedmetadata
        addPlayerReadyCallback( function() { getDuration(); } );
      }

      player.getDuration();
    }

    function destroyPlayer() {
      if( !( playerReady && player ) ) {
        return;
      }
      clearInterval( currentTimeInterval );
      player.pause();

      parent.removeChild( elem );
      elem = null;
    }

    function changeCurrentTime( aTime ) {
      if( !playerReady ) {
        addPlayerReadyCallback( function() { changeCurrentTime( aTime ); } );
        return;
      }

      onSeeking();
      player.seek( aTime );
    }

    function onSeeking() {
      impl.seeking = true;
      self.dispatchEvent( "seeking" );
    }

    function onSeeked() {
      impl.seeking = false;
      self.dispatchEvent( "timeupdate" );
      self.dispatchEvent( "seeked" );
      self.dispatchEvent( "canplay" );
      self.dispatchEvent( "canplaythrough" );
    }

    function onPause() {
      impl.paused = true;
      clearInterval( timeUpdateInterval );
      self.dispatchEvent( "pause" );
    }

    function onTimeUpdate() {
      self.dispatchEvent( "timeupdate" );
    }

    function onPlay() {
      if( impl.ended ) {
        changeCurrentTime( 0 );
      }

      if ( !currentTimeInterval ) {
        currentTimeInterval = setInterval( monitorCurrentTime,
                                           CURRENT_TIME_MONITOR_MS ) ;

        // Only 1 play when video.loop=true
        if ( impl.loop ) {
          self.dispatchEvent( "play" );
        }
      }

      timeUpdateInterval = setInterval( onTimeUpdate,
                                        self._util.TIMEUPDATE_MS );

      if( impl.paused ) {
        impl.paused = false;

        // Only 1 play when video.loop=true
        if ( !impl.loop ) {
          self.dispatchEvent( "play" );
        }
        self.dispatchEvent( "playing" );
      }
    }

    function onEnded() {
      if( impl.loop ) {
        changeCurrentTime( 0 );
        self.play();
      } else {
        impl.ended = true;
        self.dispatchEvent( "ended" );
      }
    }

    function onCurrentTime( aTime ) {
      var currentTime = impl.currentTime = aTime;

      if( currentTime !== lastCurrentTime ) {
        self.dispatchEvent( "timeupdate" );
      }

      lastCurrentTime = impl.currentTime;
    }

    function monitorCurrentTime() {
      player.getCurrentTime();
    }

    function changeSrc( aSrc ) {

      if ( !aSrc ) {
        destroyPlayer();
        return;
      }

      if ( !self._canPlaySrc( aSrc ) ) {
        impl.error = {
          name: "MediaError",
          message: "Media Source Not Supported",
          code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        };
        self.dispatchEvent( "error" );
        return;
      }

      impl.src = aSrc;

      apiReadyPromise( function() {
        // We need to extract the video id out of the Dailymotion url
        var videoId;

        if ( !impl.src ) {
          if ( player ) {
            destroyPlayer();
          }
        }

        videoId = dmRegex.exec( impl.src )[ 1 ];

        player = DM.player( parent, {
          video: videoId,
          width: impl.width,
          height: impl.height,
          params: {
            autoplay: +impl.autoplay,
            // By default lets turn of the video info
            info: 0,
            // Also don't display related videos at the end
            related: 0,
            controls: controlsMode,
            html: controlsMode === 'html',
            logo: logoMode
          }
        });

        player.addEventListener('onStateChange', function(state) {
          console.log('onStateChange:' + state);
        }, true);

        player.addEventListener( "apiready", function apiReady( e ) {
          playerReady = true;

          setupEventListeners();

          player.removeEventListener( "apiready", apiReady );

          while ( playerReadyCallbacks.length ) {
            ( playerReadyCallbacks.shift() )();
          }
        });
      }, true );
    }

    function onVolume( aValue ) {
      if ( impl.volume !== aValue ) {
        impl.volume = aValue;
        self.dispatchEvent( "volumechange" );
      }
    }

    function setVolume( aValue ) {
      impl.volume = aValue;

      if( !playerReady ) {
        addPlayerReadyCallback( function() {
          setVolume( aValue );
        });
        return;
      }
      player.setVolume( aValue );
      self.dispatchEvent( "volumechange" );
    }

    function getVolume() {
      // If we're muted, the volume is cached on impl.muted.
      return impl.muted > 0 ? impl.muted : impl.volume;
    }

    function setMuted( aMute ) {
      if( !playerReady ) {
        impl.muted = aMute ? 1 : 0;
        addPlayerReadyCallback( function() {
          setMuted( aMute );
        });
        return;
      }

      // Move the existing volume onto muted to cache
      // until we unmute, and set the volume to 0.
      if( aMute ) {
        impl.muted = impl.volume;
        setVolume( 0 );
      } else {
        impl.muted = 0;
        setVolume( impl.muted );
      }
    }

    function getMuted() {
      return impl.muted > 0;
    }

    if ( controlsMode === undefined ) {
      elem = document.createElement( "video" );
      if ( elem.canPlayType && elem.canPlayType( "video/mp4" ) ) {
        controlsMode = "html";
        logoMode = 0;
      } else {
        controlsMode = "flash";
        logoMode = 1; // Dailymotion API bug: flash mode crashes if logo suppressed
      }
      elem = null;
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLDailymotionVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as Dailymotion
    self._util.type = "Dailymotion";

    self.play = function() {
      function play() {
        player.play();
      }

      playerReadyPromise(play, true);
    };

    self.pause = function() {
      function pause() {
        player.pause();
      }

      playerReadyPromise(pause, true);
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
          return elem.width;
        },
        set: function( aValue ) {
          impl.width = aValue;
        }
      },

      height: {
        get: function() {
          return elem.height;
        },
        set: function( aValue ) {
          impl.height = aValue;
        }
      },

      currentTime: {
        get: function() {
          return impl.currentTime;
        },
        set: function( aValue ) {
          changeCurrentTime( aValue );
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
          if( aValue < 0 || aValue > 1 ) {
            throw "Volume value must be between 0.0 and 1.0";
          }

          setVolume( aValue );
        }
      },

      muted: {
        get: function() {
          return getMuted();
        },
        set: function( aValue ) {
          setMuted( self._util.isAttributeSet( aValue ) );
        }
      },

      error: {
        get: function() {
          return impl.error;
        }
      }
    });
  }

  HTMLDailymotionVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLDailymotionVideoElement.prototype.constructor = HTMLDailymotionVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLDailymotionVideoElement.prototype._canPlaySrc = function( url ) {
    return (/dailymotion\.com\/video\/([a-z0-9]+)/i).test( url ) ? "probably" : EMPTY_STRING;
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
