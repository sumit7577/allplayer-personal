import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export const videoAPI = {
  getAll: (params) => api.get('/videos', { params }),
  getById: (id) => api.get(`/videos/${id}`),
  addFromTelegram: (data) => api.post('/videos/telegram', data),
  addFromURL: (data) => api.post('/videos/url', data),
  syncStatus: (id) => api.post(`/videos/${id}/sync`),
  update: (id, data) => api.put(`/videos/${id}`, data),
  delete: (id) => api.delete(`/videos/${id}`),
  getCategories: () => api.get('/categories'),
}

export const telegramAPI = {
  getBotInfo: () => api.get('/telegram/bot'),
  getFiles: (status = 'pending') => api.get('/telegram/files', { params: { status } }),
  getStats: () => api.get('/telegram/stats'),
  importFile: (id, data) => api.post(`/telegram/files/${id}/import`, data),
  deleteFile: (id) => api.delete(`/telegram/files/${id}`),
  getTransferProgress: (taskId) => `/api/transfer/progress/${taskId}`,
}

export default api
