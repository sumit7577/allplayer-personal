import { useMemo } from 'react'
import HeroBanner from '../components/HeroBanner'
import VideoRow from '../components/VideoRow'
import { useVideos, useCategories } from '../hooks/useVideos'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const { videos, loading } = useVideos()
  const categories = useCategories()

  const featuredVideo = useMemo(() => {
    const readyVideos = videos.filter(v => v.status === 'ready')
    return readyVideos.length > 0 ? readyVideos[0] : videos[0]
  }, [videos])

  const recentlyAdded = useMemo(() =>
    [...videos].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 20),
    [videos]
  )

  const videosByCategory = useMemo(() => {
    const map = {}
    for (const v of videos) {
      if (!map[v.category]) map[v.category] = []
      map[v.category].push(v)
    }
    return map
  }, [videos])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <HeroBanner video={featuredVideo} />

      <div className="-mt-16 relative z-10 pb-12">
        {recentlyAdded.length > 0 && (
          <VideoRow title="Recently Added" videos={recentlyAdded} size="normal" />
        )}

        {categories.map((cat) => (
          videosByCategory[cat] && videosByCategory[cat].length > 0 && (
            <VideoRow key={cat} title={cat} videos={videosByCategory[cat]} size="normal" />
          )
        ))}

        {videos.length === 0 && (
          <div className="text-center py-20 px-4">
            <p className="text-gray-500 text-lg">No videos yet. Start by adding your first video!</p>
          </div>
        )}
      </div>
    </div>
  )
}
