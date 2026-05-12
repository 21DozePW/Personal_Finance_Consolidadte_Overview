import type { FxProvider } from "./types";
import { ExchangerateHostProvider } from "./exchangerate-host";
import { FrankfurterProvider } from "./frankfurter";

export * from "./types";
export { ExchangerateHostProvider } from "./exchangerate-host";
export { FrankfurterProvider } from "./frankfurter";

export type ProviderChain = {
  primary: FxProvider;
  fallback: FxProvider;
};

/**
 * Default provider chain for production: exchangerate.host as primary,
 * Frankfurter as fallback for the EUR/USD subset.
 */
export function defaultProviderChain(): ProviderChain {
  return {
    primary: new ExchangerateHostProvider(),
    fallback: new FrankfurterProvider(),
  };
}
