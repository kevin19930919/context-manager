package store

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
)

// ---- Errors ----

type ProjectNotFoundError struct{ Project string }

func (e *ProjectNotFoundError) Error() string {
	return fmt.Sprintf("Project '%s' does not exist. Please create it first using create_project()", e.Project)
}

type ProjectAlreadyExistsError struct{ Project string }

func (e *ProjectAlreadyExistsError) Error() string {
	return fmt.Sprintf("Project '%s' already exists", e.Project)
}

// ---- Types ----

// Context mirrors the Python context object stored in contexts.json
type Context struct {
	ID             int64                  `json:"id"`
	Timestamp      string                 `json:"timestamp"`
	Project        string                 `json:"project"`
	Tags           []string               `json:"tags"`
	Note           string                 `json:"note"`
	Type           string                 `json:"type"`
	ScreenshotPath interface{}            `json:"screenshotPath"` // null or string
	TextContent    interface{}            `json:"textContent"`    // null or string
	Metadata       map[string]interface{} `json:"metadata"`
	// File-specific (omit when null)
	FileName *string `json:"fileName,omitempty"`
	FileSize *int    `json:"fileSize,omitempty"`
	FilePath *string `json:"filePath,omitempty"`
	FileType *string `json:"fileType,omitempty"`
}

type ProjectMetadata struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	Version     string `json:"version"`
}

// ---- Store ----

type Store struct {
	DataDir        string
	ScreenshotsDir string
	FilesDir       string
}

func New(dataDir string) *Store {
	return &Store{
		DataDir:        dataDir,
		ScreenshotsDir: filepath.Join(dataDir, "screenshots"),
		FilesDir:       filepath.Join(dataDir, "files"),
	}
}

// ---- Validation ----

func (s *Store) ValidateProjectName(project string) error {
	if strings.TrimSpace(project) == "" {
		return fmt.Errorf("project name cannot be empty")
	}
	if project != strings.TrimSpace(project) {
		return fmt.Errorf("project name cannot have leading/trailing whitespace: '%s'", project)
	}
	if len(project) > 255 {
		return fmt.Errorf("project name too long (max 255 characters): %d", len(project))
	}
	if strings.ContainsAny(project, "/\\") {
		return fmt.Errorf("project name cannot contain path separators: '%s'", project)
	}
	if project == "." || project == ".." {
		return fmt.Errorf("project name cannot be '.' or '..'")
	}
	reserved := map[string]bool{"_temp": true, "__all__": true, "__new__": true, "Unassigned": true}
	if reserved[project] {
		return fmt.Errorf("project name '%s' is reserved", project)
	}
	for _, c := range project {
		if c == 0 {
			return fmt.Errorf("project name cannot contain null bytes")
		}
		if unicode.IsControl(c) {
			return fmt.Errorf("project name cannot contain control characters")
		}
	}
	return nil
}

func (s *Store) ProjectExists(project string) bool {
	si, err1 := os.Stat(filepath.Join(s.ScreenshotsDir, project))
	fi, err2 := os.Stat(filepath.Join(s.FilesDir, project))
	return (err1 == nil && si.IsDir()) || (err2 == nil && fi.IsDir())
}

func (s *Store) EnsureProjectExists(project string) error {
	if err := s.ValidateProjectName(project); err != nil {
		return err
	}
	if !s.ProjectExists(project) {
		return &ProjectNotFoundError{Project: project}
	}
	return nil
}

// ---- Project operations ----

func (s *Store) ListProjects() ([]string, error) {
	seen := make(map[string]bool)
	for _, dir := range []string{s.ScreenshotsDir, s.FilesDir} {
		entries, err := os.ReadDir(dir)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return nil, err
		}
		for _, e := range entries {
			if e.IsDir() && e.Name() != "_temp" {
				seen[e.Name()] = true
			}
		}
	}
	result := make([]string, 0, len(seen))
	for p := range seen {
		result = append(result, p)
	}
	sort.Strings(result)
	return result, nil
}

func (s *Store) CreateProject(project, description string) (map[string]interface{}, error) {
	if err := s.ValidateProjectName(project); err != nil {
		return nil, err
	}
	if s.ProjectExists(project) {
		return nil, &ProjectAlreadyExistsError{Project: project}
	}

	screenshotsDir := filepath.Join(s.ScreenshotsDir, project)
	filesDir := filepath.Join(s.FilesDir, project)

	if err := os.MkdirAll(screenshotsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create screenshots dir: %w", err)
	}
	if err := os.MkdirAll(filesDir, 0755); err != nil {
		os.RemoveAll(screenshotsDir)
		return nil, fmt.Errorf("failed to create files dir: %w", err)
	}

	empty := []Context{}
	for _, path := range []string{
		filepath.Join(screenshotsDir, "contexts.json"),
		filepath.Join(filesDir, "contexts.json"),
	} {
		if err := writeJSON(path, empty); err != nil {
			os.RemoveAll(screenshotsDir)
			os.RemoveAll(filesDir)
			return nil, err
		}
	}

	meta := ProjectMetadata{
		Name:        project,
		Description: description,
		CreatedAt:   now(),
		Version:     "1.0",
	}
	if err := writeJSON(filepath.Join(screenshotsDir, "project.json"), meta); err != nil {
		os.RemoveAll(screenshotsDir)
		os.RemoveAll(filesDir)
		return nil, err
	}

	return map[string]interface{}{
		"success": true,
		"project": project,
		"message": fmt.Sprintf("Project '%s' created successfully", project),
		"created": map[string]interface{}{
			"screenshots_dir": screenshotsDir,
			"files_dir":       filesDir,
			"metadata":        meta,
		},
	}, nil
}

func (s *Store) DeleteProject(project string) (map[string]interface{}, error) {
	if strings.TrimSpace(project) == "" {
		return nil, fmt.Errorf("project name cannot be empty")
	}

	var deleted []string
	for _, dir := range []string{
		filepath.Join(s.ScreenshotsDir, project),
		filepath.Join(s.FilesDir, project),
	} {
		if _, err := os.Stat(dir); err == nil {
			if err := os.RemoveAll(dir); err != nil {
				return nil, fmt.Errorf("failed to delete %s: %w", dir, err)
			}
			deleted = append(deleted, dir)
		}
	}

	if len(deleted) == 0 {
		return nil, fmt.Errorf("project '%s' does not exist", project)
	}

	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Successfully deleted project '%s'", project),
		"deleted": deleted,
	}, nil
}

// ---- Context I/O ----

func readContexts(path string) ([]Context, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []Context{}, nil
	}
	if err != nil {
		return nil, err
	}
	var ctxs []Context
	if err := json.Unmarshal(data, &ctxs); err != nil {
		return nil, err
	}
	return ctxs, nil
}

func (s *Store) ReadProjectContexts(project string) ([]Context, error) {
	var all []Context
	for _, path := range []string{
		filepath.Join(s.ScreenshotsDir, project, "contexts.json"),
		filepath.Join(s.FilesDir, project, "contexts.json"),
	} {
		ctxs, err := readContexts(path)
		if err != nil {
			continue // best effort
		}
		all = append(all, ctxs...)
	}
	return all, nil
}

func (s *Store) writeProjectContexts(project string, contexts []Context) error {
	var screenshotCtxs, fileCtxs []Context
	for _, ctx := range contexts {
		sp, hasPath := ctx.ScreenshotPath.(string)
		isScreenshot := ctx.Type == "screenshot" || (hasPath && sp != "")
		if isScreenshot {
			screenshotCtxs = append(screenshotCtxs, ctx)
		} else {
			fileCtxs = append(fileCtxs, ctx)
		}
	}
	if screenshotCtxs == nil {
		screenshotCtxs = []Context{}
	}
	if fileCtxs == nil {
		fileCtxs = []Context{}
	}
	if err := writeJSON(filepath.Join(s.ScreenshotsDir, project, "contexts.json"), screenshotCtxs); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.FilesDir, project, "contexts.json"), fileCtxs)
}

// ---- Create context ----

func (s *Store) CreateContext(project, content, ctxType, note string, tags []string, metadata map[string]interface{}) (map[string]interface{}, error) {
	if err := s.EnsureProjectExists(project); err != nil {
		return nil, err
	}

	// Determine directory and auto-repair if needed
	var projectDir string
	if ctxType == "screenshot" {
		projectDir = filepath.Join(s.ScreenshotsDir, project)
	} else {
		projectDir = filepath.Join(s.FilesDir, project)
	}
	if err := ensureDir(projectDir); err != nil {
		return nil, err
	}

	all, err := s.ReadProjectContexts(project)
	if err != nil {
		return nil, err
	}

	t := time.Now()
	id := t.UnixMilli()
	if tags == nil {
		tags = []string{}
	}
	if metadata == nil {
		metadata = map[string]interface{}{}
	}

	ctx := Context{
		ID:             id,
		Timestamp:      t.Format("2006-01-02T15:04:05.000000"),
		Project:        project,
		Tags:           tags,
		Note:           note,
		Type:           ctxType,
		ScreenshotPath: nil,
		TextContent:    content,
		Metadata:       metadata,
	}
	all = append(all, ctx)

	if err := s.writeProjectContexts(project, all); err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true, "contextId": id}, nil
}

// ---- Higher-level save methods ----

func (s *Store) SaveDiscussion(project, topic, summary, details string, participants, tags, relatedFiles []string, relatedContexts []int64, links []string) (map[string]interface{}, error) {
	if participants == nil {
		participants = []string{"agent", "user"}
	}
	content := map[string]interface{}{
		"topic":        topic,
		"summary":      summary,
		"details":      details,
		"participants": participants,
	}
	meta := map[string]interface{}{
		"related_files":    orEmpty(relatedFiles),
		"related_contexts": orEmptyInt(relatedContexts),
		"links":            orEmpty(links),
	}
	return s.CreateContext(project, mustJSON(content), "discussion",
		"Discussion: "+topic, orDefaultTags(tags, "discussion"), meta)
}

func (s *Store) SaveDecision(project, title, context, decision, consequences string, alternatives, tags, relatedFiles []string, relatedContexts []int64) (map[string]interface{}, error) {
	content := map[string]interface{}{
		"title":        title,
		"context":      context,
		"decision":     decision,
		"consequences": consequences,
		"alternatives": orEmpty(alternatives),
	}
	meta := map[string]interface{}{
		"related_files":    orEmpty(relatedFiles),
		"related_contexts": orEmptyInt(relatedContexts),
	}
	return s.CreateContext(project, mustJSON(content), "decision",
		"Decision: "+title, orDefaultTags(tags, "decision"), meta)
}

func (s *Store) SaveProblemSolution(project, problem, solution, rootCause, prevention string, tags, relatedFiles []string, relatedContexts []int64) (map[string]interface{}, error) {
	note := problem
	if len(note) > 50 {
		note = note[:50]
	}
	content := map[string]interface{}{
		"problem":    problem,
		"root_cause": rootCause,
		"solution":   solution,
		"prevention": prevention,
	}
	meta := map[string]interface{}{
		"related_files":    orEmpty(relatedFiles),
		"related_contexts": orEmptyInt(relatedContexts),
	}
	return s.CreateContext(project, mustJSON(content), "problem-solution",
		"Problem & Solution: "+note, orDefaultTags(tags, "problem-solution"), meta)
}

func (s *Store) SaveAPIDesign(project, name, description, returns string, parameters map[string]interface{}, examples, tags, relatedFiles []string) (map[string]interface{}, error) {
	if parameters == nil {
		parameters = map[string]interface{}{}
	}
	content := map[string]interface{}{
		"name":        name,
		"description": description,
		"parameters":  parameters,
		"returns":     returns,
		"examples":    orEmpty(examples),
	}
	meta := map[string]interface{}{
		"related_files": orEmpty(relatedFiles),
	}
	return s.CreateContext(project, mustJSON(content), "api-design",
		"API: "+name, orDefaultTags(tags, "api-design"), meta)
}

// SessionLogInput holds all fields for a session log entry
type SessionLogInput struct {
	Task          string
	WhatDone      []string
	Challenges    []string
	Decisions     []int64
	Incomplete    []string
	NextStep      string
	Learning      string
	AiSuggestions []string
	StartTime     string
	EndTime       string
	Status        string
	Tags          []string
	RelatedFiles  []string
}

func (s *Store) SaveSessionLog(project string, input SessionLogInput) (map[string]interface{}, error) {
	t := time.Now()
	status := input.Status
	if status == "" {
		status = "completed"
	}
	startTime := input.StartTime
	if startTime == "" {
		startTime = t.Format("15:04")
	}
	endTime := input.EndTime
	if endTime == "" {
		endTime = t.Format("15:04")
	}

	content := map[string]interface{}{
		"task":           input.Task,
		"what_done":      orEmpty(input.WhatDone),
		"challenges":     orEmpty(input.Challenges),
		"decisions":      orEmptyInt(input.Decisions),
		"incomplete":     orEmpty(input.Incomplete),
		"next_step":      input.NextStep,
		"learning":       input.Learning,
		"ai_suggestions": orEmpty(input.AiSuggestions),
		"duration": map[string]string{
			"start": startTime,
			"end":   endTime,
		},
		"status": status,
		"date":   t.Format("2006-01-02"),
	}

	meta := map[string]interface{}{
		"related_files":    orEmpty(input.RelatedFiles),
		"related_contexts": orEmptyInt(input.Decisions),
	}

	return s.CreateContext(project, mustJSON(content), "session-log",
		"Session: "+input.Task, orDefaultTags(input.Tags, "session-log"), meta)
}

// ---- Query methods ----

func (s *Store) GetAllContexts() ([]Context, error) {
	projects, err := s.ListProjects()
	if err != nil {
		return nil, err
	}
	var all []Context
	for _, p := range projects {
		ctxs, err := s.ReadProjectContexts(p)
		if err != nil {
			continue
		}
		all = append(all, ctxs...)
	}
	return all, nil
}

type SearchParams struct {
	Query    string
	Tags     []string
	Type     string
	Project  string
	DateFrom string
	DateTo   string
	Limit    int
}

type ContextSummary struct {
	ID        int64    `json:"id"`
	Timestamp string   `json:"timestamp"`
	Project   string   `json:"project"`
	Tags      []string `json:"tags"`
	Note      string   `json:"note"`
	Type      string   `json:"type"`
	Preview   *string  `json:"preview"`
}

func (s *Store) SearchContexts(params SearchParams) ([]ContextSummary, error) {
	if params.Project != "" {
		if err := s.EnsureProjectExists(params.Project); err != nil {
			return nil, err
		}
	}

	var ctxs []Context
	var err error
	if params.Project != "" {
		ctxs, err = s.ReadProjectContexts(params.Project)
	} else {
		ctxs, err = s.GetAllContexts()
	}
	if err != nil {
		return nil, err
	}

	// Filter by query
	if params.Query != "" {
		keywords := strings.Fields(strings.ToLower(params.Query))
		var filtered []Context
		for _, ctx := range ctxs {
			text := strings.ToLower(ctx.Note + " " + textStr(ctx.TextContent) + " " + strings.Join(ctx.Tags, " "))
			match := true
			for _, kw := range keywords {
				if !strings.Contains(text, kw) {
					match = false
					break
				}
			}
			if match {
				filtered = append(filtered, ctx)
			}
		}
		ctxs = filtered
	}

	// Filter by tags (AND)
	if len(params.Tags) > 0 {
		var filtered []Context
		for _, ctx := range ctxs {
			tagSet := make(map[string]bool)
			for _, t := range ctx.Tags {
				tagSet[t] = true
			}
			match := true
			for _, t := range params.Tags {
				if !tagSet[t] {
					match = false
					break
				}
			}
			if match {
				filtered = append(filtered, ctx)
			}
		}
		ctxs = filtered
	}

	// Filter by type
	if params.Type != "" {
		var filtered []Context
		for _, ctx := range ctxs {
			if ctx.Type == params.Type {
				filtered = append(filtered, ctx)
			}
		}
		ctxs = filtered
	}

	// Filter by date range
	if params.DateFrom != "" {
		from, err := parseTimestamp(params.DateFrom)
		if err == nil {
			var filtered []Context
			for _, ctx := range ctxs {
				t, err := parseTimestamp(ctx.Timestamp)
				if err == nil && !t.Before(from) {
					filtered = append(filtered, ctx)
				}
			}
			ctxs = filtered
		}
	}
	if params.DateTo != "" {
		to, err := parseTimestamp(params.DateTo)
		if err == nil {
			to = to.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			var filtered []Context
			for _, ctx := range ctxs {
				t, err := parseTimestamp(ctx.Timestamp)
				if err == nil && !t.After(to) {
					filtered = append(filtered, ctx)
				}
			}
			ctxs = filtered
		}
	}

	// Sort newest first
	sort.Slice(ctxs, func(i, j int) bool {
		ti, _ := parseTimestamp(ctxs[i].Timestamp)
		tj, _ := parseTimestamp(ctxs[j].Timestamp)
		return ti.After(tj)
	})

	limit := params.Limit
	if limit <= 0 {
		limit = 50
	}
	if len(ctxs) > limit {
		ctxs = ctxs[:limit]
	}

	summaries := make([]ContextSummary, len(ctxs))
	for i, ctx := range ctxs {
		summaries[i] = toSummary(ctx)
	}
	return summaries, nil
}

func (s *Store) GetRecentContexts(project string, limit int) ([]ContextSummary, error) {
	if project != "" {
		if err := s.EnsureProjectExists(project); err != nil {
			return nil, err
		}
	}
	return s.SearchContexts(SearchParams{Project: project, Limit: limit})
}

func (s *Store) GetContextDetail(id int64) (*Context, error) {
	all, err := s.GetAllContexts()
	if err != nil {
		return nil, err
	}
	for _, ctx := range all {
		if ctx.ID == id {
			return &ctx, nil
		}
	}
	return nil, fmt.Errorf("context %d not found", id)
}

func (s *Store) GetLatestSession(project string) (*Context, error) {
	if !s.ProjectExists(project) {
		return nil, nil // first session, not an error
	}
	results, err := s.SearchContexts(SearchParams{
		Project: project,
		Type:    "session-log",
		Limit:   1,
	})
	if err != nil || len(results) == 0 {
		return nil, err
	}
	return s.GetContextDetail(results[0].ID)
}

func (s *Store) UpdateContext(id int64, content, note *string, tags []string, metadata map[string]interface{}) (map[string]interface{}, error) {
	all, err := s.GetAllContexts()
	if err != nil {
		return nil, err
	}
	var target *Context
	for _, ctx := range all {
		if ctx.ID == id {
			c := ctx
			target = &c
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("context %d not found", id)
	}

	project := target.Project
	ctxs, err := s.ReadProjectContexts(project)
	if err != nil {
		return nil, err
	}

	for i, ctx := range ctxs {
		if ctx.ID == id {
			if content != nil {
				ctxs[i].TextContent = *content
			}
			if note != nil {
				ctxs[i].Note = *note
			}
			if tags != nil {
				ctxs[i].Tags = tags
			}
			if metadata != nil {
				ctxs[i].Metadata = metadata
			}
			ctxs[i].Timestamp = time.Now().Format("2006-01-02T15:04:05.000000")
			break
		}
	}

	if err := s.writeProjectContexts(project, ctxs); err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true, "contextId": id}, nil
}

func (s *Store) SaveFile(project, fileData, fileName, fileType, note string, tags []string) (map[string]interface{}, error) {
	if err := s.EnsureProjectExists(project); err != nil {
		return nil, err
	}

	// Determine type
	lower := strings.ToLower(fileName)
	isImage := strings.HasSuffix(lower, ".png") || strings.HasSuffix(lower, ".jpg") ||
		strings.HasSuffix(lower, ".jpeg") || strings.HasSuffix(lower, ".gif") || strings.HasSuffix(lower, ".webp")
	if isImage && fileType == "file" {
		fileType = "screenshot"
	}

	var saveDir string
	if fileType == "screenshot" {
		saveDir = filepath.Join(s.ScreenshotsDir, project)
	} else {
		saveDir = filepath.Join(s.FilesDir, project)
	}
	if err := ensureDir(saveDir); err != nil {
		return nil, err
	}

	fileBytes, err := base64.StdEncoding.DecodeString(fileData)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 data: %w", err)
	}

	t := time.Now()
	id := t.UnixMilli()
	ext := filepath.Ext(fileName)
	base := strings.TrimSuffix(filepath.Base(fileName), ext)
	uniqueName := fmt.Sprintf("%s-%d%s", base, id, ext)
	filePath := filepath.Join(saveDir, uniqueName)

	if err := os.WriteFile(filePath, fileBytes, 0644); err != nil {
		return nil, err
	}

	ctxs, err := s.ReadProjectContexts(project)
	if err != nil {
		return nil, err
	}

	if tags == nil {
		tags = []string{"uploaded"}
	}
	if note == "" {
		note = "Uploaded: " + fileName
	}

	fileSize := len(fileBytes)
	mimeType := getMimeType(fileName)
	ctx := Context{
		ID:        id,
		Timestamp: t.Format("2006-01-02T15:04:05.000000"),
		Project:   project,
		Tags:      tags,
		Note:      note,
		Type:      fileType,
		Metadata:  map[string]interface{}{},
		FileName:  &fileName,
		FileSize:  &fileSize,
		FileType:  &mimeType,
	}
	if fileType == "screenshot" {
		ctx.ScreenshotPath = filePath
		ctx.TextContent = nil
	} else {
		ctx.ScreenshotPath = nil
		ctx.FilePath = &filePath
		// Try to read text content for text files
		extLower := strings.ToLower(ext)
		textExts := map[string]bool{".txt": true, ".md": true, ".json": true, ".csv": true, ".xml": true}
		if textExts[extLower] {
			tc := string(fileBytes)
			ctx.TextContent = tc
		} else {
			ctx.TextContent = nil
		}
	}

	ctxs = append(ctxs, ctx)
	if err := s.writeProjectContexts(project, ctxs); err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"success":   true,
		"contextId": id,
		"filePath":  filePath,
		"fileType":  fileType,
	}, nil
}

// ---- Helpers ----

func now() string {
	return time.Now().Format("2006-01-02T15:04:05.000000")
}

func writeJSON(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func ensureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return err
		}
		return writeJSON(filepath.Join(dir, "contexts.json"), []Context{})
	}
	return nil
}

func mustJSON(v interface{}) string {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(data)
}

func parseTimestamp(s string) (time.Time, error) {
	formats := []string{
		"2006-01-02T15:04:05.000000",
		"2006-01-02T15:04:05.999999",
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02",
	}
	s = strings.TrimSuffix(s, "Z")
	if strings.HasSuffix(s, "Z") {
		s = s[:len(s)-1] + "+00:00"
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("cannot parse timestamp: %s", s)
}

func textStr(v interface{}) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func toSummary(ctx Context) ContextSummary {
	var preview *string
	if tc := textStr(ctx.TextContent); tc != "" {
		p := tc
		if len(p) > 100 {
			p = p[:100] + "..."
		}
		preview = &p
	}
	tags := ctx.Tags
	if tags == nil {
		tags = []string{}
	}
	return ContextSummary{
		ID:        ctx.ID,
		Timestamp: ctx.Timestamp,
		Project:   ctx.Project,
		Tags:      tags,
		Note:      ctx.Note,
		Type:      ctx.Type,
		Preview:   preview,
	}
}

func orEmpty(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func orEmptyInt(s []int64) []int64 {
	if s == nil {
		return []int64{}
	}
	return s
}

func orDefaultTags(tags []string, def string) []string {
	if len(tags) > 0 {
		return tags
	}
	return []string{def}
}

func getMimeType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	mimes := map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".webp": "image/webp",
		".pdf":  "application/pdf",
		".txt":  "text/plain",
		".md":   "text/markdown",
		".json": "application/json",
		".csv":  "text/csv",
		".xml":  "application/xml",
	}
	if m, ok := mimes[ext]; ok {
		return m
	}
	return "application/octet-stream"
}
