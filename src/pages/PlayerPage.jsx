import { useParams, Link } from 'react-router-dom'
import { useEffect } from 'react'
import VideoPlayer from '../components/VideoPlayer'
import VideoRow from '../components/VideoRow'
import { useVideo, useVideos } from '../hooks/useVideos'
import { videoAPI } from '../lib/api'
import { Loader2, Calendar, Clock, Tag, AlertCircle } from 'lucide-react'

export default function PlayerPage() {
  const { id } = useParams()
  const { video, loading } = useVideo(id)
  const { videos } = useVideos()

  // Sync video status if processing
  useEffect(() => {
    if (video && video.status === 'processing') {
      const interval = setInterval(() => {
        videoAPI.syncStatus(id)
      }, 10000)
      return () => clearInterval(interval)
    }
  }, [video, id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-gray-600" />
        <h2 className="text-xl font-semibold text-white">Video not found</h2>
        <Link to="/" className="text-primary hover:underline text-sm">Go back home</Link>
      </div>
    )
  }

  const relatedVideos = videos.filter(v => v.id !== video.id).slice(0, 15)

  return (
    <div className="min-h-screen pt-16">
      {/* Player */}
      {video.status === 'ready' ? (
        <VideoPlayer
          src={video.hlsUrl}
          title={video.title}
          poster={video.thumbnailUrl}
        />
      ) : (
        <div className="aspect-video bg-[#111] flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-white font-medium">Video is being processed</p>
            <p className="text-gray-500 text-sm mt-1">This may take a few minutes...</p>
          </div>
        </div>
      )}

      {/* Video info */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-12 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">{video.title}</h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400 mb-6">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span className="bg-white/5 px-2.5 py-0.5 rounded-full text-xs">{video.category}</span>
              </div>
              {video.duration > 0 && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDuration(video.duration)}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(video.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                video.status === 'ready' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                video.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {video.status}
              </span>
            </div>

            {video.description && (
              <p className="text-gray-400 leading-relaxed max-w-2xl">{video.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Related */}
      {relatedVideos.length > 0 && (
        <div className="pb-12">
          <VideoRow title="More Videos" videos={relatedVideos} size="normal" />
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}
