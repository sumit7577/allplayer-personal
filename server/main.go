package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB
var serverStartTime = time.Now()

// ---------- Models ----------

type Video struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	ThumbnailURL string  `json:"thumbnailUrl"`
	HLSUrl       string  `json:"hlsUrl"`
	BunnyVideoID string  `json:"bunnyVideoId"`
	Duration     float64 `json:"duration"`
	Status       string  `json:"status"`
	Category     string  `json:"category"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type TelegramFile struct {
	ID        string `json:"id"`
	FileID    string `json:"fileId"`
	FileName  string `json:"fileName"`
	FileSize  int64  `json:"fileSize"`
	MimeType  string `json:"mimeType"`
	Caption   string `json:"caption"`
	ChatTitle string `json:"chatTitle"`
	Status    string `json:"status"` // pending, imported
	CreatedAt string `json:"createdAt"`
}

type AddVideoRequest struct {
	TelegramURL string `json:"telegramUrl"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

type AddDirectURLRequest struct {
	VideoURL    string `json:"videoUrl"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

type ImportTelegramFileRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// ---------- Database ----------

func initDB() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./allplayer.db"
	}
	var err error
	db, err = sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		log.Fatal(err)
	}

	tables := []string{
		`CREATE TABLE IF NOT EXISTS videos (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT DEFAULT '',
			thumbnail_url TEXT DEFAULT '',
			hls_url TEXT DEFAULT '',
			bunny_video_id TEXT DEFAULT '',
			duration REAL DEFAULT 0,
			status TEXT DEFAULT 'pending',
			category TEXT DEFAULT 'Uncategorized',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS telegram_files (
			id TEXT PRIMARY KEY,
			file_id TEXT NOT NULL,
			file_unique_id TEXT UNIQUE NOT NULL,
			file_name TEXT DEFAULT '',
			file_size INTEGER DEFAULT 0,
			mime_type TEXT DEFAULT '',
			caption TEXT DEFAULT '',
			chat_title TEXT DEFAULT '',
			status TEXT DEFAULT 'pending',
			created_at TEXT NOT NULL
		);`,
	}

	for _, t := range tables {
		if _, err := db.Exec(t); err != nil {
			log.Fatal(err)
		}
	}
}

// ---------- Bunny Stream API ----------

func bunnyCreateVideo(title string) (string, error) {
	libraryID := os.Getenv("BUNNY_LIBRARY_ID")
	apiKey := os.Getenv("BUNNY_API_KEY")

	payload := fmt.Sprintf(`{"title":"%s"}`, strings.ReplaceAll(title, `"`, `\"`))
	req, err := http.NewRequest("POST",
		fmt.Sprintf("https://video.bunnycdn.com/library/%s/videos", libraryID),
		strings.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("AccessKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	videoID, ok := result["guid"].(string)
	if !ok {
		return "", fmt.Errorf("failed to get video guid from bunny response")
	}
	return videoID, nil
}

func bunnyUploadByURL(bunnyVideoID, sourceURL string) error {
	libraryID := os.Getenv("BUNNY_LIBRARY_ID")
	apiKey := os.Getenv("BUNNY_API_KEY")

	payload := fmt.Sprintf(`{"url":"%s"}`, sourceURL)
	req, err := http.NewRequest("POST",
		fmt.Sprintf("https://video.bunnycdn.com/library/%s/videos/%s/fetch", libraryID, bunnyVideoID),
		strings.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("AccessKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("bunny upload-by-url failed: %d - %s", resp.StatusCode, string(body))
	}
	return nil
}

func bunnyGetVideo(bunnyVideoID string) (map[string]interface{}, error) {
	libraryID := os.Getenv("BUNNY_LIBRARY_ID")
	apiKey := os.Getenv("BUNNY_API_KEY")

	req, err := http.NewRequest("GET",
		fmt.Sprintf("https://video.bunnycdn.com/library/%s/videos/%s", libraryID, bunnyVideoID),
		nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("AccessKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func bunnyDeleteVideo(bunnyVideoID string) error {
	libraryID := os.Getenv("BUNNY_LIBRARY_ID")
	apiKey := os.Getenv("BUNNY_API_KEY")

	req, err := http.NewRequest("DELETE",
		fmt.Sprintf("https://video.bunnycdn.com/library/%s/videos/%s", libraryID, bunnyVideoID),
		nil)
	if err != nil {
		return err
	}
	req.Header.Set("AccessKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// ---------- Telegram Bot Polling ----------

var lastUpdateID int64
var updateMu sync.Mutex

// getServerStats builds a formatted stats message
func getServerStats() string {
	uptime := time.Since(serverStartTime)
	days := int(uptime.Hours()) / 24
	hours := int(uptime.Hours()) % 24
	minutes := int(uptime.Minutes()) % 60

	var totalVideos, readyVideos, processingVideos, errorVideos int
	var pendingFiles, importedFiles int
	db.QueryRow("SELECT COUNT(*) FROM videos").Scan(&totalVideos)
	db.QueryRow("SELECT COUNT(*) FROM videos WHERE status = 'ready'").Scan(&readyVideos)
	db.QueryRow("SELECT COUNT(*) FROM videos WHERE status = 'processing'").Scan(&processingVideos)
	db.QueryRow("SELECT COUNT(*) FROM videos WHERE status = 'error'").Scan(&errorVideos)
	db.QueryRow("SELECT COUNT(*) FROM telegram_files WHERE status = 'pending'").Scan(&pendingFiles)
	db.QueryRow("SELECT COUNT(*) FROM telegram_files WHERE status = 'imported'").Scan(&importedFiles)

	var categories int
	db.QueryRow("SELECT COUNT(DISTINCT category) FROM videos").Scan(&categories)

	var totalDuration float64
	db.QueryRow("SELECT COALESCE(SUM(duration), 0) FROM videos").Scan(&totalDuration)

	msg := fmt.Sprintf(
		"📊 *allPlayer Server Stats*\n"+
			"━━━━━━━━━━━━━━━━━━\n\n"+
			"⏱ *Uptime:* %dd %dh %dm\n"+
			"🌐 *Port:* %s\n\n"+
			"🎬 *Videos*\n"+
			"  Total: %d\n"+
			"  ✅ Ready: %d\n"+
			"  ⏳ Processing: %d\n"+
			"  ❌ Error: %d\n"+
			"  📁 Categories: %d\n"+
			"  🕐 Total Duration: %s\n\n"+
			"📨 *Telegram Files*\n"+
			"  Pending: %d\n"+
			"  Imported: %d\n",
		days, hours, minutes,
		os.Getenv("PORT"),
		totalVideos, readyVideos, processingVideos, errorVideos,
		categories, formatDuration(totalDuration),
		pendingFiles, importedFiles,
	)

	// Fetch Bunny Stream library info
	bunnyInfo := getBunnyLibraryStats()
	if bunnyInfo != "" {
		msg += "\n🐰 *Bunny Stream*\n" + bunnyInfo
	}

	return msg
}

func formatDuration(seconds float64) string {
	h := int(seconds) / 3600
	m := (int(seconds) % 3600) / 60
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

func getBunnyLibraryStats() string {
	libraryID := os.Getenv("BUNNY_LIBRARY_ID")
	apiKey := os.Getenv("BUNNY_API_KEY")
	if libraryID == "" || apiKey == "" {
		return "  ⚠️ Not configured\n"
	}

	req, err := http.NewRequest("GET",
		fmt.Sprintf("https://video.bunnycdn.com/library/%s", libraryID), nil)
	if err != nil {
		return "  ⚠️ Failed to connect\n"
	}
	req.Header.Set("AccessKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "  ⚠️ Failed to connect\n"
	}
	defer resp.Body.Close()

	var lib map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&lib); err != nil {
		return "  ⚠️ Failed to parse response\n"
	}

	var info string
	if name, ok := lib["Name"].(string); ok {
		info += fmt.Sprintf("  Library: %s\n", name)
	}
	if count, ok := lib["VideoCount"].(float64); ok {
		info += fmt.Sprintf("  Videos: %.0f\n", count)
	}
	if storage, ok := lib["StorageUsage"].(float64); ok {
		info += fmt.Sprintf("  Storage: %s\n", formatBytes(int64(storage)))
	}
	if traffic, ok := lib["TrafficUsage"].(float64); ok {
		info += fmt.Sprintf("  Traffic Used: %s\n", formatBytes(int64(traffic)))
	}
	if cdn, ok := lib["PullZones"].([]interface{}); ok && len(cdn) > 0 {
		if zone, ok := cdn[0].(map[string]interface{}); ok {
			if hostname, ok := zone["Hostnames"].([]interface{}); ok && len(hostname) > 0 {
				if h, ok := hostname[0].(map[string]interface{}); ok {
					if val, ok := h["Value"].(string); ok {
						info += fmt.Sprintf("  CDN: %s\n", val)
					}
				}
			}
		}
	}

	if info == "" {
		return "  Connected ✅\n"
	}
	return info
}

func telegramGetFileURL(fileID string) (string, error) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")

	// If it looks like a URL already, return it
	if strings.HasPrefix(fileID, "http") {
		return fileID, nil
	}

	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", botToken, fileID))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if ok, _ := result["ok"].(bool); !ok {
		desc, _ := result["description"].(string)
		return "", fmt.Errorf("telegram API error: %s", desc)
	}

	resultData, ok := result["result"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("failed to get file info from telegram")
	}

	filePath, ok := resultData["file_path"].(string)
	if !ok {
		return "", fmt.Errorf("failed to get file_path — file may be too large for Bot API (>20MB). Use direct URL instead")
	}

	return fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", botToken, filePath), nil
}

// startTelegramPolling runs in background, listening for forwarded videos/documents
func startTelegramPolling() {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" || botToken == "your-telegram-bot-token" {
		log.Println("⚠️  TELEGRAM_BOT_TOKEN not set — Telegram bot polling disabled")
		return
	}

	// Verify bot token
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getMe", botToken))
	if err != nil {
		log.Printf("⚠️  Failed to verify Telegram bot: %v", err)
		return
	}
	defer resp.Body.Close()
	var me map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&me)
	if ok, _ := me["ok"].(bool); ok {
		if r, ok := me["result"].(map[string]interface{}); ok {
			log.Printf("🤖 Telegram bot connected: @%s", r["username"])
		}
	} else {
		log.Println("⚠️  Invalid Telegram bot token — polling disabled")
		return
	}

	go func() {
		log.Println("📡 Telegram polling started — forward videos to your bot")
		for {
			pollTelegramUpdates(botToken)
			time.Sleep(2 * time.Second)
		}
	}()
}

func pollTelegramUpdates(botToken string) {
	updateMu.Lock()
	offset := lastUpdateID + 1
	updateMu.Unlock()

	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=30&allowed_updates=[\"message\"]", botToken, offset)
	resp, err := http.Get(url)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool `json:"ok"`
		Result []struct {
			UpdateID int64 `json:"update_id"`
			Message  *struct {
				Text string `json:"text"`
				Chat struct {
					ID    int64  `json:"id"`
					Title string `json:"title"`
					Type  string `json:"type"`
				} `json:"chat"`
				Video *struct {
					FileID       string `json:"file_id"`
					FileUniqueID string `json:"file_unique_id"`
					FileName     string `json:"file_name"`
					FileSize     int64  `json:"file_size"`
					MimeType     string `json:"mime_type"`
					Duration     int    `json:"duration"`
				} `json:"video"`
				Document *struct {
					FileID       string `json:"file_id"`
					FileUniqueID string `json:"file_unique_id"`
					FileName     string `json:"file_name"`
					FileSize     int64  `json:"file_size"`
					MimeType     string `json:"mime_type"`
				} `json:"document"`
				Caption string `json:"caption"`
			} `json:"message"`
		} `json:"result"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || !result.OK {
		return
	}

	for _, update := range result.Result {
		updateMu.Lock()
		lastUpdateID = update.UpdateID
		updateMu.Unlock()

		if update.Message == nil {
			continue
		}

		msg := update.Message

		// Handle bot commands
		if strings.HasPrefix(msg.Text, "/stats") {
			stats := getServerStats()
			sendTelegramMessage(msg.Chat.ID, stats)
			continue
		}
		if strings.HasPrefix(msg.Text, "/start") {
			welcome := "👋 *Welcome to allPlayer Bot!*\n\n" +
				"Forward any video file to me and I'll make it available for import into allPlayer.\n\n" +
				"*Commands:*\n" +
				"/stats — Server & Bunny Stream stats\n" +
				"/help — Show this message"
			sendTelegramMessage(msg.Chat.ID, welcome)
			continue
		}
		if strings.HasPrefix(msg.Text, "/help") {
			help := "🎬 *allPlayer Bot Commands*\n\n" +
				"/stats — Server uptime, video count, Bunny Stream storage & traffic\n" +
				"/help — Show this message\n\n" +
				"📎 *Forward any video* from a chat/channel to import it."
			sendTelegramMessage(msg.Chat.ID, help)
			continue
		}

		var fileID, fileUniqueID, fileName, mimeType string
		var fileSize int64

		if msg.Video != nil {
			fileID = msg.Video.FileID
			fileUniqueID = msg.Video.FileUniqueID
			fileName = msg.Video.FileName
			fileSize = msg.Video.FileSize
			mimeType = msg.Video.MimeType
			if fileName == "" {
				fileName = "video.mp4"
			}
		} else if msg.Document != nil {
			mime := msg.Document.MimeType
			if strings.HasPrefix(mime, "video/") || strings.Contains(mime, "matroska") || strings.Contains(mime, "mp4") || strings.Contains(mime, "avi") || strings.Contains(mime, "webm") {
				fileID = msg.Document.FileID
				fileUniqueID = msg.Document.FileUniqueID
				fileName = msg.Document.FileName
				fileSize = msg.Document.FileSize
				mimeType = msg.Document.MimeType
			}
		}

		if fileID == "" {
			continue
		}

		caption := msg.Caption
		chatTitle := msg.Chat.Title
		if chatTitle == "" {
			chatTitle = "Direct Message"
		}

		// Check if already exists by file_unique_id
		var existing int
		db.QueryRow("SELECT COUNT(*) FROM telegram_files WHERE file_unique_id = ?", fileUniqueID).Scan(&existing)
		if existing > 0 {
			continue
		}

		now := time.Now().UTC().Format(time.RFC3339)
		id := uuid.New().String()
		db.Exec(
			"INSERT INTO telegram_files (id, file_id, file_unique_id, file_name, file_size, mime_type, caption, chat_title, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
			id, fileID, fileUniqueID, fileName, fileSize, mimeType, caption, chatTitle, now,
		)

		log.Printf("📥 Received: %s (%s) from %s", fileName, formatBytes(fileSize), chatTitle)

		// Send confirmation back to user
		sendTelegramMessage(msg.Chat.ID, fmt.Sprintf("✅ *%s* received!\n📦 Size: %s\n\nOpen allPlayer to import it.", fileName, formatBytes(fileSize)))
	}
}

func sendTelegramMessage(chatID int64, text string) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	payload := fmt.Sprintf(`{"chat_id":%d,"text":"%s","parse_mode":"Markdown"}`, chatID, strings.ReplaceAll(text, `"`, `\"`))
	req, _ := http.NewRequest("POST", fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken), strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	http.DefaultClient.Do(req)
}

func formatBytes(b int64) string {
	if b < 1024 {
		return fmt.Sprintf("%d B", b)
	} else if b < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(b)/1024)
	} else if b < 1024*1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
	}
	return fmt.Sprintf("%.2f GB", float64(b)/(1024*1024*1024))
}

// ---------- Telegram File Handlers ----------

func getTelegramFiles(c *gin.Context) {
	status := c.DefaultQuery("status", "pending")
	rows, err := db.Query(
		"SELECT id, file_id, file_name, file_size, mime_type, caption, chat_title, status, created_at FROM telegram_files WHERE status = ? ORDER BY created_at DESC",
		status,
	)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var files []TelegramFile
	for rows.Next() {
		var f TelegramFile
		if err := rows.Scan(&f.ID, &f.FileID, &f.FileName, &f.FileSize, &f.MimeType, &f.Caption, &f.ChatTitle, &f.Status, &f.CreatedAt); err == nil {
			files = append(files, f)
		}
	}
	if files == nil {
		files = []TelegramFile{}
	}
	c.JSON(200, files)
}

func importTelegramFile(c *gin.Context) {
	id := c.Param("id")
	var req ImportTelegramFileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	var tf TelegramFile
	err := db.QueryRow(
		"SELECT id, file_id, file_name, file_size, mime_type, caption, chat_title, status, created_at FROM telegram_files WHERE id = ?", id,
	).Scan(&tf.ID, &tf.FileID, &tf.FileName, &tf.FileSize, &tf.MimeType, &tf.Caption, &tf.ChatTitle, &tf.Status, &tf.CreatedAt)
	if err != nil {
		c.JSON(404, gin.H{"error": "telegram file not found"})
		return
	}

	// Resolve file_id to download URL
	downloadURL, err := telegramGetFileURL(tf.FileID)
	if err != nil {
		// For large files, the standard Bot API can't provide a download URL
		c.JSON(400, gin.H{
			"error":   "File too large for standard Telegram Bot API (>20MB). Use direct URL upload instead.",
			"fileId":  tf.FileID,
			"details": err.Error(),
		})
		return
	}

	title := req.Title
	if title == "" {
		title = strings.TrimSuffix(tf.FileName, ".mp4")
		title = strings.TrimSuffix(title, ".mkv")
		title = strings.TrimSuffix(title, ".avi")
		title = strings.TrimSuffix(title, ".webm")
		if title == "" {
			title = "Untitled Video"
		}
	}
	category := req.Category
	if category == "" {
		category = "Uncategorized"
	}

	bunnyVideoID, err := bunnyCreateVideo(title)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create video in bunny: " + err.Error()})
		return
	}

	if err := bunnyUploadByURL(bunnyVideoID, downloadURL); err != nil {
		c.JSON(500, gin.H{"error": "failed to upload to bunny: " + err.Error()})
		return
	}

	cdnHost := os.Getenv("BUNNY_CDN_HOSTNAME")
	now := time.Now().UTC().Format(time.RFC3339)
	videoID := uuid.New().String()

	hlsURL := fmt.Sprintf("https://%s/%s/playlist.m3u8", cdnHost, bunnyVideoID)
	thumbnailURL := fmt.Sprintf("https://%s/%s/thumbnail.jpg", cdnHost, bunnyVideoID)

	db.Exec(
		"INSERT INTO videos (id, title, description, thumbnail_url, hls_url, bunny_video_id, status, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		videoID, title, req.Description, thumbnailURL, hlsURL, bunnyVideoID, "processing", category, now, now,
	)

	// Mark telegram file as imported
	db.Exec("UPDATE telegram_files SET status = 'imported' WHERE id = ?", id)

	c.JSON(201, Video{
		ID: videoID, Title: title, Description: req.Description,
		ThumbnailURL: thumbnailURL, HLSUrl: hlsURL,
		BunnyVideoID: bunnyVideoID, Status: "processing",
		Category: category, CreatedAt: now, UpdatedAt: now,
	})
}

func deleteTelegramFile(c *gin.Context) {
	id := c.Param("id")
	db.Exec("DELETE FROM telegram_files WHERE id = ?", id)
	c.JSON(200, gin.H{"message": "deleted"})
}

func getTelegramBotInfo(c *gin.Context) {
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" || botToken == "your-telegram-bot-token" {
		c.JSON(200, gin.H{"connected": false, "message": "Bot token not configured"})
		return
	}

	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getMe", botToken))
	if err != nil {
		c.JSON(200, gin.H{"connected": false, "message": "Failed to connect to Telegram"})
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if ok, _ := result["ok"].(bool); ok {
		if bot, ok := result["result"].(map[string]interface{}); ok {
			c.JSON(200, gin.H{
				"connected": true,
				"username":  bot["username"],
				"name":      bot["first_name"],
			})
			return
		}
	}
	c.JSON(200, gin.H{"connected": false, "message": "Invalid bot token"})
}

// countPendingTelegramFiles used for badge count
func countPendingTelegramFiles() int {
	var count int
	db.QueryRow("SELECT COUNT(*) FROM telegram_files WHERE status = 'pending'").Scan(&count)
	return count
}

func getTelegramStats(c *gin.Context) {
	c.JSON(200, gin.H{"pendingCount": countPendingTelegramFiles()})
}

// ---------- Unused import guard ----------
var _ = strconv.Itoa

// ---------- Handlers ----------

func getVideos(c *gin.Context) {
	category := c.Query("category")
	search := c.Query("search")

	query := "SELECT id, title, description, thumbnail_url, hls_url, bunny_video_id, duration, status, category, created_at, updated_at FROM videos"
	var conditions []string
	var args []interface{}

	if category != "" {
		conditions = append(conditions, "category = ?")
		args = append(args, category)
	}
	if search != "" {
		conditions = append(conditions, "(title LIKE ? OR description LIKE ?)")
		args = append(args, "%"+search+"%", "%"+search+"%")
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY created_at DESC"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var videos []Video
	for rows.Next() {
		var v Video
		if err := rows.Scan(&v.ID, &v.Title, &v.Description, &v.ThumbnailURL, &v.HLSUrl, &v.BunnyVideoID, &v.Duration, &v.Status, &v.Category, &v.CreatedAt, &v.UpdatedAt); err != nil {
			continue
		}
		videos = append(videos, v)
	}

	if videos == nil {
		videos = []Video{}
	}
	c.JSON(200, videos)
}

func getVideo(c *gin.Context) {
	id := c.Param("id")
	var v Video
	err := db.QueryRow("SELECT id, title, description, thumbnail_url, hls_url, bunny_video_id, duration, status, category, created_at, updated_at FROM videos WHERE id = ?", id).Scan(
		&v.ID, &v.Title, &v.Description, &v.ThumbnailURL, &v.HLSUrl, &v.BunnyVideoID, &v.Duration, &v.Status, &v.Category, &v.CreatedAt, &v.UpdatedAt)
	if err != nil {
		c.JSON(404, gin.H{"error": "video not found"})
		return
	}
	c.JSON(200, v)
}

func addVideoFromTelegram(c *gin.Context) {
	var req AddVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	// Resolve telegram URL to downloadable link
	downloadURL, err := telegramGetFileURL(req.TelegramURL)
	if err != nil {
		c.JSON(400, gin.H{"error": "failed to resolve telegram link: " + err.Error()})
		return
	}

	title := req.Title
	if title == "" {
		title = "Untitled Video"
	}
	category := req.Category
	if category == "" {
		category = "Uncategorized"
	}

	// Create video in Bunny Stream
	bunnyVideoID, err := bunnyCreateVideo(title)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create video in bunny: " + err.Error()})
		return
	}

	// Upload by URL to Bunny
	if err := bunnyUploadByURL(bunnyVideoID, downloadURL); err != nil {
		c.JSON(500, gin.H{"error": "failed to upload to bunny: " + err.Error()})
		return
	}

	cdnHost := os.Getenv("BUNNY_CDN_HOSTNAME")
	now := time.Now().UTC().Format(time.RFC3339)
	id := uuid.New().String()

	hlsURL := fmt.Sprintf("https://%s/%s/playlist.m3u8", cdnHost, bunnyVideoID)
	thumbnailURL := fmt.Sprintf("https://%s/%s/thumbnail.jpg", cdnHost, bunnyVideoID)

	_, err = db.Exec(
		"INSERT INTO videos (id, title, description, thumbnail_url, hls_url, bunny_video_id, status, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, title, req.Description, thumbnailURL, hlsURL, bunnyVideoID, "processing", category, now, now)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to save video: " + err.Error()})
		return
	}

	c.JSON(201, Video{
		ID: id, Title: title, Description: req.Description,
		ThumbnailURL: thumbnailURL, HLSUrl: hlsURL,
		BunnyVideoID: bunnyVideoID, Status: "processing",
		Category: category, CreatedAt: now, UpdatedAt: now,
	})
}

func addVideoFromURL(c *gin.Context) {
	var req AddDirectURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	title := req.Title
	if title == "" {
		title = "Untitled Video"
	}
	category := req.Category
	if category == "" {
		category = "Uncategorized"
	}

	bunnyVideoID, err := bunnyCreateVideo(title)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to create video in bunny: " + err.Error()})
		return
	}

	if err := bunnyUploadByURL(bunnyVideoID, req.VideoURL); err != nil {
		c.JSON(500, gin.H{"error": "failed to upload to bunny: " + err.Error()})
		return
	}

	cdnHost := os.Getenv("BUNNY_CDN_HOSTNAME")
	now := time.Now().UTC().Format(time.RFC3339)
	id := uuid.New().String()

	hlsURL := fmt.Sprintf("https://%s/%s/playlist.m3u8", cdnHost, bunnyVideoID)
	thumbnailURL := fmt.Sprintf("https://%s/%s/thumbnail.jpg", cdnHost, bunnyVideoID)

	_, err = db.Exec(
		"INSERT INTO videos (id, title, description, thumbnail_url, hls_url, bunny_video_id, status, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, title, req.Description, thumbnailURL, hlsURL, bunnyVideoID, "processing", category, now, now)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to save video: " + err.Error()})
		return
	}

	c.JSON(201, Video{
		ID: id, Title: title, Description: req.Description,
		ThumbnailURL: thumbnailURL, HLSUrl: hlsURL,
		BunnyVideoID: bunnyVideoID, Status: "processing",
		Category: category, CreatedAt: now, UpdatedAt: now,
	})
}

func syncVideoStatus(c *gin.Context) {
	id := c.Param("id")
	var bunnyVideoID string
	err := db.QueryRow("SELECT bunny_video_id FROM videos WHERE id = ?", id).Scan(&bunnyVideoID)
	if err != nil {
		c.JSON(404, gin.H{"error": "video not found"})
		return
	}

	info, err := bunnyGetVideo(bunnyVideoID)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to fetch from bunny"})
		return
	}

	status := "processing"
	// Bunny status codes: 0 = created, 1 = uploaded, 2 = processing, 3 = transcoding, 4 = finished, 5 = error
	if statusCode, ok := info["status"].(float64); ok {
		switch int(statusCode) {
		case 4:
			status = "ready"
		case 5:
			status = "error"
		default:
			status = "processing"
		}
	}

	duration := 0.0
	if d, ok := info["length"].(float64); ok {
		duration = d
	}

	now := time.Now().UTC().Format(time.RFC3339)
	db.Exec("UPDATE videos SET status = ?, duration = ?, updated_at = ? WHERE id = ?", status, duration, now, id)

	c.JSON(200, gin.H{"status": status, "duration": duration})
}

func deleteVideo(c *gin.Context) {
	id := c.Param("id")
	var bunnyVideoID string
	err := db.QueryRow("SELECT bunny_video_id FROM videos WHERE id = ?", id).Scan(&bunnyVideoID)
	if err != nil {
		c.JSON(404, gin.H{"error": "video not found"})
		return
	}

	if bunnyVideoID != "" {
		bunnyDeleteVideo(bunnyVideoID)
	}

	db.Exec("DELETE FROM videos WHERE id = ?", id)
	c.JSON(200, gin.H{"message": "deleted"})
}

func updateVideo(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		Category    string `json:"category"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid request"})
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	_, err := db.Exec("UPDATE videos SET title = ?, description = ?, category = ?, updated_at = ? WHERE id = ?",
		req.Title, req.Description, req.Category, now, id)
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to update"})
		return
	}
	c.JSON(200, gin.H{"message": "updated"})
}

func getCategories(c *gin.Context) {
	rows, err := db.Query("SELECT DISTINCT category FROM videos ORDER BY category")
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var cat string
		if err := rows.Scan(&cat); err == nil {
			categories = append(categories, cat)
		}
	}
	if categories == nil {
		categories = []string{}
	}
	c.JSON(200, categories)
}

// ---------- Main ----------

func main() {
	godotenv.Load()

	initDB()
	defer db.Close()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept"},
		AllowCredentials: false,
	}))

	api := r.Group("/api")
	{
		api.GET("/videos", getVideos)
		api.GET("/videos/:id", getVideo)
		api.POST("/videos/telegram", addVideoFromTelegram)
		api.POST("/videos/url", addVideoFromURL)
		api.POST("/videos/:id/sync", syncVideoStatus)
		api.PUT("/videos/:id", updateVideo)
		api.DELETE("/videos/:id", deleteVideo)
		api.GET("/categories", getCategories)

		// Telegram bot file management
		api.GET("/telegram/bot", getTelegramBotInfo)
		api.GET("/telegram/files", getTelegramFiles)
		api.GET("/telegram/stats", getTelegramStats)
		api.POST("/telegram/files/:id/import", importTelegramFile)
		api.DELETE("/telegram/files/:id", deleteTelegramFile)
	}

	// Start Telegram bot polling in background
	startTelegramPolling()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	log.Printf("🚀 allPlayer API server running on http://localhost:%s", port)
	r.Run(":" + port)
}
