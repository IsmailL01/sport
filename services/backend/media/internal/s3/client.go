// Package s3 — обёртка над minio-go для presigned URL + bucket management.
package s3

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const (
	UploadTTL   = 15 * time.Minute
	DownloadTTL = 1 * time.Hour
)

type Client struct {
	// public — для signing presigned URLs (host который видит client)
	public *minio.Client
	// internal — для прямых server-side операций (HEAD, RemoveObject)
	internal *minio.Client
	bucket   string
}

type Config struct {
	PublicEndpoint   string // s3.148-253-214-156.sslip.io
	InternalEndpoint string // minio:9000
	AccessKey        string
	SecretKey        string
	Bucket           string
	Region           string
	UseSSL           bool // public uses HTTPS via Caddy
}

func New(ctx context.Context, cfg Config) (*Client, error) {
	pub, err := minio.New(cfg.PublicEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: true, // public всегда HTTPS (через Caddy)
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("minio public client: %w", err)
	}
	intr, err := minio.New(cfg.InternalEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: false, // internal docker network — plain HTTP
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("minio internal client: %w", err)
	}
	c := &Client{public: pub, internal: intr, bucket: cfg.Bucket}

	// Ensure bucket exists.
	exists, err := intr.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("bucket exists check: %w", err)
	}
	if !exists {
		if err := intr.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, fmt.Errorf("create bucket: %w", err)
		}
	}
	return c, nil
}

// PresignedPut — для client upload. TTL = UploadTTL.
// Возвращает URL который client использует в HTTP PUT с body = bytes.
func (c *Client) PresignedPut(ctx context.Context, key string) (string, error) {
	u, err := c.public.PresignedPutObject(ctx, c.bucket, key, UploadTTL)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// PresignedGet — для client download. TTL = DownloadTTL.
func (c *Client) PresignedGet(ctx context.Context, key string) (string, error) {
	u, err := c.public.PresignedGetObject(ctx, c.bucket, key, DownloadTTL, url.Values{})
	if err != nil {
		return "", err
	}
	return u.String(), nil
}

// StatObject — server-side проверка существования + размера (для confirm complete).
func (c *Client) StatObject(ctx context.Context, key string) (size int64, exists bool, err error) {
	info, err := c.internal.StatObject(ctx, c.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		// minio-go errors don't have nice typing — check by error string.
		errResp := minio.ToErrorResponse(err)
		if errResp.Code == "NoSuchKey" || errResp.StatusCode == 404 {
			return 0, false, nil
		}
		return 0, false, err
	}
	return info.Size, true, nil
}

// RemoveObject.
func (c *Client) RemoveObject(ctx context.Context, key string) error {
	return c.internal.RemoveObject(ctx, c.bucket, key, minio.RemoveObjectOptions{})
}
