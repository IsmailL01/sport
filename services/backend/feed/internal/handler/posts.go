// Posts/likes/comments HTTP handlers — Phase 8 / D.
//
// Идентичный паттерн с http.go (stories): readJSON → validate → svc call →
// writeServiceError либо writeJSON. JWT auth требуется на всех маршрутах.
package handler

import (
	"context"
	"net/http"
	"strconv"

	"github.com/runningecosystem/backend/feed/internal/domain"
	"github.com/runningecosystem/backend/feed/internal/service"
)

// === DTOs ===

type createPostRequest struct {
	Kind       string  `json:"kind"`                 // text | photo | session
	Body       *string `json:"body,omitempty"`
	MediaID    *string `json:"mediaId,omitempty"`
	SessionRef *string `json:"sessionRef,omitempty"`
}

type postDTO struct {
	ID           string  `json:"id"`
	AuthorID     string  `json:"authorId"`
	Kind         string  `json:"kind"`
	Body         *string `json:"body,omitempty"`
	MediaID      *string `json:"mediaId,omitempty"`
	SessionRef   *string `json:"sessionRef,omitempty"`
	LikeCount    int     `json:"likeCount"`
	CommentCount int     `json:"commentCount"`
	CreatedAt    int64   `json:"createdAt"`
	EditedAt     *int64  `json:"editedAt,omitempty"`
	ILiked       bool    `json:"iLiked"`
}

type feedPageDTO struct {
	Items      []postDTO `json:"items"`
	NextCursor string    `json:"nextCursor"`
}

type commentDTO struct {
	ID        string `json:"id"`
	PostID    string `json:"postId"`
	AuthorID  string `json:"authorId"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
}

type commentsPageDTO struct {
	Items      []commentDTO `json:"items"`
	NextCursor string       `json:"nextCursor"`
}

func postToDTO(p *domain.Post, iLiked bool) postDTO {
	var editedAt *int64
	if p.EditedAt != nil {
		v := p.EditedAt.UnixMilli()
		editedAt = &v
	}
	return postDTO{
		ID: p.ID, AuthorID: p.AuthorID, Kind: string(p.Kind),
		Body: p.Body, MediaID: p.MediaID, SessionRef: p.SessionRef,
		LikeCount: p.LikeCount, CommentCount: p.CommentCount,
		CreatedAt: p.CreatedAt.UnixMilli(),
		EditedAt:  editedAt,
		ILiked:    iLiked,
	}
}

func commentToDTO(c *domain.PostComment) commentDTO {
	return commentDTO{
		ID: c.ID, PostID: c.PostID, AuthorID: c.AuthorID,
		Body: c.Body, CreatedAt: c.CreatedAt.UnixMilli(),
	}
}

// === handlers ===

func (h *Handler) createPost(w http.ResponseWriter, r *http.Request) {
	var req createPostRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if !h.rateLimit(w, ctx, "post", actorID, postsPerMinute, rateWindowMinute) {
		return
	}
	post, err := h.svc.CreatePost(ctx, actorID, service.CreatePostInput{
		Kind:       domain.PostKind(req.Kind),
		Body:       req.Body,
		MediaID:    req.MediaID,
		SessionRef: req.SessionRef,
	})
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, postToDTO(post, false))
}

func (h *Handler) getPost(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	post, err := h.svc.GetPost(ctx, id)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, postToDTO(post, false))
}

func (h *Handler) deletePost(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.DeletePost(ctx, actorID, id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) likePost(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.LikePost(ctx, actorID, id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) unlikePost(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.UnlikePost(ctx, actorID, id); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) homeFeed(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	cursor := r.URL.Query().Get("cursor")
	limit := 50
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	posts, next, err := h.svc.HomeFeed(ctx, actorID, cursor, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	items := make([]postDTO, len(posts))
	for i, p := range posts {
		items[i] = postToDTO(&p.Post, p.ILiked)
	}
	writeJSON(w, http.StatusOK, feedPageDTO{Items: items, NextCursor: next})
}

// === comments ===

type createCommentRequest struct {
	Body string `json:"body"`
}

func (h *Handler) commentOnPost(w http.ResponseWriter, r *http.Request) {
	var req createCommentRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	actorID := userIDFromContext(r.Context())
	postID := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if !h.rateLimit(w, ctx, "cmt", actorID, commentsPerMinute, rateWindowMinute) {
		return
	}
	c, err := h.svc.CommentOnPost(ctx, actorID, postID, req.Body)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, commentToDTO(c))
}

func (h *Handler) listComments(w http.ResponseWriter, r *http.Request) {
	postID := r.PathValue("id")
	cursor := r.URL.Query().Get("cursor")
	limit := 50
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	comments, next, err := h.svc.ListComments(ctx, postID, cursor, limit)
	if err != nil {
		writeServiceError(w, err)
		return
	}
	items := make([]commentDTO, len(comments))
	for i, c := range comments {
		items[i] = commentToDTO(c)
	}
	writeJSON(w, http.StatusOK, commentsPageDTO{Items: items, NextCursor: next})
}

func (h *Handler) deleteComment(w http.ResponseWriter, r *http.Request) {
	actorID := userIDFromContext(r.Context())
	postID := r.PathValue("postId")
	commentID := r.PathValue("commentId")
	ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
	defer cancel()
	if err := h.svc.DeleteComment(ctx, actorID, postID, commentID); err != nil {
		writeServiceError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
