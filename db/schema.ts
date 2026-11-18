import { integer, real, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const ratings = sqliteTable('ratings', {
 userId:text('user_id').notNull(), trackId:integer('track_id').notNull(),
 song:text('song').notNull(), score:real('score').notNull(), note:text('note').notNull().default(''), updatedAt:text('updated_at').notNull()
}, t => [primaryKey({columns:[t.userId,t.trackId]})]);
