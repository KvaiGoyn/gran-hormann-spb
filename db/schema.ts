import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(), createdAt: integer('created_at').notNull(),
  name: text('name').notNull(), phone: text('phone').notNull(),
  topic: text('topic').notNull(), message: text('message').notNull(),
  quoteJson: text('quote_json'), ipHash: text('ip_hash').notNull(),
  consentVersion: text('consent_version').notNull(), requestHash: text('request_hash').notNull()
}, table => [index('leads_rate_limit').on(table.ipHash, table.createdAt)]);
