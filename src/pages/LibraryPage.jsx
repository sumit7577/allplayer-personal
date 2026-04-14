import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useVideos, useCategories } from '../hooks/useVideos'
import VideoCard from '../components/VideoCard'
import { videoAPI } from '../lib/api'
import { Loader2, Search, Grid3X3, LayoutList, Trash2, RefreshCw, X } from 'lucide-react'

export default function LibraryPage() {
  const [searchParams] = useSearchParams()
  const initialSearch = searchParams.get('search') || ''
  const [search, setSearch] = useState(initialSearch)
  const [selectedCategory, setSelectedCategory] = useState('')
  const [viewMode, setViewMode] = useState('grid')

  const { videos, loading, refetch } = useVideos({
    search: search || undefined,
    category: selectedCategory || undefined,
  })
  const categories = useCategories()

  const [deleting, setDeleting] = useState(null)

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this video? This will also remove it from Bunny Stream.')) return
    setDeleting(id)
    try {
      await videoAPI.delete(id)
      refetch()
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  const handleSync = async (id) => {
    await videoAPI.syncStatus(id)
    refetch()
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4 sm:px-12">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Library</h1>
            <p className="text-gray-500 text-sm mt-1">{videos.length} video{videos.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex items-center bg-[#111] border border-gray-800 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-500 mr-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="bg-transparent text-white text-sm outline-none w-32 sm:w-48 placeholder-gray-600"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-500 hover:text-white ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View mode */}
            <div className="flex bg-[#111] border border-gray-800 rounded-lg">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-l-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-r-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="flex gap-2 mb-8 overflow-x-auto hide-scrollbar pb-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !selectedCategory ? 'bg-white text-black' : 'bg-[#1c1c1c] text-gray-400 hover:text-white'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === cat ? 'bg-white text-black' : 'bg-[#1c1c1c] text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Empty */}
        {!loading && videos.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No videos found</p>
          </div>
        )}

        {/* Grid view */}
        {!loading && viewMode === 'grid' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {videos.map((video) => (
              <div key={video.id} className="relative group/card">
                <VideoCard video={video} size="small" />
                <div className="absolute top-2 left-2 opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1 z-20">
                  {video.status === 'processing' && (
                    <button
                      onClick={(e) => { e.preventDefault(); handleSync(video.id) }}
                      className="p-1.5 bg-black/80 rounded-md text-gray-300 hover:text-white"
                      title="Sync status"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(video.id) }}
                    className="p-1.5 bg-black/80 rounded-md text-gray-300 hover:text-red-400"
                    title="Delete"
                  >
                    {deleting === video.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List view */}
        {!loading && viewMode === 'list' && (
          <div className="space-y-2">
            {videos.map((video) => (
              <a
                key={video.id}
                href={`/watch/${video.id}`}
                className="flex items-center gap-4 p-3 bg-[#111] rounded-lg hover:bg-[#1a1a1a] transition-colors group"
              >
                <div className="w-32 sm:w-40 aspect-video rounded-md overflow-hidden bg-[#1a1a1a] shrink-0">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">{video.title}</h3>
                  <p className="text-xs text-gray-500 mt-1 truncate">{video.description || 'No description'}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[11px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">{video.category}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      video.status === 'ready' ? 'bg-green-500/10 text-green-400' :
                      video.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {video.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(video.id) }}
                    className="p-2 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
