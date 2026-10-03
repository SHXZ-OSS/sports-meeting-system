const BRAND_STYLE =
  "background:#4C80F8;color:#fff;padding:1px 4px;border-radius:3px";

export const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV)
    console.log(
      "%c[上海市行知中学运动会系统]%c DEBUG:",
      BRAND_STYLE,
      "color:#8c8c8c;font-weight:600",
      ...args,
    );
};

export const devInfo = (...args: unknown[]): void => {
  if (import.meta.env.DEV)
    console.info(
      "%c[上海市行知中学运动会系统]%c INFO:",
      BRAND_STYLE,
      "color:#1677ff;font-weight:600",
      ...args,
    );
};

export const devWarn = (...args: unknown[]): void => {
  if (import.meta.env.DEV)
    console.warn(
      "%c[上海市行知中学运动会系统]%c WARN:",
      BRAND_STYLE,
      "color:#d46b08;font-weight:600",
      ...args,
    );
};

export const devError = (...args: unknown[]): void => {
  if (import.meta.env.DEV)
    console.error(
      "%c[上海市行知中学运动会系统]%c ERROR:",
      BRAND_STYLE,
      "color:#cf1322;font-weight:600",
      ...args,
    );
};
