import { useState, useEffect, useCallback } from 'react'
import { videoAPI } from '../lib/api'

export function useVideos(params = {}) {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true)
      const { data } = await videoAPI.getAll(params)
      setVideos(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [JSON.stringify(params)])

  useEffect(() => {
    fetchVideos()
  }, [fetchVideos])

  return { videos, loading, error, refetch: fetchVideos }
}

export function useVideo(id) {
  const [video, setVideo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    videoAPI.getById(id)
      .then(({ data }) => setVideo(data))
      .catch(() => setVideo(null))
      .finally(() => setLoading(false))
  }, [id])

  return { video, loading }
}

export function useCategories() {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    videoAPI.getCategories()
      .then(({ data }) => setCategories(data))
      .catch(() => {})
  }, [])

  return categories
}
