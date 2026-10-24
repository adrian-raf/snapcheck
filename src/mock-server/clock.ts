/** Injected instead of calling `new Date()` directly, so time-dependent rules are testable. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();
