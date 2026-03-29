package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/itsai/cm/internal/store"
	"github.com/spf13/cobra"
)

// ---- Output helpers ----

func out(v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		outError("json marshal failed: "+err.Error(), "InternalError")
		return
	}
	fmt.Println(string(data))
}

func outError(msg, errType string) {
	data, _ := json.MarshalIndent(map[string]interface{}{
		"success":    false,
		"error":      msg,
		"error_type": errType,
	}, "", "  ")
	fmt.Fprintln(os.Stderr, string(data))
	os.Exit(1)
}

func handleErr(err error) {
	if err == nil {
		return
	}
	switch e := err.(type) {
	case *store.ProjectNotFoundError:
		outError(e.Error(), "ProjectNotFound")
	case *store.ProjectAlreadyExistsError:
		outError(e.Error(), "ProjectAlreadyExists")
	default:
		if strings.Contains(err.Error(), "invalid") || strings.Contains(err.Error(), "cannot") {
			outError(err.Error(), "ValidationError")
		} else {
			outError(err.Error(), "Error")
		}
	}
}

// ---- Data dir resolution ----

func defaultDataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "PersonalBusiness", "context-manager", "data")
}

// ---- Main ----

func main() {
	var dataDir string

	root := &cobra.Command{
		Use:   "cm",
		Short: "Context Manager CLI",
		Long:  "CLI for Context Manager — manage project contexts, session logs, decisions and more.",
	}
	root.PersistentFlags().StringVar(&dataDir, "data-dir", "", "Data directory (default: ~/PersonalBusiness/context-manager/data, or CM_DATA_DIR env)")

	getStore := func() *store.Store {
		dir := dataDir
		if dir == "" {
			dir = os.Getenv("CM_DATA_DIR")
		}
		if dir == "" {
			dir = defaultDataDir()
		}
		return store.New(dir)
	}

	// ---- create-project ----
	var createDesc string
	createProjectCmd := &cobra.Command{
		Use:   "create-project <name>",
		Short: "Create a new project",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			result, err := s.CreateProject(args[0], createDesc)
			handleErr(err)
			out(result)
		},
	}
	createProjectCmd.Flags().StringVar(&createDesc, "desc", "", "Project description")
	root.AddCommand(createProjectCmd)

	// ---- project-exists ----
	root.AddCommand(&cobra.Command{
		Use:   "project-exists <name>",
		Short: "Check if a project exists",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			exists := s.ProjectExists(args[0])
			out(map[string]interface{}{"project": args[0], "exists": exists})
		},
	})

	// ---- list-projects ----
	root.AddCommand(&cobra.Command{
		Use:   "list-projects",
		Short: "List all projects",
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			projects, err := s.ListProjects()
			handleErr(err)
			out(map[string]interface{}{"success": true, "projects": projects, "count": len(projects)})
		},
	})

	// ---- delete-project ----
	root.AddCommand(&cobra.Command{
		Use:   "delete-project <name>",
		Short: "Delete a project and all its data",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			result, err := s.DeleteProject(args[0])
			handleErr(err)
			out(result)
		},
	})

	// ---- save-session ----
	var (
		sessionTask          string
		sessionDone          []string
		sessionChallenges    []string
		sessionDecisions     []string // int64 IDs as strings
		sessionIncomplete    []string
		sessionNextStep      string
		sessionLearning      string
		sessionSuggestions   []string
		sessionStartTime     string
		sessionEndTime       string
		sessionStatus        string
		sessionTags          []string
		sessionRelatedFiles  []string
	)
	saveSessionCmd := &cobra.Command{
		Use:   "save-session <project>",
		Short: "Save a session log",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			var decisionIDs []int64
			for _, d := range sessionDecisions {
				id, err := strconv.ParseInt(strings.TrimSpace(d), 10, 64)
				if err != nil {
					outError("invalid decision id: "+d, "ValidationError")
				}
				decisionIDs = append(decisionIDs, id)
			}
			result, err := s.SaveSessionLog(args[0], store.SessionLogInput{
				Task:          sessionTask,
				WhatDone:      sessionDone,
				Challenges:    sessionChallenges,
				Decisions:     decisionIDs,
				Incomplete:    sessionIncomplete,
				NextStep:      sessionNextStep,
				Learning:      sessionLearning,
				AiSuggestions: sessionSuggestions,
				StartTime:     sessionStartTime,
				EndTime:       sessionEndTime,
				Status:        sessionStatus,
				Tags:          sessionTags,
				RelatedFiles:  sessionRelatedFiles,
			})
			handleErr(err)
			out(result)
		},
	}
	saveSessionCmd.Flags().StringVar(&sessionTask, "task", "", "Main task description (required)")
	saveSessionCmd.Flags().StringArrayVar(&sessionDone, "done", nil, "Completed item (repeatable)")
	saveSessionCmd.Flags().StringArrayVar(&sessionChallenges, "challenge", nil, "Challenge encountered (repeatable)")
	saveSessionCmd.Flags().StringArrayVar(&sessionDecisions, "decision", nil, "Related decision ID (repeatable)")
	saveSessionCmd.Flags().StringArrayVar(&sessionIncomplete, "incomplete", nil, "Incomplete item (repeatable)")
	saveSessionCmd.Flags().StringVar(&sessionNextStep, "next-step", "", "Where to start next session")
	saveSessionCmd.Flags().StringVar(&sessionLearning, "learning", "", "What was learned this session")
	saveSessionCmd.Flags().StringArrayVar(&sessionSuggestions, "suggestion", nil, "AI growth suggestion (repeatable)")
	saveSessionCmd.Flags().StringVar(&sessionStartTime, "start-time", "", "Session start time HH:MM")
	saveSessionCmd.Flags().StringVar(&sessionEndTime, "end-time", "", "Session end time HH:MM")
	saveSessionCmd.Flags().StringVar(&sessionStatus, "status", "completed", "Status: completed|in_progress")
	saveSessionCmd.Flags().StringArrayVar(&sessionTags, "tag", nil, "Tag (repeatable)")
	saveSessionCmd.Flags().StringArrayVar(&sessionRelatedFiles, "file", nil, "Related file path (repeatable)")
	saveSessionCmd.MarkFlagRequired("task")
	root.AddCommand(saveSessionCmd)

	// ---- get-session ----
	root.AddCommand(&cobra.Command{
		Use:   "get-session <project>",
		Short: "Get the latest session log for a project",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			ctx, err := s.GetLatestSession(args[0])
			handleErr(err)
			if ctx == nil {
				out(map[string]interface{}{"success": true, "session": nil, "message": "No session log found"})
				return
			}
			// Parse textContent JSON for readability
			result := map[string]interface{}{
				"success":   true,
				"contextId": ctx.ID,
				"timestamp": ctx.Timestamp,
				"project":   ctx.Project,
				"tags":      ctx.Tags,
				"note":      ctx.Note,
			}
			if tc := textStr(ctx.TextContent); tc != "" {
				var parsed interface{}
				if err := json.Unmarshal([]byte(tc), &parsed); err == nil {
					result["session"] = parsed
				} else {
					result["session"] = tc
				}
			}
			out(result)
		},
	})

	// ---- save-decision ----
	var (
		decTitle        string
		decContext      string
		decDecision     string
		decConsequences string
		decAlternatives []string
		decTags         []string
		decFiles        []string
		decRelated      []string
	)
	saveDecisionCmd := &cobra.Command{
		Use:   "save-decision <project>",
		Short: "Save an architecture decision",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			var related []int64
			for _, r := range decRelated {
				id, err := strconv.ParseInt(strings.TrimSpace(r), 10, 64)
				if err == nil {
					related = append(related, id)
				}
			}
			result, err := s.SaveDecision(args[0], decTitle, decContext, decDecision, decConsequences, decAlternatives, decTags, decFiles, related)
			handleErr(err)
			out(result)
		},
	}
	saveDecisionCmd.Flags().StringVar(&decTitle, "title", "", "Decision title (required)")
	saveDecisionCmd.Flags().StringVar(&decContext, "context", "", "Context / background")
	saveDecisionCmd.Flags().StringVar(&decDecision, "decision", "", "The decision made (required)")
	saveDecisionCmd.Flags().StringVar(&decConsequences, "consequences", "", "Consequences of the decision")
	saveDecisionCmd.Flags().StringArrayVar(&decAlternatives, "alternative", nil, "Alternative considered (repeatable)")
	saveDecisionCmd.Flags().StringArrayVar(&decTags, "tag", nil, "Tag (repeatable)")
	saveDecisionCmd.Flags().StringArrayVar(&decFiles, "file", nil, "Related file (repeatable)")
	saveDecisionCmd.Flags().StringArrayVar(&decRelated, "related", nil, "Related context ID (repeatable)")
	saveDecisionCmd.MarkFlagRequired("title")
	saveDecisionCmd.MarkFlagRequired("decision")
	root.AddCommand(saveDecisionCmd)

	// ---- save-problem ----
	var (
		probProblem    string
		probSolution   string
		probRootCause  string
		probPrevention string
		probTags       []string
		probFiles      []string
		probRelated    []string
	)
	saveProblemCmd := &cobra.Command{
		Use:   "save-problem <project>",
		Short: "Save a problem and its solution",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			var related []int64
			for _, r := range probRelated {
				id, err := strconv.ParseInt(strings.TrimSpace(r), 10, 64)
				if err == nil {
					related = append(related, id)
				}
			}
			result, err := s.SaveProblemSolution(args[0], probProblem, probSolution, probRootCause, probPrevention, probTags, probFiles, related)
			handleErr(err)
			out(result)
		},
	}
	saveProblemCmd.Flags().StringVar(&probProblem, "problem", "", "Problem description (required)")
	saveProblemCmd.Flags().StringVar(&probSolution, "solution", "", "Solution (required)")
	saveProblemCmd.Flags().StringVar(&probRootCause, "root-cause", "", "Root cause")
	saveProblemCmd.Flags().StringVar(&probPrevention, "prevention", "", "How to prevent in future")
	saveProblemCmd.Flags().StringArrayVar(&probTags, "tag", nil, "Tag (repeatable)")
	saveProblemCmd.Flags().StringArrayVar(&probFiles, "file", nil, "Related file (repeatable)")
	saveProblemCmd.Flags().StringArrayVar(&probRelated, "related", nil, "Related context ID (repeatable)")
	saveProblemCmd.MarkFlagRequired("problem")
	saveProblemCmd.MarkFlagRequired("solution")
	root.AddCommand(saveProblemCmd)

	// ---- save-discussion ----
	var (
		discTopic        string
		discSummary      string
		discDetails      string
		discParticipants []string
		discTags         []string
		discFiles        []string
		discRelated      []string
		discLinks        []string
	)
	saveDiscussionCmd := &cobra.Command{
		Use:   "save-discussion <project>",
		Short: "Save a discussion",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			var related []int64
			for _, r := range discRelated {
				id, err := strconv.ParseInt(strings.TrimSpace(r), 10, 64)
				if err == nil {
					related = append(related, id)
				}
			}
			result, err := s.SaveDiscussion(args[0], discTopic, discSummary, discDetails, discParticipants, discTags, discFiles, related, discLinks)
			handleErr(err)
			out(result)
		},
	}
	saveDiscussionCmd.Flags().StringVar(&discTopic, "topic", "", "Discussion topic (required)")
	saveDiscussionCmd.Flags().StringVar(&discSummary, "summary", "", "Summary (required)")
	saveDiscussionCmd.Flags().StringVar(&discDetails, "details", "", "Detailed notes")
	saveDiscussionCmd.Flags().StringArrayVar(&discParticipants, "participant", nil, "Participant (repeatable)")
	saveDiscussionCmd.Flags().StringArrayVar(&discTags, "tag", nil, "Tag (repeatable)")
	saveDiscussionCmd.Flags().StringArrayVar(&discFiles, "file", nil, "Related file (repeatable)")
	saveDiscussionCmd.Flags().StringArrayVar(&discRelated, "related", nil, "Related context ID (repeatable)")
	saveDiscussionCmd.Flags().StringArrayVar(&discLinks, "link", nil, "Link (repeatable)")
	saveDiscussionCmd.MarkFlagRequired("topic")
	saveDiscussionCmd.MarkFlagRequired("summary")
	root.AddCommand(saveDiscussionCmd)

	// ---- save-api ----
	var (
		apiName     string
		apiDesc     string
		apiReturns  string
		apiExamples []string
		apiTags     []string
		apiFiles    []string
	)
	saveAPICmd := &cobra.Command{
		Use:   "save-api <project>",
		Short: "Save an API design",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			result, err := s.SaveAPIDesign(args[0], apiName, apiDesc, apiReturns, nil, apiExamples, apiTags, apiFiles)
			handleErr(err)
			out(result)
		},
	}
	saveAPICmd.Flags().StringVar(&apiName, "name", "", "API name (required)")
	saveAPICmd.Flags().StringVar(&apiDesc, "desc", "", "Description (required)")
	saveAPICmd.Flags().StringVar(&apiReturns, "returns", "", "Return value description")
	saveAPICmd.Flags().StringArrayVar(&apiExamples, "example", nil, "Example (repeatable)")
	saveAPICmd.Flags().StringArrayVar(&apiTags, "tag", nil, "Tag (repeatable)")
	saveAPICmd.Flags().StringArrayVar(&apiFiles, "file", nil, "Related file (repeatable)")
	saveAPICmd.MarkFlagRequired("name")
	saveAPICmd.MarkFlagRequired("desc")
	root.AddCommand(saveAPICmd)

	// ---- search ----
	var (
		searchQuery   string
		searchTags    []string
		searchType    string
		searchProject string
		searchFrom    string
		searchTo      string
		searchLimit   int
	)
	searchCmd := &cobra.Command{
		Use:   "search",
		Short: "Search contexts",
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			results, err := s.SearchContexts(store.SearchParams{
				Query:    searchQuery,
				Tags:     searchTags,
				Type:     searchType,
				Project:  searchProject,
				DateFrom: searchFrom,
				DateTo:   searchTo,
				Limit:    searchLimit,
			})
			handleErr(err)
			out(map[string]interface{}{"success": true, "results": results, "count": len(results)})
		},
	}
	searchCmd.Flags().StringVar(&searchQuery, "query", "", "Full-text search query")
	searchCmd.Flags().StringArrayVar(&searchTags, "tag", nil, "Filter by tag (repeatable, AND logic)")
	searchCmd.Flags().StringVar(&searchType, "type", "", "Filter by type (session-log, decision, discussion, etc.)")
	searchCmd.Flags().StringVar(&searchProject, "project", "", "Filter by project")
	searchCmd.Flags().StringVar(&searchFrom, "from", "", "Date from (YYYY-MM-DD)")
	searchCmd.Flags().StringVar(&searchTo, "to", "", "Date to (YYYY-MM-DD)")
	searchCmd.Flags().IntVar(&searchLimit, "limit", 50, "Max results")
	root.AddCommand(searchCmd)

	// ---- recent ----
	var (
		recentProject string
		recentLimit   int
	)
	recentCmd := &cobra.Command{
		Use:   "recent",
		Short: "Get recent contexts",
		Run: func(cmd *cobra.Command, args []string) {
			s := getStore()
			results, err := s.GetRecentContexts(recentProject, recentLimit)
			handleErr(err)
			out(map[string]interface{}{"success": true, "results": results, "count": len(results)})
		},
	}
	recentCmd.Flags().StringVar(&recentProject, "project", "", "Filter by project")
	recentCmd.Flags().IntVar(&recentLimit, "limit", 20, "Max results")
	root.AddCommand(recentCmd)

	// ---- get-context ----
	root.AddCommand(&cobra.Command{
		Use:   "get-context <id>",
		Short: "Get full details of a context by ID",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			id, err := strconv.ParseInt(args[0], 10, 64)
			if err != nil {
				outError("invalid context id: "+args[0], "ValidationError")
			}
			s := getStore()
			ctx, err := s.GetContextDetail(id)
			handleErr(err)
			if ctx == nil {
				outError(fmt.Sprintf("context %d not found", id), "NotFound")
			}
			// Parse textContent if it's JSON
			result := map[string]interface{}{
				"success":        true,
				"id":             ctx.ID,
				"timestamp":      ctx.Timestamp,
				"project":        ctx.Project,
				"tags":           ctx.Tags,
				"note":           ctx.Note,
				"type":           ctx.Type,
				"screenshotPath": ctx.ScreenshotPath,
				"metadata":       ctx.Metadata,
			}
			if tc := textStr(ctx.TextContent); tc != "" {
				var parsed interface{}
				if err := json.Unmarshal([]byte(tc), &parsed); err == nil {
					result["content"] = parsed
				} else {
					result["content"] = tc
				}
			}
			out(result)
		},
	})

	// ---- update-context ----
	var (
		updateContent  string
		updateNote     string
		updateTags     []string
		updateHasContent bool
		updateHasNote    bool
	)
	updateCtxCmd := &cobra.Command{
		Use:   "update-context <id>",
		Short: "Update an existing context",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			id, err := strconv.ParseInt(args[0], 10, 64)
			if err != nil {
				outError("invalid context id: "+args[0], "ValidationError")
			}
			s := getStore()
			var contentPtr, notePtr *string
			if updateHasContent {
				contentPtr = &updateContent
			}
			if updateHasNote {
				notePtr = &updateNote
			}
			var tagsPtr []string
			if cmd.Flags().Changed("tag") {
				tagsPtr = updateTags
			}
			result, err := s.UpdateContext(id, contentPtr, notePtr, tagsPtr, nil)
			handleErr(err)
			out(result)
		},
	}
	updateCtxCmd.Flags().StringVar(&updateContent, "content", "", "New text content")
	updateCtxCmd.Flags().StringVar(&updateNote, "note", "", "New note")
	updateCtxCmd.Flags().StringArrayVar(&updateTags, "tag", nil, "New tags (replaces all existing)")
	updateCtxCmd.Flags().BoolVar(&updateHasContent, "set-content", false, "Apply --content update")
	updateCtxCmd.Flags().BoolVar(&updateHasNote, "set-note", false, "Apply --note update")
	root.AddCommand(updateCtxCmd)

	if err := root.Execute(); err != nil {
		os.Exit(1)
	}
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
