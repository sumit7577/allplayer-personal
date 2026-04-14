import { Link } from 'react-router-dom'
import { Play, Clock, Loader2 } from 'lucide-react'

export default function VideoCard({ video, size = 'normal' }) {
  const isReady = video.status === 'ready'
  const isProcessing = video.status === 'processing'

  const sizeClasses = {
    small: 'w-44 sm:w-52',
    normal: 'w-56 sm:w-64',
    large: 'w-72 sm:w-80',
  }

  return (
    <Link
      to={`/watch/${video.id}`}
      className={`video-card group relative flex-shrink-0 ${sizeClasses[size]} rounded-md overflow-hidden bg-card cursor-pointer`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-[#1a1a1a]">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <Play className="w-8 h-8 text-gray-600" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-50 group-hover:scale-100">
            <Play className="w-5 h-5 text-black fill-black ml-0.5" />
          </div>
        </div>

        {/* Status badge */}
        {isProcessing && (
          <div className="absolute top-2 right-2 bg-yellow-500/90 text-black text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </div>
        )}

        {/* Duration */}
        {isReady && video.duration > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-[11px] text-white px-1.5 py-0.5 rounded flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(video.duration)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-white truncate leading-tight">
          {video.title}
        </h3>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
            {video.category}
          </span>
        </div>
      </div>
    </Link>
  )
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
