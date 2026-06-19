import { messages as enMessages } from "./en";

export type Locale = "en" | "ar";

type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}.${P}`
    : never
  : never;

type Paths<T> = T extends object
  ? {
      [K in keyof T]-?: K extends string | number
        ? T[K] extends object
          ? `${K}` | Join<K, Paths<T[K]>>
          : `${K}`
        : never;
    }[keyof T]
  : never;

export type MessageId = Paths<typeof enMessages>;
