import { factoryMarker } from "./factory/marker.ts";

if (factoryMarker !== 1) {
  throw new Error("expected factory marker");
}
