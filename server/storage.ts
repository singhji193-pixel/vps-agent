import {
  users, otpCodes, vpsServers, conversations, messages, testRuns, testSteps, githubIntegrations, commandHistory,
  customAgents, conversationSummaries, apiUsage,
  type User, type InsertUser,
  type OtpCode, type InsertOtpCode,
  type VpsServer, type InsertVpsServer,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type TestRun, type InsertTestRun,
  type TestStep, type InsertTestStep,
  type GithubIntegration, type InsertGithubIntegration,
  type CommandHistory, type InsertCommandHistory,
  type CustomAgent, type InsertCustomAgent,
  type ConversationSummary, type InsertConversationSummary,
  type ApiUsage, type InsertApiUsage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, lt, gte } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // OTP Codes
  createOtpCode(otp: InsertOtpCode): Promise<OtpCode>;
  getValidOtpCode(email: string, code: string): Promise<OtpCode | undefined>;
  markOtpCodeUsed(id: string): Promise<void>;
  deleteExpiredOtpCodes(): Promise<void>;

  // VPS Servers
  getVpsServers(userId: string): Promise<VpsServer[]>;
  getVpsServer(id: string): Promise<VpsServer | undefined>;
  createVpsServer(server: InsertVpsServer): Promise<VpsServer>;
  updateVpsServer(id: string, updates: Partial<VpsServer>): Promise<VpsServer | undefined>;
  deleteVpsServer(id: string): Promise<void>;

  // Conversations
  getConversations(userId: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getActiveConversation(userId: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation & { parentConversationId?: string; contextSummary?: string }): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined>;
  archiveConversation(id: string, archiveUrl: string, contextSummary: string): Promise<Conversation | undefined>;

  // Messages
  getMessages(conversationId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined>;

  // Test Runs
  getTestRuns(conversationId?: string): Promise<TestRun[]>;
  getTestRun(id: string): Promise<TestRun | undefined>;
  createTestRun(testRun: InsertTestRun): Promise<TestRun>;
  updateTestRun(id: string, updates: Partial<TestRun>): Promise<TestRun | undefined>;

  // Test Steps
  getTestSteps(testRunId: string): Promise<TestStep[]>;
  createTestStep(testStep: InsertTestStep): Promise<TestStep>;
  updateTestStep(id: string, updates: Partial<TestStep>): Promise<TestStep | undefined>;

  // GitHub Integration
  getGithubIntegration(userId: string): Promise<GithubIntegration | undefined>;
  createGithubIntegration(integration: InsertGithubIntegration): Promise<GithubIntegration>;
  updateGithubIntegration(id: string, updates: Partial<GithubIntegration>): Promise<GithubIntegration | undefined>;
  deleteGithubIntegration(userId: string): Promise<void>;

  // Command History
  getCommandHistory(userId: string, vpsServerId?: string): Promise<CommandHistory[]>;
  createCommandHistory(history: InsertCommandHistory): Promise<CommandHistory>;

  // Custom Agents
  getCustomAgents(userId: string): Promise<CustomAgent[]>;
  getCustomAgent(id: string): Promise<CustomAgent | undefined>;
  getDefaultCustomAgent(userId: string): Promise<CustomAgent | undefined>;
  createCustomAgent(agent: InsertCustomAgent): Promise<CustomAgent>;
  updateCustomAgent(id: string, updates: Partial<CustomAgent>): Promise<CustomAgent | undefined>;
  deleteCustomAgent(id: string): Promise<void>;

  // Conversation Summaries
  getConversationSummaries(conversationId: string): Promise<ConversationSummary[]>;
  createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary>;
  getMessageCount(conversationId: string): Promise<number>;

  // API Usage
  getApiUsage(userId: string): Promise<ApiUsage[]>;
  getApiUsageStats(userId: string): Promise<{ totalTokens: number; totalCost: number; requestCount: number }>;
  createApiUsage(usage: InsertApiUsage): Promise<ApiUsage>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // OTP Codes
  async createOtpCode(otp: InsertOtpCode): Promise<OtpCode> {
    const [code] = await db.insert(otpCodes).values(otp).returning();
    return code;
  }

  async getValidOtpCode(email: string, code: string): Promise<OtpCode | undefined> {
    const [otpCode] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, email),
          eq(otpCodes.code, code),
          eq(otpCodes.used, false),
          gte(otpCodes.expiresAt, new Date())
        )
      );
    return otpCode || undefined;
  }

  async markOtpCodeUsed(id: string): Promise<void> {
    await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, id));
  }

  async deleteExpiredOtpCodes(): Promise<void> {
    await db.delete(otpCodes).where(lt(otpCodes.expiresAt, new Date()));
  }

  // VPS Servers
  async getVpsServers(userId: string): Promise<VpsServer[]> {
    return db.select().from(vpsServers).where(eq(vpsServers.userId, userId)).orderBy(desc(vpsServers.createdAt));
  }

  async getVpsServer(id: string): Promise<VpsServer | undefined> {
    const [server] = await db.select().from(vpsServers).where(eq(vpsServers.id, id));
    return server || undefined;
  }

  async createVpsServer(server: InsertVpsServer): Promise<VpsServer> {
    const [created] = await db.insert(vpsServers).values(server).returning();
    return created;
  }

  async updateVpsServer(id: string, updates: Partial<VpsServer>): Promise<VpsServer | undefined> {
    const [server] = await db.update(vpsServers).set(updates).where(eq(vpsServers.id, id)).returning();
    return server || undefined;
  }

  async deleteVpsServer(id: string): Promise<void> {
    await db.delete(vpsServers).where(eq(vpsServers.id, id));
  }

  // Conversations
  async getConversations(userId: string): Promise<Conversation[]> {
    return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation || undefined;
  }

  async getActiveConversation(userId: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.isActive, true)))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    return conversation || undefined;
  }

  async createConversation(conversation: InsertConversation & { parentConversationId?: string; contextSummary?: string }): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conversation).returning();
    return created;
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation || undefined;
  }

  async archiveConversation(id: string, archiveUrl: string, contextSummary: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ 
        archiveUrl, 
        contextSummary,
        archivedAt: new Date(),
        isActive: false,
        updatedAt: new Date() 
      })
      .where(eq(conversations.id, id))
      .returning();
    return conversation || undefined;
  }

  // Messages
  async getMessages(conversationId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async updateMessage(id: string, updates: Partial<Message>): Promise<Message | undefined> {
    const [message] = await db.update(messages).set(updates).where(eq(messages.id, id)).returning();
    return message || undefined;
  }

  // Test Runs
  async getTestRuns(conversationId?: string): Promise<TestRun[]> {
    if (conversationId) {
      return db.select().from(testRuns).where(eq(testRuns.conversationId, conversationId)).orderBy(desc(testRuns.createdAt));
    }
    return db.select().from(testRuns).orderBy(desc(testRuns.createdAt)).limit(20);
  }

  async getTestRun(id: string): Promise<TestRun | undefined> {
    const [testRun] = await db.select().from(testRuns).where(eq(testRuns.id, id));
    return testRun || undefined;
  }

  async createTestRun(testRun: InsertTestRun): Promise<TestRun> {
    const [created] = await db.insert(testRuns).values(testRun).returning();
    return created;
  }

  async updateTestRun(id: string, updates: Partial<TestRun>): Promise<TestRun | undefined> {
    const [testRun] = await db.update(testRuns).set(updates).where(eq(testRuns.id, id)).returning();
    return testRun || undefined;
  }

  // Test Steps
  async getTestSteps(testRunId: string): Promise<TestStep[]> {
    return db.select().from(testSteps).where(eq(testSteps.testRunId, testRunId)).orderBy(testSteps.stepNumber);
  }

  async createTestStep(testStep: InsertTestStep): Promise<TestStep> {
    const [created] = await db.insert(testSteps).values(testStep).returning();
    return created;
  }

  async updateTestStep(id: string, updates: Partial<TestStep>): Promise<TestStep | undefined> {
    const [step] = await db.update(testSteps).set(updates).where(eq(testSteps.id, id)).returning();
    return step || undefined;
  }

  // GitHub Integration
  async getGithubIntegration(userId: string): Promise<GithubIntegration | undefined> {
    const [integration] = await db.select().from(githubIntegrations).where(eq(githubIntegrations.userId, userId));
    return integration || undefined;
  }

  async createGithubIntegration(integration: InsertGithubIntegration): Promise<GithubIntegration> {
    const [created] = await db.insert(githubIntegrations).values(integration).returning();
    return created;
  }

  async updateGithubIntegration(id: string, updates: Partial<GithubIntegration>): Promise<GithubIntegration | undefined> {
    const [integration] = await db.update(githubIntegrations).set(updates).where(eq(githubIntegrations.id, id)).returning();
    return integration || undefined;
  }

  async deleteGithubIntegration(userId: string): Promise<void> {
    await db.delete(githubIntegrations).where(eq(githubIntegrations.userId, userId));
  }

  // Command History
  async getCommandHistory(userId: string, vpsServerId?: string): Promise<CommandHistory[]> {
    if (vpsServerId) {
      return db
        .select()
        .from(commandHistory)
        .where(and(eq(commandHistory.userId, userId), eq(commandHistory.vpsServerId, vpsServerId)))
        .orderBy(desc(commandHistory.executedAt))
        .limit(100);
    }
    return db
      .select()
      .from(commandHistory)
      .where(eq(commandHistory.userId, userId))
      .orderBy(desc(commandHistory.executedAt))
      .limit(100);
  }

  async createCommandHistory(history: InsertCommandHistory): Promise<CommandHistory> {
    const [created] = await db.insert(commandHistory).values(history).returning();
    return created;
  }

  // Custom Agents
  async getCustomAgents(userId: string): Promise<CustomAgent[]> {
    return db.select().from(customAgents).where(eq(customAgents.userId, userId)).orderBy(desc(customAgents.createdAt));
  }

  async getCustomAgent(id: string): Promise<CustomAgent | undefined> {
    const [agent] = await db.select().from(customAgents).where(eq(customAgents.id, id));
    return agent || undefined;
  }

  async getDefaultCustomAgent(userId: string): Promise<CustomAgent | undefined> {
    const [agent] = await db
      .select()
      .from(customAgents)
      .where(and(eq(customAgents.userId, userId), eq(customAgents.isDefault, true)))
      .limit(1);
    return agent || undefined;
  }

  async createCustomAgent(agent: InsertCustomAgent): Promise<CustomAgent> {
    const [created] = await db.insert(customAgents).values(agent).returning();
    return created;
  }

  async updateCustomAgent(id: string, updates: Partial<CustomAgent>): Promise<CustomAgent | undefined> {
    const [agent] = await db
      .update(customAgents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customAgents.id, id))
      .returning();
    return agent || undefined;
  }

  async deleteCustomAgent(id: string): Promise<void> {
    await db.delete(customAgents).where(eq(customAgents.id, id));
  }

  // Conversation Summaries
  async getConversationSummaries(conversationId: string): Promise<ConversationSummary[]> {
    return db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .orderBy(conversationSummaries.createdAt);
  }

  async createConversationSummary(summary: InsertConversationSummary): Promise<ConversationSummary> {
    const [created] = await db.insert(conversationSummaries).values(summary).returning();
    return created;
  }

  async getMessageCount(conversationId: string): Promise<number> {
    const result = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    return result.length;
  }

  // API Usage
  async getApiUsage(userId: string): Promise<ApiUsage[]> {
    return db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.userId, userId))
      .orderBy(desc(apiUsage.createdAt))
      .limit(100);
  }

  async getApiUsageStats(userId: string): Promise<{ totalTokens: number; totalCost: number; requestCount: number }> {
    const usageRecords = await db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.userId, userId));
    
    const totalTokens = usageRecords.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalCost = usageRecords.reduce((sum, r) => sum + parseFloat(r.estimatedCost), 0);
    
    return {
      totalTokens,
      totalCost,
      requestCount: usageRecords.length,
    };
  }

  async createApiUsage(usage: InsertApiUsage): Promise<ApiUsage> {
    const [created] = await db.insert(apiUsage).values(usage).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
