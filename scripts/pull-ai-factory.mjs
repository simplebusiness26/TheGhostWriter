import {
  AiFactoryBridgeClient,
  aiFactoryBridgeConfigFromEnv,
  GhostWriterOrchestrator,
  PersistentMemoryStore,
  UniversalSessionIngestor,
  demoRecorder,
  demoStoryFinder,
  demoWriter,
  demoSecurityReviewer
} from "../dist/src/index.js";

const memoryPath = process.env.GHOSTWRITER_MEMORY_PATH || "data/ghost-writer-memory.json";
const store = new PersistentMemoryStore(memoryPath);
const orchestrator = new GhostWriterOrchestrator(store, {
  recorder: demoRecorder,
  storyFinder: demoStoryFinder,
  writer: demoWriter,
  securityReviewer: demoSecurityReviewer
});
const ingestor = new UniversalSessionIngestor(orchestrator);
const client = new AiFactoryBridgeClient(aiFactoryBridgeConfigFromEnv());

const result = await client.pullInto(ingestor, { markConsumed: true, limit: 50 });
console.log(JSON.stringify({
  ok: result.failed.length === 0,
  pulled: result.pulled,
  ingested: result.ingested,
  duplicates: result.duplicates,
  consumed: result.consumed,
  failed: result.failed,
  memoryPath: store.filePath
}, null, 2));

if (result.failed.length) process.exitCode = 1;
