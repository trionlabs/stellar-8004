// The main-worker API used here, from the runtime pinned in docker-compose.
// https://github.com/supabase/edge-runtime/blob/v1.71.2/types/global.d.ts
interface EdgeWorker {
  fetch(request: Request): Promise<Response>;
}

declare const EdgeRuntime: {
  userWorkers: {
    create(options: {
      servicePath: string;
      memoryLimitMb: number;
      workerTimeoutMs: number;
      noModuleCache: boolean;
      importMapPath: null;
      envVars: string[][];
    }): Promise<EdgeWorker>;
  };
};
