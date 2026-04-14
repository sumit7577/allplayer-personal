import { useRef, useState, useEffect, useCallback } from 'react'
import Hls from 'hls.js'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, Settings, Loader2, ArrowLeft
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function VideoPlayer({ src, title, poster }) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const hideTimer = useRef(null)
  const navigate = useNavigate()

  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [loading, setLoading] = useState(true)
  const [qualities, setQualities] = useState([])
  const [currentQuality, setCurrentQuality] = useState(-1)
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const hlsRef = useRef(null)

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current
    if (!src || !video) return

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLoading(false)
        const levels = data.levels.map((level, i) => ({
          index: i,
          height: level.height,
          bitrate: level.bitrate,
          label: `${level.height}p`,
        }))
        setQualities([{ index: -1, label: 'Auto' }, ...levels])
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentQuality(data.level)
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
          }
        }
      })

      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src
      video.addEventListener('loadedmetadata', () => setLoading(false))
    }
  }, [src])

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDurationChange = () => setDuration(video.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onWaiting = () => setLoading(true)
    const onCanPlay = () => setLoading(false)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('canplay', onCanPlay)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('canplay', onCanPlay)
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      const video = videoRef.current
      if (!video) return

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          playing ? video.pause() : video.play()
          break
        case 'ArrowLeft':
          e.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case 'ArrowRight':
          e.preventDefault()
          video.currentTime = Math.min(duration, video.currentTime + 10)
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(v => { const nv = Math.min(1, v + 0.1); video.volume = nv; return nv })
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(v => { const nv = Math.max(0, v - 0.1); video.volume = nv; return nv })
          break
        case 'f':
          toggleFullscreen()
          break
        case 'm':
          toggleMute()
          break
        case 'Escape':
          if (fullscreen) toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [playing, duration, fullscreen])

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [playing])

  useEffect(() => {
    if (!playing) {
      setShowControls(true)
      clearTimeout(hideTimer.current)
    } else {
      resetHideTimer()
    }
  }, [playing, resetHideTimer])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    playing ? video.pause() : video.play()
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(!muted)
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen?.() || el.webkitRequestFullscreen?.()
      setFullscreen(true)
    } else {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.()
      setFullscreen(false)
    }
  }

  const handleSeek = (e) => {
    const video = videoRef.current
    if (!video || !duration) return
    video.currentTime = (parseFloat(e.target.value) / 100) * duration
  }

  const handleQualityChange = (index) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index
    }
    setShowQualityMenu(false)
  }

  const seekRelative = (seconds) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds))
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black group cursor-pointer select-none"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={(e) => {
        if (e.target === videoRef.current || e.target.classList.contains('click-overlay')) {
          togglePlay()
        }
      }}
      onDoubleClick={(e) => {
        if (e.target === videoRef.current || e.target.classList.contains('click-overlay')) {
          toggleFullscreen()
        }
      }}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
      />

      {/* Click overlay */}
      <div className="click-overlay absolute inset-0" />

      {/* Loading spinner */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-white animate-spin" />
        </div>
      )}

      {/* Center play button (when paused) */}
      {!playing && !loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 player-gradient-top p-4 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <div className="flex items-center gap-3">
          <button onClick={(e) => { e.stopPropagation(); navigate(-1) }} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-medium truncate">{title}</h2>
        </div>
      </div>

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 player-gradient-bottom px-4 pb-4 pt-16 transition-opacity duration-300 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`} onClick={(e) => e.stopPropagation()}>
        {/* Progress bar */}
        <div className="mb-3 relative group/seek">
          <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={progress}
            onChange={handleSeek}
            className="player-seek w-full cursor-pointer"
            style={{
              background: `linear-gradient(to right, #e50914 ${progress}%, rgba(255,255,255,0.2) ${progress}%)`
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          {/* Left controls */}
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-white" />}
            </button>

            <button onClick={() => seekRelative(-10)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => seekRelative(10)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button onClick={toggleMute} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setVolume(v)
                  videoRef.current.volume = v
                  if (v > 0) { setMuted(false); videoRef.current.muted = false }
                }}
                className="w-0 group-hover/vol:w-20 transition-all duration-300 accent-primary cursor-pointer"
              />
            </div>

            <span className="text-xs text-gray-300 ml-2 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Quality selector */}
            {qualities.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-[#1c1c1c]/95 backdrop-blur-md rounded-lg border border-gray-700 py-1 min-w-[140px] shadow-xl">
                    <div className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Quality</div>
                    {qualities.map((q) => (
                      <button
                        key={q.index}
                        onClick={() => handleQualityChange(q.index)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/10 transition-colors ${
                          currentQuality === q.index ? 'text-primary' : 'text-gray-300'
                        }`}
                      >
                        {q.label}
                        {q.bitrate && <span className="text-gray-500 ml-2 text-[11px]">{Math.round(q.bitrate / 1000)}kbps</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
