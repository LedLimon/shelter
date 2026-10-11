// The app's side of the outbox: `outbox.enqueue(tx, type, payload)`. The
// worker's side is ./dispatcher.ts.
export { enqueue, type EnqueueOptions } from "./enqueue";
export type {
  OutboxEventType,
  OutboxPayload,
  OutboxPayloadInput,
} from "./events";
