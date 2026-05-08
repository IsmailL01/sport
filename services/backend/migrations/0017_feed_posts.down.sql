DROP TRIGGER IF EXISTS trg_post_comments_count ON post_comments;
DROP TRIGGER IF EXISTS trg_post_likes_count ON post_likes;
DROP FUNCTION IF EXISTS posts_comment_count_trigger();
DROP FUNCTION IF EXISTS posts_like_count_trigger();
DROP TABLE IF EXISTS post_comments;
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS posts;
