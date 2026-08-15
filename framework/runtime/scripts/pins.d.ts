export const KERNEL_VERSION: string;
export const PINS: Readonly<Record<string, string>>;
export const UNIVERSE_EXTRA_PINS: Readonly<Record<string, string>>;
export const STANDALONE_TOOL_PINS: Readonly<Record<string, string>>;
export const FORMAT_PINS: {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
};
