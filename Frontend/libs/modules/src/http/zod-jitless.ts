import { z } from 'zod';

// The Content-Security-Policy refuses eval, so zod's probe for it (`new Function("")`, run when
// the first object schema is built) would log a refusal on every page and bury real ones.
// Jitless skips the probe; zod then parses without its compiled fast path. It must run before any
// schema is built, so each app imports this from its instrumentation-client.ts.
z.config({ jitless: true });
