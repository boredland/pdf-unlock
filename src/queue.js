/**
 * queue.js
 *
 * Sequential job runner.
 *
 * Every potentially slow operation (reading a file, running qpdf) is wrapped in a task
 * function and appended to a single FIFO queue. `pump()` drains that queue one task at a
 * time, which guarantees:
 * - the single reusable wasm instance is never used concurrently, and
 * - files dropped while a batch is running are still processed, in order, afterwards.
 */

import { state } from "./state.js";
import { render } from "./render.js";

/**
 * Append a task to the queue and make sure the pump is running.
 *
 * @param {() => Promise<void>|void} task Work to execute once all earlier tasks finished.
 * @returns {void}
 */
export function enqueue(task) {
  // Append at the back so submission order is preserved.
  state.queue.push(task);
  // Kick the pump; it is a no-op if it is already draining.
  pump();
}

/**
 * Drain the queue serially, toggling the `processing` flag around the whole batch.
 *
 * A task that throws must not kill the batch, so each task is guarded individually; the
 * error is logged and the next task runs.
 *
 * @returns {Promise<void>} Resolves when the queue is empty again.
 */
export async function pump() {
  // Another pump is already draining the same queue — let it finish.
  if (state.processing) return;
  // Mark the batch as running (disables remove buttons, switches the status text).
  state.processing = true;
  // Reflect the busy state before the first task starts.
  render();

  // Keep taking the oldest task until the queue runs dry.
  // Tasks enqueued during this loop are picked up by the same while loop.
  while (state.queue.length > 0) {
    // Remove the head of the queue.
    const task = state.queue.shift();
    try {
      // Await the task so the next one never overlaps with it.
      await task();
    } catch (err) {
      // One failing task must not abort the remaining batch.
      console.error(err);
    }
  }

  // The batch is done; re-enable interaction.
  state.processing = false;
  // Final render shows the summary and the download links.
  render();
}
