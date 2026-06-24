// nebula-ai-core: always-on infrastructure for the nebula harness.
export const VERSION = '0.0.0'

export * from './config'
export { formatCspr, MOTES_PER_CSPR } from './format'
export { casperChain, isMainnet, makeRpcClient, type CasperChain } from './chain'
export { agentPaths, placeholderAgentId } from './paths'

export type {
  NebulaEvent,
  EventPayload,
  EventSource,
  Listener,
  RouterDeps,
} from './events'
export { EventQueue, newEventId, listeners, routeLoop } from './events'

export type {
  ToolCall,
  ToolDef,
  ToolResult,
  ToolSchema,
  JSONSchema,
  FetchEscalation,
  EscalationDeps,
} from './tools'
export {
  ToolRegistry,
  zodToJsonSchema,
  coerceBool,
  coerceInt,
  detectFetchEscalation,
  mergeEscalationResult,
  runEscalation,
} from './tools'

export type {
  ApplyResult,
  CommandScope,
  CommandSurface,
  ParsedSlash,
  PermissionApi,
  PermissionToggleMode,
  SlashCommand,
} from './commands'
export {
  COMMAND_REGISTRY,
  applyPerms,
  applyYolo,
  commandsForSurface,
  findCommand,
  parseSlash,
  suggestForPrefix,
} from './commands'

export type {
  Brain,
  BrainCompactionEvent,
  BrainInferInput,
  BrainTurn,
  BrainMessage,
  BrainProvider,
  BrainProviderOpts,
  CompactionOpts,
  FrozenPrefix,
  HistoryPersist,
  FsHistoryPersistOpts,
  OpenAIBrainOpts,
  SummarizeFn,
} from './brain'
export {
  StubBrain,
  OpenAIBrain,
  DEFAULT_BASE_URL,
  DEMO_LLM_BASE_URL,
  DEMO_LLM_TOKEN,
  DEFAULT_MODEL,
  DEFAULT_CHANNEL_KEY,
  DEFAULT_MAX_OUTPUT_TOKENS,
  previewToolArgs,
  inferToolOk,
  buildFrozenPrefix,
  renderFrozenPrefix,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_COMPACTION_OPTS,
  SUMMARY_SYSTEM_PROMPT,
  estimateTokens,
  shouldCompact,
  compactHistory,
  createFsHistoryPersist,
  sanitizeChannelKey,
} from './brain'

export type {
  MemoryType,
  MemoryPartition,
  MemoryFrontmatter,
  MemoryTopic,
  MemoryIndexEntry,
  MemoryIndex,
  EditOp,
  EditAction,
  ThreatScanResult,
} from './memory'
export {
  parseTopic,
  stringifyTopic,
  scanForThreats,
  applyEdit,
  EditError,
  parseIndex,
  stringifyIndex,
  readIndexFile,
  writeIndexFile,
  addEntryLine,
  removeEntryLine,
  readTopic,
  writeTopic,
  topicPath,
  makeMemorySaveTool,
  type MemorySaveArgs,
  makeMemoryReadTool,
  type MemoryReadArgs,
  makeMemoryListTool,
  type MemoryListArgs,
  type MemoryListAgentFile,
  ensureSyntheticIndexEntries,
  STANDARD_SYNTHETIC_INDEX_FILES,
  type SyntheticIndexFile,
  type SyntheticIndexResult,
  INDEX_LINE_LIMIT,
  INDEX_BYTE_LIMIT,
  MEMORY_BLOB_VERSION,
  deriveMemoryKey,
  encryptMemoryBytes,
  decryptMemoryBytes,
  PACK_BLOB_VERSION,
  encodePackBlob,
  decodePackBlob,
  isV2Envelope,
  type PackBlob,
  type EncodePackOpts,
  gatherAgentPack,
  gatherUserPack,
  writeAgentPack,
  writeUserPack,
  type GatherResult,
} from './memory'

export type { Storage } from './storage'
export {
  LocalStubStorage,
  SqliteStorage,
  getStorage,
  downloadBlobByRoot,
  encrypt as encryptBytes,
  decrypt as decryptBytes,
  packEnvelope,
  unpackEnvelope,
  type EncryptedEnvelope,
} from './storage'

export {
  OPERATOR_KEYSTORE_VERSION,
  OPERATOR_BLOB_SCOPES,
  type OperatorBlobScope,
  encryptAgentKey,
  decryptAgentKey,
  encryptOperatorBlob,
  decryptOperatorBlob,
  encodeKeystoreBytes,
  decodeKeystoreBytes,
  encodeOperatorBlobBytes,
  decodeOperatorBlobBytes,
  sniffKeystoreVersion,
  deriveKeystoreKey,
  deriveBlobKey,
  tryDecryptKeystoreWithKey,
  tryDecryptOperatorBlobWithKey,
  type OperatorEncryptedKeystore,
  type OperatorEncryptedBlob,
  OPERATOR_SESSION_VERSION,
  DEFAULT_OPERATOR_SESSION_TTL_MS,
  type OperatorSession,
  type OperatorSessionKeys,
  type PrecomputeAllScopesOpts,
  type PrecomputeVerifyKey,
  operatorSessionPath,
  writeOperatorSession,
  readOperatorSession,
  clearOperatorSession,
  isOperatorSessionFresh,
  isOperatorSessionComplete,
  requiredScopesForAgent,
  getSessionKey,
  precomputeAllScopes,
  buildOperatorSession,
} from './wallet'

export type { AgentIdentity, IdentityProvider } from './identity'
export {
  StubIdentity,
  EXPLORER_BASE,
  type NetworkName,
  explorerTxUrl,
  explorerTokenUrl,
  saveKeystoreLocally,
} from './identity'

export {
  type OperatorAccount,
  type OperatorSigner,
  keystoreUnlockMessage,
  PrivkeyOperatorSigner,
  KeychainOperatorSigner,
  KeystoreFileOperatorSigner,
  RawPrivkeyOperatorSigner,
} from './operator'

export { Runtime, type RuntimeDeps, ActivityLog, type ActivityEntry } from './runtime'

export {
  acquireScopedLock,
  clearStaleScopedLock,
  DEFAULT_LOCK_TTL_SECONDS,
  type AcquireScopedLockOpts,
  type AcquireScopedLockResult,
  type ClearStaleScopedLockReason,
  type ClearStaleScopedLockResult,
  type ScopedLockHandle,
} from './locks'

export {
  PairingStore,
  PAIRING_ALPHABET,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_TTL_SECONDS,
  PAIRING_RATE_LIMIT_SECONDS,
  PAIRING_LOCKOUT_SECONDS,
  PAIRING_MAX_PENDING_PER_PLATFORM,
  PAIRING_MAX_FAILED_ATTEMPTS,
  type PairingStoreOpts,
  type PendingEntry,
  type ApprovedEntry,
  type PendingListing,
  type ApprovedListing,
  type ApproveResult,
} from './pairing'

export {
  encryptToPubkey,
  decryptWithPrivkey,
  generateBootstrapKeypair,
  type Option3Envelope,
} from './migration'

export {
  HookBus,
  type HookName,
  type HookHandler,
  type PreToolCallContext,
  type PreToolCallResult,
  type PostToolCallContext,
  loadPlugins,
  type PluginContext,
  type NativePlugin,
  type PluginLoadResult,
  type PluginLoaderDeps,
  type DelegateBrainFactory,
  type DelegateBrainFactoryOpts,
  type DelegateBrainHandle,
  type DelegateBrainTurn,
  type VisionInferFn,
  type VisionInferInput,
  type VisionInferImage,
  type VisionInferResult,
  makeToolSearchTool,
  type ToolSearchArgs,
} from './plugins'

export {
  detectDangerousCommand,
  DANGEROUS_PATTERNS,
  PathGuard,
  type PathGuardOpts,
  type PathGuardResult,
  redactEnv,
  type EnvRedactResult,
  PermissionService,
  type PermissionMode,
  type PermissionDecision,
  type PermissionRequest,
  type PermissionPrompter,
  type PermissionServiceOpts,
  type DangerousMatch,
} from './permission'

export type { SkillFrontmatter, SkillRef, SkillSource } from './skills'
export {
  scanSkills,
  parseFrontmatter as parseSkillFrontmatter,
  matchTriggers as matchSkillTriggers,
  matchFilePattern,
  matchBashPattern,
  type SkillScannerOptions,
  type SkillTriggerMatch,
} from './skills'

export {
  discoverMcpServers,
  McpManager,
  McpStdioClient,
  type McpDiscoveryOptions,
  type McpServerConfig,
  type McpServerStdio,
  type McpServerHttp,
  type McpToolMeta,
  type McpDiscoveryResult,
} from './mcp'

export {
  discoverClaudeExtras,
  type ClaudeExtrasOptions,
  type ClaudeCommand,
  type ClaudeAgent,
  type ClaudeExtrasDiscoveryResult,
} from './claude-plugins'

export {
  LocalBackend,
  MacOSSandboxExecBackend,
  DockerBackend,
  makeSandboxBackend,
  buildSeatbeltProfile,
  type SandboxBackend,
  type SandboxBackendOpts,
  type SandboxMode,
  type SandboxSpawnRequest,
  type WrappedSpawn,
  type SeatbeltProfileOpts,
  type MakeSandboxOpts,
  type DockerBackendOpts,
} from './sandbox'
