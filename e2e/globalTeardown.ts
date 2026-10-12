import lab2Teardown from "./lab-02/globalTeardown.js";
import lab3Teardown from "./lab-03/globalTeardown.js";
import lab4Teardown from "./lab-04/globalTeardown.js";

// One teardown for the whole suite (Playwright takes a single globalTeardown):
// each lab's own sweep, in turn, so neither lab's leftovers stay behind.
export default async function globalTeardown(): Promise<void> {
  await lab2Teardown();
  await lab3Teardown();
  await lab4Teardown();
}
