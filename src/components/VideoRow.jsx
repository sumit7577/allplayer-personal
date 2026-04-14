import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import VideoCard from './VideoCard'

export default function VideoRow({ title, videos, size = 'normal' }) {
  const scrollRef = useRef(null)

  const scroll = (direction) => {
    const el = scrollRef.current
    if (!el) return
    const amount = direction === 'left' ? -400 : 400
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  if (!videos || videos.length === 0) return null

  return (
    <div className="mb-8 group/row">
      <h2 className="text-lg sm:text-xl font-semibold text-white mb-3 px-4 sm:px-12">
        {title}
      </h2>
      <div className="relative">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-10 bg-black/50 opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/70"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto hide-scrollbar px-4 sm:px-12 pb-2"
        >
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} size={size} />
          ))}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-10 bg-black/50 opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-center hover:bg-black/70"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}
