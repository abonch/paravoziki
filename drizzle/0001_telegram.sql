CREATE TABLE telegram_bots (user_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, bot_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL, token_cipher TEXT NOT NULL, webhook_hash TEXT NOT NULL, link_hash TEXT, link_expires INTEGER, telegram_user_id TEXT, chat_id TEXT, created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE telegram_drafts (user_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE telegram_updates (bot_id TEXT NOT NULL, update_id INTEGER NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL, response_json TEXT, PRIMARY KEY (bot_id, update_id));
