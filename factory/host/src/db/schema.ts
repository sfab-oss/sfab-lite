/**
 * Factory-level schema — the factory's own auth and tenancy.
 *
 * **Not app data.** Every generated app keeps its rows in its own AppDataDO's
 * SQLite; nothing here describes an app's contents. This database exists
 * because Durable Objects cannot be enumerated (see `env.d.ts`).
 *
 * Ported from `starters/erp/app/src/db/schema.ts` minus its demo `note`
 * table. The duplication is deliberate: an app's organizations and the
 * factory's organizations are different concepts that happen to share a
 * shape, and coupling them so one cannot change without the other would be
 * the actual mistake. See docs/engineering/terminology.md — "organization"
 * does two jobs.
 */
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const organization = sqliteTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("organization_slug_idx").on(table.slug)]
);

export const member = sqliteTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ]
);

export const invitation = sqliteTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ]
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id").references(
      () => organization.id,
      { onDelete: "set null" }
    ),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  sessions: many(session),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  activeOrganization: one(organization, {
    fields: [session.activeOrganizationId],
    references: [organization.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

/**
 * The app registry — the row that makes `GET /api/protected/apps` answerable.
 *
 * `id` is a **server-generated opaque ULID** (`app_…`), never caller-supplied:
 * the DO's identity *is* this string (`idFromName(id)`), so a human-chosen
 * slug would make renaming impossible and let one tenant collide with
 * another's name. The display name lives in `name` and is free to change.
 *
 * `status` exists because creation is three writes with no transaction across
 * them — this row, the AppDataDO live SQLite, and the AppAgent workspace.
 * The row is written *first* so the UI has something to poll during the ~18-25s
 * seed commit; a crash leaves a visible `creating` row rather than an orphan
 * Durable Object that nothing can enumerate.
 */
export const app = sqliteTable(
  "app",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * Starter catalog id used at create (`base`, `erp`, …). Provenance only —
     * not a runtime mode. SQL default backfills historical rows as `erp`.
     */
    template: text("template").notNull().default("erp"),
    /** `creating` → `ready` | `failed`. Never trust a `creating` row as live. */
    status: text("status").notNull().default("creating"),
    /**
     * Opaque create-job id for polling while status is `creating`. Null once
     * ready. No longer coupled to AppDataDO / AppCreateDO attempts.
     */
    createAttemptId: text("create_attempt_id"),
    /** Tip sha serve reads; builds live in CODE_R2 keyed by appId+sha. */
    liveSha: text("live_sha"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("app_organizationId_idx").on(table.organizationId),
    index("app_status_idx").on(table.status),
  ]
);

/**
 * Isolated agent computer for an app. AppAgent DO name is `id` (`ws_…`).
 * Code host / live tip stay on `appId`; WIP checkout + threads live here.
 */
export const workspace = sqliteTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("workspace_appId_idx").on(table.appId)]
);

/** Branch PR into main — one repo per app. */
export const pullRequest = sqliteTable(
  "pull_request",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    headBranch: text("head_branch").notNull(),
    baseBranch: text("base_branch").notNull().default("main"),
    headSha: text("head_sha").notNull(),
    /** `open` | `merged` | `closed` */
    status: text("status").notNull().default("open"),
    previewSha: text("preview_sha"),
    mergedSha: text("merged_sha"),
    mergedAt: integer("merged_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("pull_request_app_number_uidx").on(table.appId, table.number),
    index("pull_request_app_status_idx").on(table.appId, table.status),
    index("pull_request_app_head_branch_idx").on(table.appId, table.headBranch),
  ]
);

/** Platform-fixed CI/CD check run (not user workflows). */
export const checkRun = sqliteTable(
  "check_run",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => app.id, { onDelete: "cascade" }),
    prId: text("pr_id").references(() => pullRequest.id, {
      onDelete: "set null",
    }),
    sha: text("sha").notNull(),
    name: text("name").notNull(),
    /** `queued` | `in_progress` | `completed` */
    status: text("status").notNull().default("queued"),
    /** `success` | `failure` | `cancelled` when completed */
    conclusion: text("conclusion"),
    detail: text("detail"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("check_run_app_sha_idx").on(table.appId, table.sha),
    index("check_run_pr_idx").on(table.prId),
    index("check_run_app_created_idx").on(table.appId, table.createdAt),
  ]
);

export const appRelations = relations(app, ({ one, many }) => ({
  organization: one(organization, {
    fields: [app.organizationId],
    references: [organization.id],
  }),
  pullRequests: many(pullRequest),
  checkRuns: many(checkRun),
  workspaces: many(workspace),
}));

export const workspaceRelations = relations(workspace, ({ one }) => ({
  app: one(app, {
    fields: [workspace.appId],
    references: [app.id],
  }),
}));

export const pullRequestRelations = relations(pullRequest, ({ one, many }) => ({
  app: one(app, {
    fields: [pullRequest.appId],
    references: [app.id],
  }),
  checkRuns: many(checkRun),
}));

export const checkRunRelations = relations(checkRun, ({ one }) => ({
  app: one(app, {
    fields: [checkRun.appId],
    references: [app.id],
  }),
  pullRequest: one(pullRequest, {
    fields: [checkRun.prId],
    references: [pullRequest.id],
  }),
}));

/**
 * Tables the `jwt` and `@better-auth/oauth-provider` plugins own — the factory
 * as an OAuth 2.1 Authorization Server, which is what makes `/mcp` reachable
 * by any spec-compliant MCP client rather than only by a shared secret.
 *
 * Shapes are the plugins', not ours: they are read back by better-auth through
 * the drizzle adapter, so a column that differs in name or nullability is a
 * runtime failure inside the plugin rather than a type error here. Only
 * `mcpOrganizationGrant` below is the factory's own.
 */
export const jwks = sqliteTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
});

export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    disabled: integer("disabled", { mode: "boolean" }).default(false).notNull(),
    skipConsent: integer("skip_consent", { mode: "boolean" }),
    enableEndSession: integer("enable_end_session", { mode: "boolean" }),
    subjectType: text("subject_type"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts", { mode: "json" }).$type<string[]>(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris", {
      mode: "json",
    }).$type<string[]>(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    grantTypes: text("grant_types", { mode: "json" }).$type<string[]>(),
    responseTypes: text("response_types", { mode: "json" }).$type<string[]>(),
    public: integer("public", { mode: "boolean" }),
    type: text("type"),
    requirePKCE: integer("require_pkce", { mode: "boolean" }),
    referenceId: text("reference_id"),
    metadata: text("metadata", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
  },
  (table) => [index("oauth_client_userId_idx").on(table.userId)]
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    authTime: integer("auth_time", { mode: "timestamp_ms" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    index("oauth_refresh_token_clientId_idx").on(table.clientId),
    index("oauth_refresh_token_sessionId_idx").on(table.sessionId),
    index("oauth_refresh_token_userId_idx").on(table.userId),
  ]
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    refreshId: text("refresh_id"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
  },
  (table) => [
    index("oauth_access_token_clientId_idx").on(table.clientId),
    index("oauth_access_token_sessionId_idx").on(table.sessionId),
    index("oauth_access_token_userId_idx").on(table.userId),
    index("oauth_access_token_refreshId_idx").on(table.refreshId),
  ]
);

export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("oauth_consent_clientId_idx").on(table.clientId),
    index("oauth_consent_userId_idx").on(table.userId),
  ]
);

/**
 * Which organization an MCP token acts in.
 *
 * The access token carries a user and a client, never an org — so without this
 * row a valid token would have nothing to scope `/api/protected/*` to, and the tools
 * would have to trust a caller-supplied `organizationId`. Chosen once at
 * consent, re-checked against live membership on every request, and the only
 * live kill-switch for an issued token: deleting the row denies the client
 * before its (locally-verified, unrevokable) JWT expires.
 */
export const mcpOrganizationGrant = sqliteTable(
  "mcp_organization_grant",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("mcp_org_grant_client_user_idx").on(
      table.clientId,
      table.userId
    ),
    index("mcp_org_grant_organizationId_idx").on(table.organizationId),
  ]
);
