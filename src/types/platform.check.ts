// Type-level test, compiled by `tsc` and never run: every platform has exactly what the contract says, so the browser's build and the
// server's are interchangeable to the code above them. A name added to one and not the other is an error here.
import type { Platform } from '../pipis/platform.ts';
import * as client from '../pipis/platform.client.ts';
import * as hydrate from '../pipis/platform.hydrate.ts';
import * as server from '../pipis/platform.server.ts';

export const hydrating: Platform = hydrate;
export const browser: Platform = client;
export const node: Platform = server;
