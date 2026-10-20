// Type-level test, compiled by `tsc` and never run: every platform has exactly what the contract says, so the browser's build and the
// server's are interchangeable to the code above them. A name added to one and not the other is an error here.
import type { Platform } from '../src/platform.ts';
import * as client from '../src/platform.client.ts';
import * as hydrate from '../src/platform.hydrate.ts';
import * as server from '../src/platform.server.ts';

export const hydrating: Platform = hydrate;
export const browser: Platform = client;
export const node: Platform = server;
