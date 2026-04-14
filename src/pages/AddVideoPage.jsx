import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { videoAPI, telegramAPI } from '../lib/api'
import {
  Send, Link as LinkIcon, Upload, Loader2, CheckCircle2,
  AlertCircle, Film, FolderOpen, FileText, Bot, RefreshCw,
  Download, Trash2, FileVideo, HardDrive, ArrowRight
} from 'lucide-react'

export default function AddVideoPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('telegram') // telegram | url
  const [form, setForm] = useState({
    telegramUrl: '',
    videoUrl: '',
    title: '',
    description: '',
    category: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  // Telegram bot state
  const [botInfo, setBotInfo] = useState(null)
  const [tgFiles, setTgFiles] = useState([])
  const [tgLoading, setTgLoading] = useState(true)
  const [importing, setImporting] = useState(null)
  const [importForm, setImportForm] = useState({})
  const [transferProgress, setTransferProgress] = useState(null)

  // Load bot info and files
  const loadTelegramData = useCallback(async () => {
    setTgLoading(true)
    try {
      const [botRes, filesRes] = await Promise.all([
        telegramAPI.getBotInfo(),
        telegramAPI.getFiles('pending'),
      ])
      setBotInfo(botRes.data)
      setTgFiles(filesRes.data)
    } catch {
      // ignore
    } finally {
      setTgLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTelegramData()
    // Poll for new files every 5 seconds
    const interval = setInterval(async () => {
      try {
        const { data } = await telegramAPI.getFiles('pending')
        setTgFiles(data)
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [loadTelegramData])

  // Handle direct URL / legacy telegram submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setResult(null)

    try {
      if (activeTab === 'url') {
        if (!form.videoUrl.trim()) throw new Error('Video URL is required')
        const { data } = await videoAPI.addFromURL({
          videoUrl: form.videoUrl,
          title: form.title,
          description: form.description,
          category: form.category,
        })
        setResult(data)
        setForm({ telegramUrl: '', videoUrl: '', title: '', description: '', category: '' })
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Import a Telegram file
  const handleImport = async (file) => {
    setImporting(file.id)
    setError('')
    setResult(null)
    setTransferProgress(null)
    const meta = importForm[file.id] || {}
    try {
      const { data, status } = await telegramAPI.importFile(file.id, {
        title: meta.title || file.fileName || 'Untitled',
        description: meta.description || file.caption || '',
        category: meta.category || '',
      })

      // Async import with progress (202)
      if ((status === 202 || data.taskId) && data.taskId) {
        const sseUrl = telegramAPI.getTransferProgress(data.taskId)
        const eventSource = new EventSource(sseUrl)

        eventSource.onmessage = (event) => {
          try {
            const prog = JSON.parse(event.data)
            setTransferProgress(prog)

            if (prog.phase === 'done') {
              eventSource.close()
              setImporting(null)
              setTransferProgress(null)
              setResult({ id: prog.videoId })
              setTgFiles(prev => prev.filter(f => f.id !== file.id))
              setImportForm(prev => { const n = { ...prev }; delete n[file.id]; return n })
            } else if (prog.phase === 'error') {
              eventSource.close()
              setImporting(null)
              setTransferProgress(null)
              setError(prog.error || 'Transfer failed')
            } else if (prog.phase === 'not_found') {
              eventSource.close()
              setImporting(null)
              setTransferProgress(null)
              setError('Transfer task not found')
            }
          } catch {}
        }

        eventSource.onerror = () => {
          eventSource.close()
          setImporting(null)
          setTransferProgress(null)
          setError('Lost connection to transfer progress')
        }
        return
      }

      // Synchronous import (201)
      setResult(data)
      setTgFiles(prev => prev.filter(f => f.id !== file.id))
      setImportForm(prev => { const n = { ...prev }; delete n[file.id]; return n })
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      if (!transferProgress) setImporting(null)
    }
  }

  const handleDeleteFile = async (id) => {
    try {
      await telegramAPI.deleteFile(id)
      setTgFiles(prev => prev.filter(f => f.id !== id))
    } catch {}
  }

  return (
    <div className="min-h-screen pt-24 pb-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Add New Video</h1>
          <p className="text-gray-500">Forward videos from Telegram or paste a direct URL</p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#111] rounded-lg p-1 mb-8">
          <button
            onClick={() => setActiveTab('telegram')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'telegram'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" />
            Telegram Bot
            {tgFiles.length > 0 && (
              <span className="bg-white/20 text-[11px] px-1.5 py-0.5 rounded-full font-bold ml-1">
                {tgFiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium transition-all ${
              activeTab === 'url'
                ? 'bg-accent text-white shadow-lg shadow-accent/20'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            Direct URL
          </button>
        </div>

        {/* Success / Error banners */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-lg mb-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        {result && (
          <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-green-400 font-medium">Video added successfully!</p>
                <p className="text-xs text-gray-500 mt-1">Processing will take a few minutes.</p>
                <button
                  type="button"
                  onClick={() => navigate(`/watch/${result.id}`)}
                  className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                >
                  Watch now <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== TELEGRAM TAB ===== */}
        {activeTab === 'telegram' && (
          <div className="space-y-6">
            {/* Bot connection status */}
            <div className={`p-4 rounded-xl border ${
              botInfo?.connected
                ? 'bg-green-500/5 border-green-500/20'
                : 'bg-yellow-500/5 border-yellow-500/20'
            }`}>
              <div className="flex items-center gap-3">
                <Bot className={`w-5 h-5 ${botInfo?.connected ? 'text-green-400' : 'text-yellow-400'}`} />
                {tgLoading ? (
                  <span className="text-sm text-gray-400">Connecting to Telegram bot...</span>
                ) : botInfo?.connected ? (
                  <div className="flex-1">
                    <p className="text-sm text-green-400 font-medium">
                      Connected to @{botInfo.username}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Forward any video from Telegram to this bot — it will appear below
                    </p>
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="text-sm text-yellow-400 font-medium">Bot not connected</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Set your TELEGRAM_BOT_TOKEN in server/.env and restart the server
                    </p>
                  </div>
                )}
                <button
                  onClick={loadTelegramData}
                  className="p-2 text-gray-500 hover:text-white transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-[#111] rounded-xl border border-gray-800/50 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">How to upload from Telegram</h3>
              <div className="space-y-3">
                {[
                  {
                    step: '1',
                    title: 'Find your video in any Telegram chat/channel',
                    desc: 'Even private channels like t.me/c/...',
                  },
                  {
                    step: '2',
                    title: botInfo?.connected ? `Forward it to @${botInfo.username}` : 'Forward it to your bot',
                    desc: 'Long press → Forward → send to bot',
                  },
                  {
                    step: '3',
                    title: 'It appears here instantly',
                    desc: 'Click "Import" to upload to Bunny Stream',
                  },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {step}
                    </div>
                    <div>
                      <p className="text-sm text-gray-300">{title}</p>
                      <p className="text-xs text-gray-600">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Received files */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-gray-500" />
                  Received Files
                  {tgFiles.length > 0 && (
                    <span className="bg-primary/20 text-primary text-[11px] px-2 py-0.5 rounded-full font-bold">
                      {tgFiles.length}
                    </span>
                  )}
                </h3>
                <button
                  onClick={loadTelegramData}
                  className="text-xs text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {tgFiles.length === 0 ? (
                <div className="text-center py-12 bg-[#111] rounded-xl border border-dashed border-gray-800">
                  <FileVideo className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No pending files</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {botInfo?.connected
                      ? `Forward a video to @${botInfo.username} to get started`
                      : 'Connect your Telegram bot first'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tgFiles.map((file) => (
                    <TelegramFileCard
                      key={file.id}
                      file={file}
                      importing={importing === file.id}
                      progress={importing === file.id ? transferProgress : null}
                      form={importForm[file.id] || {}}
                      onFormChange={(data) => setImportForm(prev => ({ ...prev, [file.id]: { ...(prev[file.id] || {}), ...data } }))}
                      onImport={() => handleImport(file)}
                      onDelete={() => handleDeleteFile(file.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== DIRECT URL TAB ===== */}
        {activeTab === 'url' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <LinkIcon className="w-3.5 h-3.5 text-accent" />
                Video URL
              </label>
              <input
                type="url"
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="https://example.com/video.mp4"
                className="w-full bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <Film className="w-3.5 h-3.5 text-gray-500" /> Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Enter video title..."
                className="w-full bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <FolderOpen className="w-3.5 h-3.5 text-gray-500" /> Category
              </label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Movies, Series, Tutorials..."
                className="w-full bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <FileText className="w-3.5 h-3.5 text-gray-500" /> Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={3}
                className="w-full bg-[#111] border border-gray-800 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-semibold text-sm bg-accent hover:bg-blue-500 text-white shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="w-4 h-4" /> Add Video</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ---------- Telegram File Card Component ----------

function TelegramFileCard({ file, importing, progress, form, onFormChange, onImport, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-[#111] rounded-xl border border-gray-800/50 overflow-hidden">
      {/* File header */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileVideo className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{file.fileName || 'Unknown file'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-gray-500 flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatBytes(file.fileSize)}
            </span>
            <span className="text-[11px] text-gray-600">•</span>
            <span className="text-[11px] text-gray-500">{file.chatTitle}</span>
            {file.mimeType && (
              <>
                <span className="text-[11px] text-gray-600">•</span>
                <span className="text-[11px] text-gray-500">{file.mimeType}</span>
              </>
            )}
          </div>
          {file.caption && (
            <p className="text-xs text-gray-400 mt-1 truncate">{file.caption}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!importing && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-md hover:bg-primary-hover transition-colors"
            >
              {expanded ? 'Close' : 'Import'}
            </button>
          )}
          {!importing && (
            <button
              onClick={onDelete}
              className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
              title="Dismiss"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress display */}
      {importing && progress && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-800/50 space-y-3">
          <TransferProgressUI progress={progress} totalSize={file.fileSize} />
        </div>
      )}

      {/* Importing without progress (sync mode) */}
      {importing && !progress && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-800/50">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Importing to Bunny Stream...
          </div>
        </div>
      )}

      {/* Expanded import form */}
      {expanded && !importing && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-800/50 space-y-3">
          <input
            type="text"
            value={form.title ?? file.fileName?.replace(/\.(mp4|mkv|avi|webm)$/i, '') ?? ''}
            onChange={(e) => onFormChange({ title: e.target.value })}
            placeholder="Title"
            className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-primary/40 transition-colors"
          />
          <input
            type="text"
            value={form.category ?? ''}
            onChange={(e) => onFormChange({ category: e.target.value })}
            placeholder="Category (e.g. Movies, Series)"
            className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-primary/40 transition-colors"
          />
          <textarea
            value={form.description ?? file.caption ?? ''}
            onChange={(e) => onFormChange({ description: e.target.value })}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-[#0a0a0a] border border-gray-800 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-primary/40 transition-colors resize-none"
          />
          <button
            onClick={onImport}
            disabled={importing}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-all"
          >
            <Upload className="w-4 h-4" /> Upload to Bunny Stream
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Transfer Progress Component ----------

function TransferProgressUI({ progress }) {
  const phase = progress.phase
  const isDownloading = phase === 'downloading' || phase === 'starting'
  const isUploading = phase === 'uploading'

  return (
    <div className="space-y-3">
      {/* Download progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Download className={`w-3.5 h-3.5 ${isDownloading ? 'text-blue-400' : phase === 'uploading' || phase === 'done' ? 'text-green-400' : 'text-gray-500'}`} />
            <span className="text-xs font-medium text-gray-300">
              {isDownloading ? 'Downloading from Telegram...' : 'Downloaded'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isDownloading && progress.downloadSpeed > 0 && (
              <span className="text-[11px] text-blue-400 font-mono">
                {formatSpeed(progress.downloadSpeed)}
              </span>
            )}
            <span className="text-[11px] text-gray-500 font-mono">
              {formatBytes(progress.downloadedBytes)}{progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ''}
            </span>
          </div>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isDownloading ? 'bg-blue-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(progress.downloadPct || 0, 100)}%` }}
          />
        </div>
        {isDownloading && progress.downloadPct > 0 && (
          <p className="text-[10px] text-gray-600 mt-0.5 text-right">
            {progress.downloadPct.toFixed(1)}%
            {progress.downloadSpeed > 0 && progress.totalBytes > progress.downloadedBytes && (
              <> · ETA {formatETA((progress.totalBytes - progress.downloadedBytes) / progress.downloadSpeed)}</>
            )}
          </p>
        )}
      </div>

      {/* Upload progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Upload className={`w-3.5 h-3.5 ${isUploading ? 'text-purple-400' : phase === 'done' ? 'text-green-400' : 'text-gray-600'}`} />
            <span className="text-xs font-medium text-gray-300">
              {isUploading ? 'Uploading to Bunny Stream...' : phase === 'done' ? 'Uploaded' : 'Waiting...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isUploading && progress.uploadSpeed > 0 && (
              <span className="text-[11px] text-purple-400 font-mono">
                {formatSpeed(progress.uploadSpeed)}
              </span>
            )}
            {(isUploading || phase === 'done') && (
              <span className="text-[11px] text-gray-500 font-mono">
                {formatBytes(progress.uploadedBytes)}{progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isUploading ? 'bg-purple-500' : phase === 'done' ? 'bg-green-500' : 'bg-gray-700'
            }`}
            style={{ width: `${Math.min(progress.uploadPct || 0, 100)}%` }}
          />
        </div>
        {isUploading && progress.uploadPct > 0 && (
          <p className="text-[10px] text-gray-600 mt-0.5 text-right">
            {progress.uploadPct.toFixed(1)}%
            {progress.uploadSpeed > 0 && progress.totalBytes > progress.uploadedBytes && (
              <> · ETA {formatETA((progress.totalBytes - progress.uploadedBytes) / progress.uploadSpeed)}</>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

function formatBytes(b) {
  if (!b) return '0 B'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s'
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  if (bytesPerSec < 1024 * 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`
}

function formatETA(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
