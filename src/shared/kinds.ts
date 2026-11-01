/**
 * What an entity does when the body acts on it.
 * An apple is gone once eating finishes. A chair is still there after a rest.
 */

export interface KindSpec {
  /** Name reported by the tool. */
  action: string;
  /** Seconds from untouched to finished. */
  duration: number;
  /** Visible changes before the action finishes. */
  stages: number;
  /** Take the entity out of the world, and out of later observations, when finished. */
  removes: boolean;
  /** How far above the ground the entity's origin sits. */
  rest: number;
}

export const KINDS: Record<string, KindSpec> = {
  apple: { action: 'eat', duration: 3, stages: 2, removes: true, rest: 0.34 },
  chair: { action: 'rest', duration: 2, stages: 0, removes: false, rest: 0 },
};

export function kindOf(kind: string): KindSpec | null {
  return KINDS[kind] ?? null;
}

/** Time slices the action is divided into. A pure wait, such as resting, has none. */
export function slicesOf(kind: KindSpec): number {
  return kind.stages + (kind.removes ? 1 : 0);
}
