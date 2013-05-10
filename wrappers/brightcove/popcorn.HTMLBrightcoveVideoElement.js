(function ( window, Popcorn, undefined ) {
  "use strict";

  var

  document = window.document,

  EMPTY_STRING = "",

  // Brightcove doesn't give a suggested min size, YouTube suggests 200x200
  // as minimum, video spec says 300x150.
  MIN_WIDTH = 300,
  MIN_HEIGHT = 200,
  smartAPIScriptElement,
  experienceScriptElement,
  apiReadyCallbacks = [],
  brightcove,
  brightcoveScriptDomains = {
    "https:": "//sadmin.brightcove.com/",
    "http:": "//admin.brightcove.com/"
  },

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

  function findExistingPlayer( src ) {
    if ( !brightcove ) {
        brightcove = window.brightcove;
    }
    if ( brightcove && brightcove.experiences && src && src.experience ) {
        if ( brightcove.experiences[ src.experience.id ] ) {
            return true;
        }
    }
    return false;
  }

  function apiReadyPromise( fn ) {
    function checkAPIReady() {
      if ( checkExperienceAPILoaded() ) {
        loadSmartAPI();
        if ( checkSmartAPILoaded() ) {
          while ( apiReadyCallbacks.length ) {
            ( apiReadyCallbacks.shift() )();
          }
        }
      }
      setTimeout( checkAPIReady, 10 );
      return false;
    }

    function checkSmartAPILoaded() {
      if ( window.brightcove.api ) {
        brightcove = window.brightcove;
        return true;
      }
      return false;
    }

    function checkExperienceAPILoaded() {
      if ( window.brightcove ) {
        return true;
      }
      return false;
    }

    function loadSmartAPI() {
      if ( !checkSmartAPILoaded() && !smartAPIScriptElement ) {
        smartAPIScriptElement = document.createElement( "script" );
        smartAPIScriptElement.async = true;
        smartAPIScriptElement.src = document.location.protocol + brightcoveScriptDomains[document.location.protocol] + "js/api/SmartPlayerAPI.js";
        console.log('a');
        document.head.appendChild( smartAPIScriptElement );
      }
    }

    function loadExperienceAPI() {
      if ( !checkExperienceAPILoaded() && !experienceScriptElement ) {
        // Insert the Brightcove script and wait for it to fire the callback
        experienceScriptElement = document.createElement( "script" );
        experienceScriptElement.async = true;
        experienceScriptElement.src = document.location.protocol + brightcoveScriptDomains[document.location.protocol] + "js/BrightcoveExperiences.js";
        document.head.appendChild( experienceScriptElement );
      }
    }

    
    // If the required scripts have loaded fire the callback right away and return early
    if ( checkExperienceAPILoaded() && checkSmartAPILoaded() ) {
      fn();
      return;
    }

    loadExperienceAPI();

    if ( !apiReadyCallbacks.length ) {
      setTimeout( checkAPIReady, 10 );
    }
    apiReadyCallbacks.push(fn);
  }

  function findVideoParams( url ) {
    var videoId = /bctid=([0-9]*)/.exec( url ),
        playerId = /bcpid([0-9]*)/.exec( url ),
        playerKey = /bckey=([^&]*)/.exec( url );

    videoId = videoId ? videoId[ 1 ] : null;
    playerId = playerId ? playerId[ 1 ] : null;
    playerKey = playerKey ? playerKey[ 1 ] : null;

    return {
      videoId: videoId,
      playerId: playerId,
      playerKey: playerKey
    };
  }

  function HTMLBrightcoveVideoElement( id ) {

    var self = this,
      parent = typeof id === "string" ? Popcorn.dom.find( id ) : id,
      brightcoveObject,
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
      experienceModule,
      existingPlayer,
      playerReadyCallbacks = [],
      stalledTimeout,
      brightcoveEvents = {},
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

      if ( typeof src === "string" ) {
        callback = function( evt ) {
          var val = player[ dest || src ];
          if ( impl[ src ] !== val ) {
            impl[ src ] = val;
            Popcorn.forEach( brightcoveEvents[ name ], function( event ) {
              self.dispatchEvent( event );
            });
          }
        };
      } else if ( typeof src === "function" ) {
        callback = function ( evt ) {
          if ( src.apply( this, [].concat(evt) ) ) {
            Popcorn.forEach( brightcoveEvents[ name ], function( event ) {
              self.dispatchEvent( event );
            });
          }
        };
      } else {
        callback = function () {
          Popcorn.forEach( brightcoveEvents[ name ], function( event ) {
            self.dispatchEvent( event );
          });
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
      brightcove.removeExperience(player.experience.id);
    }

    function onDurationChange() {
      player.getVideoDuration(false, function(duration) {
        impl.duration = duration;

        setReadyState( self.HAVE_METADATA );
        setReadyState( self.HAVE_CURRENT_DATA );
        setReadyState( self.HAVE_FUTURE_DATA );
        setReadyState( self.HAVE_ENOUGH_DATA );
        if ( playEventPending ) {
          player.play();
          self.dispatchEvent( "play" );
        }

        if ( playingEventPending ) {
          player.play();
          self.dispatchEvent( "playing" );
          playingEventPending = false;
        }

        if ( playEventPending ) {
          playEventPending = false;
          if ( impl.paused ) {
            player.pause();
            self.dispatchEvent( "pause" );
          }
        }
      });
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
      experienceModule.setSize( impl.width, impl.height );
    }

    function changeSrc( aSrc ) {

      // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-video-element.html#media-element-load-algorithm

      if ( player ) {
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

      window.brightcoveReady = ( function() {
        var brightcovePlayer,
            APIModules;

        return {
          onTemplateLoad: function( experienceID ) {
            brightcovePlayer = brightcove.api.getExperience( experienceID );
            APIModules = brightcove.api.modules.APIModules;
          },
          onTemplateReady: function() {
            playerReady = true;
            player = brightcovePlayer.getModule( APIModules.VIDEO_PLAYER );
            experienceModule = brightcovePlayer.getModule( APIModules.EXPERIENCE );

            brightcoveEvents[ brightcove.api.events.MediaEvent.COMPLETE ] = "ended";
            brightcoveEvents[ brightcove.api.events.MediaEvent.PLAY ] = "play";
            brightcoveEvents[ brightcove.api.events.MediaEvent.PROGRESS ] = "timeupdate";
            brightcoveEvents[ brightcove.api.events.MediaEvent.SEEK_NOTIFY ] = [ "seeking", "seeked" ];
            brightcoveEvents[ brightcove.api.events.MediaEvent.STOP ] = "pause";
            brightcoveEvents[ brightcove.api.events.MediaEvent.ERROR ] = "error";
            while ( playerReadyCallbacks.length ) {
              ( playerReadyCallbacks.shift() )();
            }
          }
        }
      }());

      apiReadyPromise( function() {
        var playerId,
            videoId,
            playerKey,
            playerParams = {
              "width": "100%",
              "height": "100%",
              "bgcolor": "#FFFFFF",
              "isVid": "true",
              "isUI": "true",
              "dynamicStreaming": "true",
              "includeAPI": "true",
              "wmode": "transparent",
              "templateLoadHandler": "brightcoveReady.onTemplateLoad",
              "templateReadyHandler": "brightcoveReady.onTemplateReady"
            },
            videoParams;

        if ( document.location.protocol === "https:" ) {
          playerParams[ "secureConnections" ] = "true";
        }

        if ( !impl.src ) {
          if ( player ) {
            destroyPlayer();
          }
        }

        existingPlayer = findExistingPlayer( impl.src );
        if ( !existingPlayer ) {
            // retrieve the videoid, playerId, and playerKey from the src
            videoParams = findVideoParams( impl.src );

            videoId = videoParams.videoId;
            playerId = videoParams.playerId;
            playerKey = videoParams.playerKey;


            if (playerId) {
              playerParams[ "playerID" ] = playerId;
            }
            if (playerKey) {
              playerParams[ "playerKey" ] = playerKey;
            }
            if (videoId) {
              playerParams[ "@videoPlayer" ] = videoId;
            }

            brightcoveObject = document.createElement( "object" );
            brightcoveObject.id = "myExperience" + Popcorn.guid();
            brightcoveObject.className = "BrightcoveExperience";

            Popcorn.forEach(playerParams, function( val, key ) {
              var param = document.createElement( "param" );
              param.name = key;
              param.value = val;
              brightcoveObject.appendChild( param );
            });
            parent.appendChild( brightcoveObject );
        } else {
            brightcoveReady.onTemplateLoad(impl.src.experience.id);
            brightcoveReady.onTemplateReady();
        }

        playerReadyPromise( function () {
          var initialPlayOccurred;
          // set up event listeners
          registerEventListener( brightcove.api.events.MediaEvent.ERROR );

          monitorStalled();

          function updateProgress( evt ) {
            var timeRange;
            if ( !evt ) {
              return;
            }

            impl.currentTime = evt.position;
            if ( !impl.duration ) {
              onDurationChange();
            }

            // TODO: Implement buffered once it's supported in the smart api.
            setReadyState( self.HAVE_CURRENT_DATA );

            if ( evt.position >= impl.duration ) {
              impl.networkState = self.NETWORK_IDLE;
              setReadyState( self.HAVE_CURRENT_DATA );
              setReadyState( self.HAVE_FUTURE_DATA );
              setReadyState( self.HAVE_ENOUGH_DATA );
            } else {
              impl.networkState = self.NETWORK_LOADING;
              monitorStalled();
            }
            self.dispatchEvent( "progress" );
            return true;
          }

          registerEventListener( brightcove.api.events.MediaEvent.PROGRESS, updateProgress );

          registerEventListener( "stalled", onStalled );

          registerEventListener( "durationchange", onDurationChange );

          registerEventListener( "timeupdate", "currentTime" );

          registerEventListener( "volumechange", function() {
            var volume = player.volume,
              muted = player.muted;

            if ( impl.volume !== volume || impl.muted !== muted ) {
              impl.volume = volume;
              impl.muted = muted;
              return true;
            }
          } );

          // This is essentially canplay and canplaythrough
          registerEventListener( brightcove.api.events.MediaEvent.BEGIN, function ( evt ) {
            if ( !initialPlayOccurred ) {
              player.pause();
              updateProgress( evt );
            }
            initialPlayOccurred = true;
          } );

          registerEventListener( brightcove.api.events.MediaEvent.PLAY, function ( evt ) {
            if ( impl.paused ) {
              impl.paused = false;
              if ( !impl.duration ) {
                playEventPending = true;
                playingEventPending = true;
              } else {
                return true;
              }
            }
          } );

          registerEventListener( brightcove.api.events.MediaEvent.SEEK_NOTIFY, function (evt) {
            // Brightcove doesn't emit any `seeking` events only a seeked one. Trigger seeking here
            // since it's the best we can do.
            impl.seeking = true;
            if ( impl.seeking ) {
              impl.seeking = false;
              if ( impl.paused ) {
                impl.currentTime = evt.position;
                setCurrentTime();
              }
              return true;
            }
          } );

          registerEventListener( brightcove.api.events.MediaEvent.STOP, function () {
            if ( !impl.paused ) {
              //if ( impl.loop && player.currentTime >= impl.duration ) {
              //  return false;
              //}
              impl.paused = true;
              return !!impl.duration;
            }
          } );

          
          registerEventListener( brightcove.api.events.MediaEvent.COMPLETE, function () {
            if ( impl.loop ) {
              player.seek( 0 );
              player.play();
            } else {
              impl.ended = true;
              self.dispatchEvent( "pause" );
              self.dispatchEvent( "timeupdate" );
              self.dispatchEvent( "ended" );
              return true;
            }
          } );

          initialPlayOccurred = (readyStates[ impl.readyState ] >= 1 );
          if ( !initialPlayOccurred ) {
            player.play();
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
      // Brightcove doesn't support
      impl.muted = impl.muted > 0 ? 0 : 1;
    }

    function getMuted() {
      return impl.muted > 0;
    }

    function setCurrentTime() {
      player.seek( impl.currentTime );
    }

    // Namespace all events we'll produce
    self._eventNamespace = Popcorn.guid( "HTMLBrightcoveVideoElement::" );

    self.parentNode = parent;

    self._util = Popcorn.extend( {}, self._util );

    // Mark type as Brightcove
    self._util.type = "Brightcove";

    self.play = function () {
      function play() {
        player.play();
        self.dispatchEvent( "playing" );
      }

      playerReadyPromise( play, true );
    };

    self.pause = function () {
      function pause() {
        player.pause();
        self.dispatchEvent( "pause" );
      }

      impl.paused = true;
      playerReadyPromise( pause, true );
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
          //return elem && elem.width || impl.width;
        },
        set: function( aValue ) {
          impl.width = aValue;
          playerReadyPromise( updateSize );
        }
      },

      height: {
        get: function() {
          //return elem && elem.height || impl.height;
        },
        set: function( aValue ) {
          impl.height = aValue;
          playerReadyPromise( updateSize );
        }
      },

      currentTime: {
        get: function() {
          return impl.currentTime;
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

  HTMLBrightcoveVideoElement.prototype = new Popcorn._MediaElementProto();
  HTMLBrightcoveVideoElement.prototype.constructor = HTMLBrightcoveVideoElement;

  // Helper for identifying URLs we know how to play.
  HTMLBrightcoveVideoElement.prototype._canPlaySrc = function( url ) {
    var tempElem = document.createElement( "a" ),
        params = findVideoParams( url );

    tempElem.href = url;

    return tempElem.hostname === 'link.brightcove.com' && params.videoId && params.playerId;
  };

  // We'll attempt to support a mime type of video/x-vimeo
  HTMLBrightcoveVideoElement.prototype.canPlayType = function( type ) {
    return type === "video/x-brightcove" ? "probably" : EMPTY_STRING;
  };

  Popcorn.HTMLBrightcoveVideoElement = function( id ) {
    return new HTMLBrightcoveVideoElement( id );
  };
  Popcorn.HTMLBrightcoveVideoElement._canPlaySrc = HTMLBrightcoveVideoElement.prototype._canPlaySrc;

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
