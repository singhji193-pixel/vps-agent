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

// Pending approvals for dangerous commands
export const pendingApprovals = pgTable("pending_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  toolName: text("tool_name").notNull(),
  toolInput: jsonb("tool_input").notNull(),
  pendingCommand: text("pending_command").notNull(),
  explanation: text("explanation"),
  status: text("status").default("pending"), // 'pending' | 'approved' | 'rejected' | 'expired'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Agent task orchestration for multi-step operations
export const agentTasks = pgTable("agent_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  vpsServerId: varchar("vps_server_id").references(() => vpsServers.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("pending"), // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  totalSteps: integer("total_steps").default(0),
  completedSteps: integer("completed_steps").default(0),
  currentStep: text("current_step"),
  result: jsonb("result"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual steps within an agent task
export const agentTaskSteps = pgTable("agent_task_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => agentTasks.id),
  stepNumber: integer("step_number").notNull(),
  toolName: text("tool_name").notNull(),
  toolInput: jsonb("tool_input").notNull(),
  status: text("status").default("pending"), // 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  output: text("output"),
  error: text("error"),
  duration: integer("duration"), // in milliseconds
  createdAt: timestamp("created_at").defaultNow(),
});

// Server metrics history for monitoring
export const serverMetrics = pgTable("server_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  cpuPercent: integer("cpu_percent"),
  memoryPercent: integer("memory_percent"),
  diskPercent: integer("disk_percent"),
  networkIn: integer("network_in"), // bytes
  networkOut: integer("network_out"), // bytes
  loadAverage: text("load_average"),
  processCount: integer("process_count"),
  uptime: integer("uptime"), // seconds
  metadata: jsonb("metadata"),
  recordedAt: timestamp("recorded_at").defaultNow(),
});

// Alerts for monitoring
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  type: text("type").notNull(), // 'cpu' | 'memory' | 'disk' | 'service' | 'security'
  severity: text("severity").default("warning"), // 'info' | 'warning' | 'critical'
  message: text("message").notNull(),
  details: jsonb("details"),
  isRead: boolean("is_read").default(false),
  isResolved: boolean("is_resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
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

// User settings including API keys
export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  anthropicApiKey: text("anthropic_api_key"), // encrypted
  perplexityApiKey: text("perplexity_api_key"), // encrypted
  n8nWebhookUrl: text("n8n_webhook_url"), // n8n webhook for OTP emails
  defaultModel: text("default_model").default("claude-sonnet-4-20250514"),
  commandConfirmation: boolean("command_confirmation").default(true),
  auditLogging: boolean("audit_logging").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Backup configurations for restic repositories
export const backupConfigs = pgTable("backup_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  vpsServerId: varchar("vps_server_id").notNull().references(() => vpsServers.id),
  name: text("name").notNull(),
  repositoryType: text("repository_type").notNull(), // 'local' | 's3' | 'sftp' | 'b2'
  repositoryPath: text("repository_path").notNull(), // local path or bucket URL
  encryptedPassword: text("encrypted_password").notNull(), // restic repo password (encrypted)
  // S3/B2 specific fields (encrypted)
  accessKeyId: text("access_key_id"),
  secretAccessKey: text("secret_access_key"),
  endpoint: text("endpoint"), // for S3-compatible storage
  region: text("region"),
  // SFTP specific fields
  sftpHost: text("sftp_host"),
  sftpUser: text("sftp_user"),
  sftpKeyPath: text("sftp_key_path"),
  // Backup settings
  includePaths: jsonb("include_paths").$type<string[]>(), // paths to backup
  excludePatterns: jsonb("exclude_patterns").$type<string[]>(), // exclude patterns
  retentionDaily: integer("retention_daily").default(7),
  retentionWeekly: integer("retention_weekly").default(4),
  retentionMonthly: integer("retention_monthly").default(12),
  retentionYearly: integer("retention_yearly").default(2),
  isInitialized: boolean("is_initialized").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Backup schedules (cron jobs)
export const backupSchedules = pgTable("backup_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  backupConfigId: varchar("backup_config_id").notNull().references(() => backupConfigs.id),
  cronExpression: text("cron_expression").notNull(), // e.g., '0 2 * * *' for daily at 2 AM
  isEnabled: boolean("is_enabled").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Individual backup snapshots/jobs
export const backupSnapshots = pgTable("backup_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  backupConfigId: varchar("backup_config_id").notNull().references(() => backupConfigs.id),
  snapshotId: text("snapshot_id").notNull(), // restic snapshot ID
  status: text("status").default("running"), // 'running' | 'completed' | 'failed' | 'verifying'
  snapshotType: text("snapshot_type").default("manual"), // 'manual' | 'scheduled'
  sizeBytes: integer("size_bytes"),
  filesNew: integer("files_new"),
  filesChanged: integer("files_changed"),
  filesUnmodified: integer("files_unmodified"),
  duration: integer("duration"), // seconds
  hostname: text("hostname"),
  paths: jsonb("paths").$type<string[]>(),
  tags: jsonb("tags").$type<string[]>(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Backup/Restore operations log
export const backupOperations = pgTable("backup_operations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  backupConfigId: varchar("backup_config_id").notNull().references(() => backupConfigs.id),
  snapshotId: varchar("snapshot_id").references(() => backupSnapshots.id),
  operationType: text("operation_type").notNull(), // 'backup' | 'restore' | 'verify' | 'prune' | 'download'
  status: text("status").default("pending"), // 'pending' | 'running' | 'completed' | 'failed'
  targetPath: text("target_path"), // for restore operations
  progress: integer("progress").default(0), // 0-100
  output: text("output"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
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

export const backupConfigsRelations = relations(backupConfigs, ({ one, many }) => ({
  user: one(users, {
    fields: [backupConfigs.userId],
    references: [users.id],
  }),
  vpsServer: one(vpsServers, {
    fields: [backupConfigs.vpsServerId],
    references: [vpsServers.id],
  }),
  schedules: many(backupSchedules),
  snapshots: many(backupSnapshots),
  operations: many(backupOperations),
}));

export const backupSchedulesRelations = relations(backupSchedules, ({ one }) => ({
  backupConfig: one(backupConfigs, {
    fields: [backupSchedules.backupConfigId],
    references: [backupConfigs.id],
  }),
}));

export const backupSnapshotsRelations = relations(backupSnapshots, ({ one }) => ({
  backupConfig: one(backupConfigs, {
    fields: [backupSnapshots.backupConfigId],
    references: [backupConfigs.id],
  }),
}));

export const backupOperationsRelations = relations(backupOperations, ({ one }) => ({
  user: one(users, {
    fields: [backupOperations.userId],
    references: [users.id],
  }),
  backupConfig: one(backupConfigs, {
    fields: [backupOperations.backupConfigId],
    references: [backupConfigs.id],
  }),
  snapshot: one(backupSnapshots, {
    fields: [backupOperations.snapshotId],
    references: [backupSnapshots.id],
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

export const insertPendingApprovalSchema = createInsertSchema(pendingApprovals).pick({
  userId: true,
  conversationId: true,
  vpsServerId: true,
  toolName: true,
  toolInput: true,
  pendingCommand: true,
  explanation: true,
  expiresAt: true,
});

export const insertAgentTaskSchema = createInsertSchema(agentTasks).pick({
  userId: true,
  conversationId: true,
  vpsServerId: true,
  title: true,
  description: true,
  totalSteps: true,
});

export const insertAgentTaskStepSchema = createInsertSchema(agentTaskSteps).pick({
  taskId: true,
  stepNumber: true,
  toolName: true,
  toolInput: true,
});

export const insertServerMetricsSchema = createInsertSchema(serverMetrics).pick({
  vpsServerId: true,
  cpuPercent: true,
  memoryPercent: true,
  diskPercent: true,
  networkIn: true,
  networkOut: true,
  loadAverage: true,
  processCount: true,
  uptime: true,
  metadata: true,
});

export const insertAlertSchema = createInsertSchema(alerts).pick({
  userId: true,
  vpsServerId: true,
  type: true,
  severity: true,
  message: true,
  details: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).pick({
  userId: true,
  anthropicApiKey: true,
  perplexityApiKey: true,
  n8nWebhookUrl: true,
  defaultModel: true,
  commandConfirmation: true,
  auditLogging: true,
});

export const insertBackupConfigSchema = createInsertSchema(backupConfigs).pick({
  userId: true,
  vpsServerId: true,
  name: true,
  repositoryType: true,
  repositoryPath: true,
  encryptedPassword: true,
  accessKeyId: true,
  secretAccessKey: true,
  endpoint: true,
  region: true,
  sftpHost: true,
  sftpUser: true,
  sftpKeyPath: true,
  retentionDaily: true,
  retentionWeekly: true,
  retentionMonthly: true,
  retentionYearly: true,
}).extend({
  includePaths: z.array(z.string()).optional().nullable(),
  excludePatterns: z.array(z.string()).optional().nullable(),
});

export const insertBackupScheduleSchema = createInsertSchema(backupSchedules).pick({
  backupConfigId: true,
  cronExpression: true,
  isEnabled: true,
});

export const insertBackupSnapshotSchema = createInsertSchema(backupSnapshots).pick({
  backupConfigId: true,
  snapshotId: true,
  snapshotType: true,
  sizeBytes: true,
  filesNew: true,
  filesChanged: true,
  filesUnmodified: true,
  duration: true,
  hostname: true,
}).extend({
  paths: z.array(z.string()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

export const insertBackupOperationSchema = createInsertSchema(backupOperations).pick({
  userId: true,
  backupConfigId: true,
  snapshotId: true,
  operationType: true,
  targetPath: true,
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

export type InsertPendingApproval = z.infer<typeof insertPendingApprovalSchema>;
export type PendingApproval = typeof pendingApprovals.$inferSelect;

export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type AgentTask = typeof agentTasks.$inferSelect;

export type InsertAgentTaskStep = z.infer<typeof insertAgentTaskStepSchema>;
export type AgentTaskStep = typeof agentTaskSteps.$inferSelect;

export type InsertServerMetrics = z.infer<typeof insertServerMetricsSchema>;
export type ServerMetrics = typeof serverMetrics.$inferSelect;

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alerts.$inferSelect;

export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
export type UserSettings = typeof userSettings.$inferSelect;

export type InsertBackupConfig = z.infer<typeof insertBackupConfigSchema>;
export type BackupConfig = typeof backupConfigs.$inferSelect;

export type InsertBackupSchedule = z.infer<typeof insertBackupScheduleSchema>;
export type BackupSchedule = typeof backupSchedules.$inferSelect;

export type InsertBackupSnapshot = z.infer<typeof insertBackupSnapshotSchema>;
export type BackupSnapshot = typeof backupSnapshots.$inferSelect;

export type InsertBackupOperation = z.infer<typeof insertBackupOperationSchema>;
export type BackupOperation = typeof backupOperations.$inferSelect;
