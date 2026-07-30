/**
 * An app is named before anyone knows what it is, so the name cannot be
 * derived from the prompt. Taking the opening words of "build me a todo app
 * that tracks…" produces a sentence fragment that then labels the app
 * everywhere, forever, next to a thread title drawn from the same sentence.
 *
 * A fixed list means every name a user can be given is one a person has read,
 * and a name that is obviously a placeholder invites renaming in a way a
 * plausible-looking fragment does not.
 */
const APP_NAMES = [
  "Aloof Penguin",
  "Bashful Meteor",
  "Brave Turnstile",
  "Brisk Marmot",
  "Buoyant Gargoyle",
  "Clumsy Falcon",
  "Cosmic Otter",
  "Crisp Manatee",
  "Curious Muffin",
  "Dapper Yeti",
  "Dizzy Lighthouse",
  "Drowsy Piston",
  "Earnest Yak",
  "Feral Spreadsheet",
  "Fluent Doorknob",
  "Frantic Hedgehog",
  "Frosty Umbrella",
  "Gentle Havoc",
  "Glib Sundial",
  "Grumpy Toaster",
  "Humble Tornado",
  "Idle Thunder",
  "Itchy Monocle",
  "Jaunty Radish",
  "Jolly Sasquatch",
  "Keen Mongoose",
  "Lofty Bagpipe",
  "Loud Cactus",
  "Lucid Pretzel",
  "Mild Panic",
  "Modest Volcano",
  "Murky Lantern",
  "Nimble Walrus",
  "Noble Sardine",
  "Opulent Sock",
  "Peppy Iceberg",
  "Plucky Gherkin",
  "Polite Goblin",
  "Prickly Sunbeam",
  "Quaint Boulder",
  "Restless Bagel",
  "Rogue Teapot",
  "Rowdy Turnip",
  "Rustic Dynamo",
  "Sassy Waffle",
  "Sleepy Comet",
  "Smug Barnacle",
  "Snappy Tortoise",
  "Solemn Noodle",
  "Somber Pancake",
  "Stout Ferret",
  "Sturdy Jellyfish",
  "Tepid Avalanche",
  "Tiny Kraken",
  "Unruly Crumpet",
  "Velvet Pigeon",
  "Vivid Wombat",
  "Whimsy Engine",
  "Wired Armadillo",
  "Wobbly Obelisk",
  "Yawning Trebuchet",
  "Zealous Dumpling",
  "Zesty Pelican",
] as const;

export const APP_NAME_MAX_LENGTH = 64;

/**
 * Avoiding names already in use is the point, not a refinement: with a fixed
 * pool, two apps in an organization collide sooner than intuition suggests,
 * and two rows reading "Sassy Waffle" is exactly the confusion the list is
 * meant to remove. Once the pool is exhausted, a repeat beats refusing to
 * create the app.
 */
export function pickAppName(taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) {
    used.add(name.trim().toLowerCase());
  }
  const free = APP_NAMES.filter((name) => !used.has(name.toLowerCase()));
  const pool = free.length > 0 ? free : APP_NAMES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? APP_NAMES[0];
}
