import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table for OTP authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// OTP codes for email verification
export const otpCodes = pgTable("otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// VPS servers managed by users
export const vpsServers = pgTable("vps_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").default(22),
  username: text("username").notNull(),
  authMethod: text("auth_method").notNull(), // 'password' | 'key'
  encryptedCredential: text("encrypted_credential").notNull(), // encrypted password or private key
  isActive: boolean("is_active").default(true),
  lastConnected: timestamp("last_connected"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Conversations (chat sessions)
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  vpsServerId: varchar("vps_server_id").references(() => vpsServers.id),
  title: text("title").notNull(),
  mode: text("mode").default("chat"), // 'chat' | 'testing' | 'support'
  isActive: boolean("is_active").default(true),
  parentConversationId: varchar("parent_conversation_id"), // For conversation chaining
  archiveUrl: text("archive_url"), // GitHub URL where conversation was archived
  archivedAt: timestamp("archived_at"), // When conversation was archived
  contextSummary: text("context_summary"), // Summary loaded from parent conversation
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages within conversations
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  commandOutput: text("command_output"), // SSH command output if any
  commandStatus: text("command_status"), // 'pending' | 'running' | 'success' | 'error'
  metadata: jsonb("metadata"), // additional data like parsed commands, validation results
  createdAt: timestamp("created_at").defaultNow(),
});

// Test runs for the testing agent
export const testRuns = pgTable("test_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  name: text("name").notNull(),
  status: text("status").default("pending"), // 'pending' | 'running' | 'success' | 'failed'
  totalSteps: integer("total_steps").default(0),
  completedSteps: integer("completed_steps").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual test steps within a test run
export const testSteps = pgTable("test_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  testRunId: varchar("test_run_id").notNull().references(() => testRuns.id),
  stepNumber: integer("step_number").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  command: text("command"),
  expectedOutput: text("expected_output"),
  actualOutput: text("actual_output"),
  status: text("status").default("pending"), // 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  errorMessage: text("error_message"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at").defaultNow(),
});

// GitHub integration settings
export const githubIntegrations = pgTable("github_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  accessToken: text("access_token").notNull(),
  repositoryUrl: text("repository_url"),
  branch: text("branch").default("main"),
  lastSync: timestamp("last_sync"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Custom agent prompts
export const customAgents = pgTable("custom_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Conversation summaries for extended context
export const conversationSummaries = pgTable("conversation_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  summary: text("summary").notNull(),
  messageRange: text("message_range").notNull(), // e.g., "1-50"
  tokenCount: integer("token_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Command history for audit logging
export const commandHistory = pgTable("command_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  command: text("command").notNull(),
  output: text("output"),
  exitCode: integer("exit_code"),
  executedAt: timestamp("executed_at").defaultNow(),
});

// API usage tracking for Claude credits
export const apiUsage = pgTable("api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCost: text("estimated_cost").notNull(), // stored as string to avoid float precision issues
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  vpsServers: many(vpsServers),
  conversations: many(conversations),
  commandHistory: many(commandHistory),
  githubIntegrations: many(githubIntegrations),
}));

export const vpsServersRelations = relations(vpsServers, ({ one, many }) => ({
  user: one(users, {
    fields: [vpsServers.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
  testRuns: many(testRuns),
  commandHistory: many(commandHistory),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  vpsServer: one(vpsServers, {
    fields: [conversations.vpsServerId],
    references: [vpsServers.id],
  }),
  messages: many(messages),
  testRuns: many(testRuns),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const testRunsRelations = relations(testRuns, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [testRuns.conversationId],
    references: [conversations.id],
  }),
  vpsServer: one(vpsServers, {
    fields: [testRuns.vpsServerId],
    references: [vpsServers.id],
  }),
  testSteps: many(testSteps),
}));

export const testStepsRelations = relations(testSteps, ({ one }) => ({
  testRun: one(testRuns, {
    fields: [testSteps.testRunId],
    references: [testRuns.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
});

export const insertOtpCodeSchema = createInsertSchema(otpCodes).pick({
  email: true,
  code: true,
  expiresAt: true,
});

export const insertVpsServerSchema = createInsertSchema(vpsServers).pick({
  userId: true,
  name: true,
  host: true,
  port: true,
  username: true,
  authMethod: true,
  encryptedCredential: true,
});

export const insertConversationSchema = createInsertSchema(conversations).pick({
  userId: true,
  vpsServerId: true,
  title: true,
  mode: true,
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  role: true,
  content: true,
  commandOutput: true,
  commandStatus: true,
  metadata: true,
});

export const insertTestRunSchema = createInsertSchema(testRuns).pick({
  conversationId: true,
  vpsServerId: true,
  name: true,
  totalSteps: true,
});

export const insertTestStepSchema = createInsertSchema(testSteps).pick({
  testRunId: true,
  stepNumber: true,
  name: true,
  description: true,
  command: true,
  expectedOutput: true,
});

export const insertGithubIntegrationSchema = createInsertSchema(githubIntegrations).pick({
  userId: true,
  accessToken: true,
  repositoryUrl: true,
  branch: true,
});

export const insertCommandHistorySchema = createInsertSchema(commandHistory).pick({
  userId: true,
  vpsServerId: true,
  command: true,
  output: true,
  exitCode: true,
});

export const insertCustomAgentSchema = createInsertSchema(customAgents).pick({
  userId: true,
  name: true,
  description: true,
  systemPrompt: true,
  isDefault: true,
});

export const insertConversationSummarySchema = createInsertSchema(conversationSummaries).pick({
  conversationId: true,
  summary: true,
  messageRange: true,
  tokenCount: true,
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).pick({
  userId: true,
  conversationId: true,
  model: true,
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  estimatedCost: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;
export type OtpCode = typeof otpCodes.$inferSelect;

export type InsertVpsServer = z.infer<typeof insertVpsServerSchema>;
export type VpsServer = typeof vpsServers.$inferSelect;

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertTestRun = z.infer<typeof insertTestRunSchema>;
export type TestRun = typeof testRuns.$inferSelect;

export type InsertTestStep = z.infer<typeof insertTestStepSchema>;
export type TestStep = typeof testSteps.$inferSelect;

export type InsertGithubIntegration = z.infer<typeof insertGithubIntegrationSchema>;
export type GithubIntegration = typeof githubIntegrations.$inferSelect;

export type InsertCommandHistory = z.infer<typeof insertCommandHistorySchema>;
export type CommandHistory = typeof commandHistory.$inferSelect;

export type InsertCustomAgent = z.infer<typeof insertCustomAgentSchema>;
export type CustomAgent = typeof customAgents.$inferSelect;

export type InsertConversationSummary = z.infer<typeof insertConversationSummarySchema>;
export type ConversationSummary = typeof conversationSummaries.$inferSelect;

export type InsertApiUsage = z.infer<typeof insertApiUsageSchema>;
export type ApiUsage = typeof apiUsage.$inferSelect;
