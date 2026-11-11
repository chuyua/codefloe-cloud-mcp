import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const credentials = sqliteTable("credentials", { userId: text("user_id").primaryKey(), encrypted: text("encrypted").notNull() });
