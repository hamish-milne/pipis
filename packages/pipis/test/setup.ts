import { afterEach } from 'vite-plus/test';
import { removeRoots } from './dom.ts';

// Every test mounts into the shared document, so leave it as found: an element left behind would colour the next test.
afterEach(removeRoots);
