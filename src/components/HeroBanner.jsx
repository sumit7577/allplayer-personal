import { Link } from 'react-router-dom'
import { Play, Info } from 'lucide-react'

export default function HeroBanner({ video }) {
  if (!video) return <HeroPlaceholder />

  return (
    <div className="relative h-[70vh] min-h-[500px] max-h-[800px] overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 via-[#1a1a2e] to-[#0a0a0a]" />
        )}
      </div>

      {/* Gradients */}
      <div className="hero-gradient absolute inset-0" />
      <div className="hero-gradient-bottom absolute inset-0" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-12 pb-24">
        <div className="max-w-lg">
          <span className="inline-block text-xs font-bold text-primary bg-primary/10 border border-primary/30 px-2.5 py-1 rounded-full mb-4 uppercase tracking-wider">
            {video.category || 'Featured'}
          </span>
          <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight mb-3">
            {video.title}
          </h1>
          {video.description && (
            <p className="text-gray-300 text-sm sm:text-base line-clamp-3 mb-6 max-w-md leading-relaxed">
              {video.description}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Link
              to={`/watch/${video.id}`}
              className="flex items-center gap-2 bg-white text-black font-semibold px-6 py-3 rounded-md hover:bg-gray-200 transition-colors text-sm"
            >
              <Play className="w-5 h-5 fill-black" />
              Play
            </Link>
            <Link
              to={`/watch/${video.id}`}
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white font-medium px-6 py-3 rounded-md hover:bg-white/30 transition-colors text-sm"
            >
              <Info className="w-5 h-5" />
              More Info
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function HeroPlaceholder() {
  return (
    <div className="relative h-[70vh] min-h-[500px] max-h-[800px] bg-gradient-to-br from-[#0a0a0a] via-[#1a1a2e] to-[#0a0a0a] flex items-center justify-center">
      <div className="hero-gradient-bottom absolute inset-0" />
      <div className="text-center z-10 px-4">
        <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Play className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          Welcome to all<span className="text-primary">Player</span>
        </h1>
        <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
          Stream your videos beautifully. Upload from Telegram or any URL.
        </p>
        <Link
          to="/add"
          className="inline-flex items-center gap-2 bg-primary text-white font-semibold px-8 py-3 rounded-md hover:bg-primary-hover transition-colors"
        >
          Add Your First Video
        </Link>
      </div>
    </div>
  )
}
