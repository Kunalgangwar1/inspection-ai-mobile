import 'firebase/auth';
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
    setItem(key: string, value: string): Promise<void>;
  }

  function getReactNativePersistence(
    storage: ReactNativeAsyncStorage,
  ): Persistence;
}
